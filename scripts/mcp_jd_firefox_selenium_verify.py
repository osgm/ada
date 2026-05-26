#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地 Firefox 打开京东首页（ada-mcp + Selenium + GeckoDriver）。

与 Playwright 版 mcp_jd_firefox_verify.py 对照：
  - 本脚本：engine=selenium，GeckoDriver 驱动系统 Firefox，-profile 挂载系统 Profile
  - Playwright 版：engine=playwright（默认），Playwright 控制浏览器进程

默认使用：
  - 本机安装的 Firefox（非 Playwright 自带）
  - 系统默认 Profile（含历史记录、Cookie、缓存）

依赖：
  pip install -r scripts/requirements-mcp-verify.txt
  GeckoDriver：npm run install:selenium 或 --install-selenium-deps

用法：
  python scripts/mcp_jd_firefox_selenium_verify.py --server local
  python scripts/mcp_jd_firefox_selenium_verify.py --install-selenium-deps

注意：使用系统 Profile 前请先关闭已运行的 Firefox。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# 复用 Playwright 版 Firefox / Profile 检测
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mcp_jd_firefox_verify import (  # noqa: E402
    assert_success,
    detect_firefox_default_profile,
    detect_local_firefox,
    is_firefox_profile_locked,
    parse_tool_payload,
    repo_root,
    warn_or_clean_stale_profile_locks,
)

JD_WEB_URL = "https://www.jd.com"
WEB_SESSION = "jd-mcp-verify-firefox-selenium"
TIMEOUT_SEC = 360.0


@dataclass
class StepResult:
    name: str
    ok: bool
    error: str | None = None


def resolve_profile_dir(args: argparse.Namespace, root: Path) -> Path:
    if args.fresh_profile:
        profile = root / "artifacts" / "firefox-jd-profile-selenium"
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


def find_geckodriver(root: Path) -> Path | None:
    drivers_dir = Path(os.environ.get("ADA_DRIVERS_DIR", str(root / "dirver")))
    names = ["geckodriver.exe", "geckodriver"] if sys.platform == "win32" else ["geckodriver"]
    for name in names:
        candidate = drivers_dir / name
        if candidate.is_file():
            return candidate
    return None


def apply_selenium_env(env: dict[str, str], firefox: Path, profile_dir: Path) -> None:
    env["ADA_SELENIUM_BROWSER"] = "firefox"
    env["ADA_SELENIUM_BROWSER_BINARY"] = str(firefox)
    env["ADA_SELENIUM_PROFILE"] = str(profile_dir)
    drivers_dir = repo_root() / "dirver"
    if drivers_dir.is_dir():
        env.setdefault("ADA_DRIVERS_DIR", str(drivers_dir))


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
        return StdioServerParameters(
            command=os.environ.get("ADA_NODE", "node"),
            args=[str(cli_cjs)],
            cwd=str(root),
            env=env,
        )

    pnpm = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
    spec = f"@ada-mcp/launcher@{launcher_version}"
    return StdioServerParameters(command=pnpm, args=["dlx", spec], cwd=str(root), env=env)


def selenium_payload(
    *,
    headless: bool,
    firefox_path: str,
    profile_dir: str,
) -> dict[str, Any]:
    return {
        "engine": "selenium",
        "browser": "firefox",
        "browserName": "firefox",
        "browserBinary": firefox_path,
        "profile": profile_dir,
        "headless": headless,
    }


def web_action(
    *,
    command: str,
    ts: str,
    step: str,
    base: dict[str, Any],
    allow_mock: bool,
    extra_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {**base, **(extra_payload or {})}
    return {
        "engine": "selenium",
        "command": command,
        "sessionId": WEB_SESSION,
        "requestId": f"jd-ff-sel-{step}-{ts}",
        "allowMock": allow_mock,
        "payload": payload,
    }


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
            "未找到本地 Firefox，请安装 Firefox 或通过 --firefox-path / ADA_SELENIUM_BROWSER_BINARY 指定"
        )

    profile_dir = resolve_profile_dir(args, root)
    if not profile_dir.is_dir() and not args.fresh_profile:
        raise RuntimeError(f"Profile 目录不存在: {profile_dir}")

    if not args.fresh_profile and is_firefox_profile_locked(profile_dir):
        raise RuntimeError(
            f"Firefox 正在运行，Profile 被占用: {profile_dir}\n"
            "请先完全关闭 Firefox 后再运行本脚本。"
        )
    if not args.fresh_profile:
        warn_or_clean_stale_profile_locks(
            profile_dir, clean=args.clean_stale_lock, tag="selenium"
        )

    gecko = find_geckodriver(root)
    if not gecko and not args.install_selenium_deps:
        print(
            f"  [selenium] 警告: 未在 {root / 'dirver'} 找到 geckodriver，"
            "可运行 --install-selenium-deps 或手动下载",
            file=sys.stderr,
        )

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    shot_path = out_dir / f"jd-mcp-firefox-selenium-{ts}.png"
    steps: list[StepResult] = []
    base = selenium_payload(
        headless=args.headless,
        firefox_path=str(firefox),
        profile_dir=str(profile_dir),
    )

    print(f"[selenium] MCP server={args.server}")
    print(f"[selenium] engine=selenium  Firefox: {firefox}")
    print(f"[selenium] Profile: {profile_dir}" + ("（隔离 profile）" if args.fresh_profile else "（系统 profile，含历史缓存）"))
    if gecko:
        print(f"[selenium] GeckoDriver: {gecko}")
    print(f"[selenium] 打开: {JD_WEB_URL}\n")

    extra_env: dict[str, str] = {}
    apply_selenium_env(extra_env, firefox, profile_dir)
    params = build_server_params(args.server, root, args.launcher_version, extra_env=extra_env)

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await asyncio.wait_for(session.initialize(), timeout=120)

            async def step(name: str, tool: str, arguments: dict[str, Any]) -> dict[str, Any]:
                print(f"  [selenium] {name} …")
                data = await call_tool(session, tool, arguments)
                assert_success(data, name, allow_mock=args.allow_mock)
                steps.append(StepResult(name=name, ok=True))
                return data

            await step("health", "ada_health", {})

            if args.install_selenium_deps:
                print("  [selenium] install selenium deps（下载 geckodriver）…")
                await call_tool(
                    session,
                    "ada_install_deps",
                    {
                        "only": "selenium",
                        "geckodriverVersion": args.geckodriver_version or "latest",
                        "chromedriverVersion": "skip",
                    },
                )

            await step(
                "navigate",
                "ada_web_action",
                web_action(
                    command="navigate",
                    ts=ts,
                    step="nav",
                    base=base,
                    allow_mock=args.allow_mock,
                    extra_payload={"url": JD_WEB_URL},
                ),
            )
            await step(
                "wait_after_load",
                "ada_web_action",
                web_action(
                    command="wait",
                    ts=ts,
                    step="wait",
                    base=base,
                    allow_mock=args.allow_mock,
                    extra_payload={"timeoutMs": args.web_wait_ms},
                ),
            )
            shot = await step(
                "screenshot",
                "ada_web_action",
                web_action(
                    command="screenshot",
                    ts=ts,
                    step="shot",
                    base=base,
                    allow_mock=args.allow_mock,
                    extra_payload={"screenshotPath": str(shot_path)},
                ),
            )
            path = (shot.get("data") or {}).get("screenshotPath") or str(shot_path)
            print(f"  [selenium] 截图: {path}")

            try:
                await step(
                    "close_session",
                    "ada_close_session",
                    {"platform": "web", "sessionId": WEB_SESSION, "engine": "selenium"},
                )
            except Exception:
                pass

    return steps


def main() -> int:
    parser = argparse.ArgumentParser(
        description="本地 Firefox 打开京东首页（ada-mcp + Selenium + GeckoDriver）"
    )
    parser.add_argument("--allow-mock", action="store_true")
    parser.add_argument("--headless", action="store_true", help="无头模式（默认有界面）")
    parser.add_argument("--firefox-path", default="", help="Firefox 可执行文件路径")
    profile = parser.add_mutually_exclusive_group()
    profile.add_argument(
        "--user-data-dir",
        default="",
        help="Firefox Profile 目录（默认自动使用系统 default profile）",
    )
    profile.add_argument(
        "--fresh-profile",
        action="store_true",
        help="使用隔离 profile（artifacts/firefox-jd-profile-selenium）",
    )
    parser.add_argument(
        "--clean-stale-lock",
        action="store_true",
        help="Firefox 未运行时删除 Profile 残留 parent.lock 等锁文件",
    )
    parser.add_argument("--output-dir", default="artifacts")
    parser.add_argument("--web-wait-ms", type=int, default=5000)
    parser.add_argument(
        "--install-selenium-deps",
        action="store_true",
        help="经 MCP 下载 geckodriver 到 dirver/",
    )
    parser.add_argument("--geckodriver-version", default="", help="如 latest、0.36.0")
    parser.add_argument(
        "--server",
        choices=("local", "dev", "npm"),
        default="local",
        help="MCP 入口，默认 local",
    )
    parser.add_argument(
        "--launcher-version",
        default=os.environ.get("ADA_MCP_LAUNCHER_VERSION", "0.1.28"),
    )
    args = parser.parse_args()

    try:
        steps = asyncio.run(run_verify(args))
        ok = all(s.ok for s in steps)
        print("\n[selenium] 完成\n")
        print(json.dumps({"ok": ok, "steps": [{"name": s.name, "ok": s.ok} for s in steps]}, ensure_ascii=False))
        return 0 if ok else 1
    except Exception as exc:
        print(json.dumps({"ok": False, "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        root = repo_root()
        print(
            f"""
[排查]
  1) 使用系统 Profile 前先完全关闭 Firefox
  2) 安装 GeckoDriver: python scripts/mcp_jd_firefox_selenium_verify.py --install-selenium-deps
     或 npx tsx apps/ada-agent/src/main.ts install-deps --only=selenium
  3) 确认 dirver/geckodriver.exe 存在，或 geckodriver 在 PATH 中
  4) 本地 bundle: npm run build:npm -w @ada-mcp/mcp-server
  5) python scripts/mcp_jd_firefox_selenium_verify.py --server local
  6) Playwright 对照: python scripts/mcp_jd_firefox_verify.py --server local
""",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
