#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地 Firefox 打开京东首页（ada-mcp + Playwright）。

默认使用：
  - 本机安装的 Firefox（非 Playwright 自带浏览器）
  - 系统默认 Profile（含历史记录、Cookie、缓存）

依赖：
  pip install -r scripts/requirements-mcp-verify.txt

用法：
  python scripts/mcp_jd_firefox_verify.py
  python scripts/mcp_jd_firefox_verify.py --server local
  python scripts/mcp_jd_firefox_verify.py --user-data-dir "%APPDATA%\\Mozilla\\Firefox\\Profiles\\xxxx.default-release"
  python scripts/mcp_jd_firefox_verify.py --fresh-profile   # 隔离 profile，无历史缓存

注意：使用系统 Profile 前请先关闭已运行的 Firefox（否则会因 profile 锁定而失败）。
"""

from __future__ import annotations

import argparse
import asyncio
import configparser
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

JD_WEB_URL = "https://www.jd.com"
WEB_SESSION = "jd-mcp-verify-firefox"
TIMEOUT_SEC = 360.0


@dataclass
class StepResult:
    name: str
    ok: bool
    error: str | None = None


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def parse_tool_payload(result: Any) -> dict[str, Any]:
    if getattr(result, "isError", False):
        parts = [getattr(b, "text", "") for b in result.content or [] if getattr(b, "text", None)]
        raise RuntimeError("MCP tool error: " + ("\n".join(parts) or "unknown"))
    texts = [getattr(b, "text", "") for b in result.content or [] if getattr(b, "text", None)]
    raw = "\n".join(texts).strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except json.JSONDecodeError:
        return {"raw": raw}


def assert_success(data: dict[str, Any], step: str, *, allow_mock: bool = False) -> None:
    if data.get("success") is False:
        raise RuntimeError(
            f"{step} failed: {data.get('errorCode') or ''} {data.get('errorMessage') or data}"
        )
    inner = data.get("data") if isinstance(data.get("data"), dict) else {}
    if not allow_mock and inner.get("mode") == "mock" and inner.get("reason"):
        raise RuntimeError(f"{step} fell back to mock: {inner.get('reason')}")


def detect_local_firefox() -> Path | None:
    env = os.environ.get("ADA_PLAYWRIGHT_EXECUTABLE_PATH", "").strip()
    if env and Path(env).is_file():
        return Path(env)

    if sys.platform == "win32":
        candidates = [
            Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
            / "Mozilla Firefox"
            / "firefox.exe",
            Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"))
            / "Mozilla Firefox"
            / "firefox.exe",
        ]
    elif sys.platform == "darwin":
        candidates = [Path("/Applications/Firefox.app/Contents/MacOS/firefox")]
    else:
        candidates = [
            Path("/usr/bin/firefox"),
            Path("/usr/local/bin/firefox"),
            Path("/snap/bin/firefox"),
        ]

    for path in candidates:
        if path.is_file():
            return path
    return None


def detect_firefox_profiles_root() -> Path | None:
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA", "").strip()
        if appdata:
            root = Path(appdata) / "Mozilla" / "Firefox"
            if (root / "profiles.ini").is_file():
                return root
    elif sys.platform == "darwin":
        root = Path.home() / "Library" / "Application Support" / "Firefox"
        if (root / "profiles.ini").is_file():
            return root
    else:
        root = Path.home() / ".mozilla" / "firefox"
        if (root / "profiles.ini").is_file():
            return root
    return None


def _resolve_profile_path(firefox_root: Path, path_value: str, *, is_relative: bool) -> Path:
    profile = firefox_root / path_value if is_relative else Path(path_value)
    return profile.expanduser()


def detect_firefox_default_profile() -> Path | None:
    firefox_root = detect_firefox_profiles_root()
    if not firefox_root:
        return None

    ini_path = firefox_root / "profiles.ini"
    config = configparser.RawConfigParser()
    config.read(ini_path, encoding="utf-8")

    for section in config.sections():
        if section.startswith("Profile") and config.get(section, "Default", fallback="0") == "1":
            path_value = config.get(section, "Path", fallback="").strip()
            if path_value:
                is_relative = config.get(section, "IsRelative", fallback="1") == "1"
                return _resolve_profile_path(firefox_root, path_value, is_relative=is_relative)

    for section in config.sections():
        if section.startswith("Install") and config.has_option(section, "Default"):
            path_value = config.get(section, "Default", fallback="").strip()
            if path_value:
                return _resolve_profile_path(firefox_root, path_value, is_relative=True)

    for section in config.sections():
        if section.startswith("Profile"):
            path_value = config.get(section, "Path", fallback="").strip()
            if path_value:
                is_relative = config.get(section, "IsRelative", fallback="1") == "1"
                return _resolve_profile_path(firefox_root, path_value, is_relative=is_relative)
    return None


def is_firefox_profile_locked(profile_dir: Path) -> bool:
    return (profile_dir / "parent.lock").exists() or (profile_dir / ".parentlock").exists()


def apply_firefox_env(env: dict[str, str], firefox: Path, profile_dir: Path) -> None:
    env["PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH"] = str(firefox)
    env["ADA_PLAYWRIGHT_EXECUTABLE_PATH"] = str(firefox)
    env["ADA_PLAYWRIGHT_BROWSER"] = "firefox"
    env["ADA_PLAYWRIGHT_USER_DATA_DIR"] = str(profile_dir)


def build_server_params(
    server: str,
    root: Path,
    launcher_version: str,
    *,
    extra_env: dict[str, str] | None = None,
) -> StdioServerParameters:
    env = {**os.environ}
    if extra_env:
        env.update(extra_env)
    env.setdefault("ADA_MCP_INSTALL_DEPS", "skip")
    env["ADA_MCP_SKIP_INSTALL_DEPS"] = "1"

    if server == "dev":
        cli_ts = root / "apps" / "ada-mcp-server" / "src" / "cli.ts"
        tsx = root / "node_modules" / "tsx" / "dist" / "cli.mjs"
        if not cli_ts.is_file():
            raise FileNotFoundError(f"dev 入口不存在: {cli_ts}")
        if not tsx.is_file():
            raise FileNotFoundError(f"未找到 tsx: {tsx}\n请先 npm install")
        env["ADA_MCP_SERVER_ENTRY"] = str(cli_ts)
        return StdioServerParameters(
            command=os.environ.get("ADA_NODE", "node"),
            args=[str(tsx), str(cli_ts)],
            cwd=str(root),
            env=env,
        )

    if server == "local":
        cli_cjs = root / "apps" / "ada-mcp-server" / "dist" / "cli.cjs"
        if not cli_cjs.is_file():
            raise FileNotFoundError(
                f"本地 bundle 不存在: {cli_cjs}\n请先: npm run build:npm -w @ada-mcp/mcp-server"
            )
        env["ADA_MCP_SERVER_ENTRY"] = str(cli_cjs)
        env["ADA_MCP_SKIP_INSTALL_DEPS"] = "1"
        return StdioServerParameters(
            command=os.environ.get("ADA_NODE", "node"),
            args=[str(cli_cjs)],
            cwd=str(root),
            env=env,
        )

    pnpm = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
    spec = f"@ada-mcp/launcher@{launcher_version}"
    return StdioServerParameters(command=pnpm, args=["dlx", spec], cwd=str(root), env=env)


def web_payload(
    *,
    headless: bool,
    firefox_path: str,
    user_data_dir: str,
) -> dict[str, Any]:
    return {
        "browser": "firefox",
        "headless": headless,
        "keepSession": True,
        "executablePath": firefox_path,
        "userDataDir": user_data_dir,
        "launchOptions": {
            "firefoxUserPrefs": {
                "browser.sessionstore.resume_from_crash": False,
            }
        },
    }


def resolve_profile_dir(args: argparse.Namespace, root: Path) -> Path:
    if args.fresh_profile:
        profile = root / "artifacts" / "firefox-jd-profile"
        profile.mkdir(parents=True, exist_ok=True)
        return profile

    if args.user_data_dir:
        profile = Path(os.path.expandvars(args.user_data_dir)).expanduser()
        if not profile.is_absolute():
            profile = root / profile
        return profile

    detected = detect_firefox_default_profile()
    if detected and detected.is_dir():
        return detected

    raise RuntimeError(
        "未找到 Firefox 系统默认 Profile。"
        "请确认已用 Firefox 登录过，或通过 --user-data-dir 指定 Profile 目录。"
    )


async def call_tool(session: ClientSession, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    result = await asyncio.wait_for(session.call_tool(name, arguments), timeout=TIMEOUT_SEC)
    return parse_tool_payload(result)


async def run_verify(args: argparse.Namespace) -> list[StepResult]:
    root = repo_root()
    out_dir = Path(args.output_dir)
    if not out_dir.is_absolute():
        out_dir = root / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    firefox = Path(args.firefox_path) if args.firefox_path else detect_local_firefox()
    if not firefox or not firefox.is_file():
        raise RuntimeError(
            "未找到本地 Firefox，请安装 Firefox 或通过 --firefox-path / ADA_PLAYWRIGHT_EXECUTABLE_PATH 指定"
        )

    profile_dir = resolve_profile_dir(args, root)
    if not profile_dir.is_dir():
        raise RuntimeError(f"Profile 目录不存在: {profile_dir}")

    if not args.fresh_profile and is_firefox_profile_locked(profile_dir):
        raise RuntimeError(
            f"Firefox Profile 已被占用（可能 Firefox 正在运行）: {profile_dir}\n"
            "请先完全关闭 Firefox 后再运行本脚本。"
        )

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    shot_path = out_dir / f"jd-mcp-firefox-{ts}.png"
    steps: list[StepResult] = []
    base = web_payload(
        headless=args.headless,
        firefox_path=str(firefox),
        user_data_dir=str(profile_dir),
    )

    print(f"[firefox] MCP server={args.server}")
    print(f"[firefox] 可执行文件: {firefox}")
    print(f"[firefox] Profile: {profile_dir}" + ("（隔离 profile，无历史）" if args.fresh_profile else "（系统 profile，含历史缓存）"))
    print(f"[firefox] 打开: {JD_WEB_URL}\n")

    extra_env: dict[str, str] = {}
    apply_firefox_env(extra_env, firefox, profile_dir)
    params = build_server_params(args.server, root, args.launcher_version, extra_env=extra_env)

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await asyncio.wait_for(session.initialize(), timeout=120)

            async def step(name: str, tool: str, arguments: dict[str, Any]) -> dict[str, Any]:
                print(f"  [firefox] {name} …")
                data = await call_tool(session, tool, arguments)
                assert_success(data, name, allow_mock=args.allow_mock)
                steps.append(StepResult(name=name, ok=True))
                return data

            await step("health", "ada_health", {})
            await step(
                "navigate",
                "ada_web_action",
                {
                    "command": "navigate",
                    "sessionId": WEB_SESSION,
                    "requestId": f"jd-ff-nav-{ts}",
                    "allowMock": args.allow_mock,
                    "payload": {**base, "url": JD_WEB_URL},
                },
            )
            await step(
                "wait_after_load",
                "ada_web_action",
                {
                    "command": "wait",
                    "sessionId": WEB_SESSION,
                    "requestId": f"jd-ff-wait-{ts}",
                    "allowMock": args.allow_mock,
                    "payload": {**base, "timeoutMs": args.web_wait_ms},
                },
            )
            shot = await step(
                "screenshot",
                "ada_web_action",
                {
                    "command": "screenshot",
                    "sessionId": WEB_SESSION,
                    "requestId": f"jd-ff-shot-{ts}",
                    "allowMock": args.allow_mock,
                    "payload": {**base, "fullPage": False, "screenshotPath": str(shot_path)},
                },
            )
            path = (shot.get("data") or {}).get("screenshot") or str(shot_path)
            print(f"  [firefox] 截图: {path}")

            try:
                await step(
                    "close_session",
                    "ada_close_session",
                    {"platform": "web", "sessionId": WEB_SESSION, "engine": "playwright"},
                )
            except Exception:
                pass

    return steps


def main() -> int:
    parser = argparse.ArgumentParser(description="本地 Firefox 打开京东首页（ada-mcp）")
    parser.add_argument("--allow-mock", action="store_true")
    parser.add_argument("--headless", action="store_true", help="无头模式（默认有界面）")
    parser.add_argument("--firefox-path", default="", help="Firefox 可执行文件路径（默认自动检测本机安装）")
    profile = parser.add_mutually_exclusive_group()
    profile.add_argument(
        "--user-data-dir",
        default="",
        help="Firefox Profile 目录（默认自动使用系统 default profile）",
    )
    profile.add_argument(
        "--fresh-profile",
        action="store_true",
        help="使用隔离 profile（artifacts/firefox-jd-profile），不含历史缓存",
    )
    parser.add_argument("--output-dir", default="artifacts")
    parser.add_argument("--web-wait-ms", type=int, default=5000)
    parser.add_argument(
        "--server",
        choices=("local", "dev", "npm"),
        default="local",
        help="MCP 入口，默认 local",
    )
    parser.add_argument(
        "--launcher-version",
        default=os.environ.get("ADA_MCP_LAUNCHER_VERSION", "0.1.27"),
    )
    args = parser.parse_args()

    try:
        steps = asyncio.run(run_verify(args))
        ok = all(s.ok for s in steps)
        print("\n[firefox] 完成\n")
        print(json.dumps({"ok": ok, "steps": [{"name": s.name, "ok": s.ok} for s in steps]}, ensure_ascii=False))
        return 0 if ok else 1
    except Exception as exc:
        print(json.dumps({"ok": False, "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        print(
            """
[排查]
  1) 使用系统 Profile 前先完全关闭 Firefox
  2) 确认本机已安装 Firefox（非 Playwright 下载包）
  3) 本地 bundle: npm run build:npm -w @ada-mcp/mcp-server
  4) python scripts/mcp_jd_firefox_verify.py --server local
  5) 手动指定 Profile:
     --user-data-dir "%APPDATA%\\Mozilla\\Firefox\\Profiles\\xxxx.default-release"
""",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
