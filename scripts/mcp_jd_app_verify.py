#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
京东 App 真机验证（Python + ada-mcp MCP stdio）。

与 Node 版等价：
  node scripts/mcp-jd-app-verify.mjs --server local

依赖：
  pip install -r scripts/requirements-mcp-verify.txt

用法：
  python scripts/mcp_jd_app_verify.py
  python scripts/mcp_jd_app_verify.py --probe
  python scripts/mcp_jd_app_verify.py --server local

前置（推荐手动常驻 Appium，少闪窗）：
  set APPIUM_HOME=D:\\WORKSPACE\\PLAN\\ada\\APPIUM_HOME
  npx appium --address 127.0.0.1 --port 4723
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

APP_SESSION = "jd-mcp-verify-app"
JD_APP_PACKAGE = "com.jingdong.app.mall"
JD_APP_ACTIVITY = ".MainFrameActivity"
DEFAULT_APPIUM_URL = "http://127.0.0.1:4723"
TIMEOUT_SEC = 360.0

_WIN_CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


@dataclass
class StepResult:
    name: str
    ok: bool
    detail: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _subprocess_kwargs() -> dict[str, Any]:
    kw: dict[str, Any] = {}
    if sys.platform == "win32" and _WIN_CREATE_NO_WINDOW:
        kw["creationflags"] = _WIN_CREATE_NO_WINDOW
    return kw


def adb_run(args: list[str], label: str) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        ["adb", *args],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
        **_subprocess_kwargs(),
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"{label} 失败: {err or proc.returncode}")
    return proc


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


async def call_tool(
    session: ClientSession,
    name: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    result = await asyncio.wait_for(session.call_tool(name, arguments), timeout=TIMEOUT_SEC)
    return parse_tool_payload(result)


def apply_local_mobile_env(env: dict[str, str], root: Path) -> None:
    android_home = os.environ.get("ANDROID_HOME", "").strip()
    if android_home and Path(android_home).is_dir():
        env["ANDROID_HOME"] = android_home
        env.setdefault("ANDROID_SDK_ROOT", android_home)
    for name in ("APPIUM_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT"):
        candidate = root / name
        if candidate.is_dir():
            env[name] = str(candidate)
            if name == "ANDROID_HOME":
                env["ANDROID_SDK_ROOT"] = str(candidate)


def build_server_params(server: str, root: Path, launcher_version: str) -> StdioServerParameters:
    env = {**os.environ}
    env["ADA_MCP_INSTALL_DEPS"] = "skip"
    env["ADA_MCP_SKIP_INSTALL_DEPS"] = "1"
    apply_local_mobile_env(env, root)

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
    return StdioServerParameters(
        command=pnpm,
        args=["dlx", spec],
        cwd=str(root),
        env=env,
    )


def preflight_android_device() -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            ["adb", "devices"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
            **_subprocess_kwargs(),
        )
    except FileNotFoundError:
        return False, "未找到 adb"
    lines = [ln.strip() for ln in proc.stdout.splitlines() if ln.strip()]
    devices = [ln for ln in lines[1:] if "\tdevice" in ln]
    if not devices:
        unauthorized = [ln for ln in lines[1:] if "\tunauthorized" in ln]
        if unauthorized:
            return False, "设备未授权 USB 调试"
        return False, "无已连接 Android 设备"
    return True, devices[0].split("\t")[0]


def preflight_jd_app_installed(app_package: str) -> None:
    proc = subprocess.run(
        ["adb", "shell", "pm", "list", "packages", app_package],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
        **_subprocess_kwargs(),
    )
    if app_package not in (proc.stdout or ""):
        raise RuntimeError(f"未安装 {app_package}")


def launch_jd_app_via_adb(app_package: str, app_activity: str, device_id: str) -> None:
    activity = app_activity if not app_activity.startswith(".") else app_activity
    component = f"{app_package}/{activity}"
    print(f"  [app] adb 启动京东: {component}")
    adb_run(["-s", device_id, "shell", "am", "start", "-W", "-n", component], "adb am start")


def app_payload_base(
    *,
    app_package: str,
    app_activity: str,
    appium_url: str,
    device_id: str,
) -> dict[str, Any]:
    activity = (
        f"{app_package}{app_activity}" if app_activity.startswith(".") else app_activity
    )
    return {
        "real": True,
        "serverUrl": appium_url,
        "capabilities": {
            "platformName": "Android",
            "appium:automationName": "UiAutomator2",
            "appium:deviceName": "Android",
            "appium:udid": device_id,
            "appium:noReset": True,
            "appium:fullReset": False,
            "appium:autoLaunch": False,
            "appium:appPackage": app_package,
            "appium:appActivity": activity,
            "appium:appWaitActivity": "*",
            "appium:appWaitDuration": 30000,
            "appium:ignoreHiddenApiPolicyError": True,
            "appium:newCommandTimeout": 300,
        },
    }


async def swipe_once(
    session: ClientSession,
    *,
    ts: str,
    index: int,
    base: dict[str, Any],
    allow_mock: bool,
    steps: list[StepResult],
) -> None:
    print(f"  [app] swipe_right_{index} …")
    data = await call_tool(
        session,
        "ada_mobile_action",
        {
            "platform": "android",
            "command": "swipe",
            "sessionId": APP_SESSION,
            "requestId": f"jd-app-swipe-{ts}-{index}",
            "allowMock": allow_mock,
            "payload": {**base, "from": [0.2, 0.5], "to": [0.8, 0.5]},
        },
    )
    assert_success(data, f"swipe_right_{index}", allow_mock=allow_mock)
    steps.append(StepResult(name=f"swipe_right_{index}", ok=True))


async def run_verify(args: argparse.Namespace) -> list[StepResult]:
    root = repo_root()
    out_dir = Path(args.output_dir)
    if not out_dir.is_absolute():
        out_dir = root / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    shot1 = out_dir / f"jd-mcp-app-{ts}-1.png"
    shot2 = out_dir / f"jd-mcp-app-{ts}-2.png"
    steps: list[StepResult] = []

    print(
        f"[app] MCP server={args.server}  package={args.app_package}  "
        f"activity={args.app_activity}\n"
    )

    params = build_server_params(args.server, root, args.launcher_version)

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await asyncio.wait_for(session.initialize(), timeout=120)

            print("  [app] probe …")
            probe = await call_tool(
                session,
                "ada_mobile_action",
                {
                    "platform": "android",
                    "command": "swipe",
                    "sessionId": APP_SESSION,
                    "requestId": f"jd-app-probe-{ts}",
                    "allowMock": True,
                    "payload": {"probe": True},
                },
            )
            steps.append(StepResult(name="probe", ok=True, detail=probe))

            if args.probe:
                print("  [app] --probe：仅探活\n")
                return steps

            ok, dev_msg = preflight_android_device()
            if not ok:
                raise RuntimeError(f"真机检查: {dev_msg}")
            print(f"  [app] 设备: {dev_msg}")

            preflight_jd_app_installed(args.app_package)

            if args.install_mobile_deps:
                print("  [app] install_mobile_deps（可能闪 cmd）…")
                await call_tool(
                    session,
                    "ada_install_deps",
                    {"only": "mobile", "force": False},
                )

            if not args.skip_adb_launch:
                launch_jd_app_via_adb(args.app_package, args.app_activity, dev_msg)
                await asyncio.sleep(2)

            base = app_payload_base(
                app_package=args.app_package,
                app_activity=args.app_activity,
                appium_url=args.appium_url,
                device_id=dev_msg,
            )

            print("  [app] 创建会话并截图 …")
            open_shot = await call_tool(
                session,
                "ada_mobile_action",
                {
                    "platform": "android",
                    "command": "screenshot",
                    "sessionId": APP_SESSION,
                    "requestId": f"jd-app-open-{ts}",
                    "allowMock": args.allow_mock,
                    "payload": {**base, "screenshotPath": str(shot1)},
                },
            )
            assert_success(open_shot, "screenshot_home", allow_mock=args.allow_mock)
            path1 = (open_shot.get("data") or {}).get("screenshot") or str(shot1)
            steps.append(StepResult(name="screenshot_home", ok=True, detail={"screenshot": path1}))
            print(f"  [app] 截图1: {path1}")

            await asyncio.sleep(args.app_wait_ms / 1000)

            for i in range(2):
                idx = i + 1
                try:
                    await swipe_once(
                        session,
                        ts=ts,
                        index=idx,
                        base=base,
                        allow_mock=args.allow_mock,
                        steps=steps,
                    )
                except Exception:
                    print(f"  [app] swipe_right_{idx} 失败，等待后重试一次…", file=sys.stderr)
                    await asyncio.sleep(1.5)
                    await swipe_once(
                        session,
                        ts=ts,
                        index=idx,
                        base=base,
                        allow_mock=args.allow_mock,
                        steps=steps,
                    )
                await asyncio.sleep(0.5)

            print("  [app] 滑动后截图 …")
            shot2_data = await call_tool(
                session,
                "ada_mobile_action",
                {
                    "platform": "android",
                    "command": "screenshot",
                    "sessionId": APP_SESSION,
                    "requestId": f"jd-app-shot2-{ts}",
                    "allowMock": args.allow_mock,
                    "payload": {**base, "screenshotPath": str(shot2)},
                },
            )
            assert_success(shot2_data, "screenshot_after_swipe", allow_mock=args.allow_mock)
            path2 = (shot2_data.get("data") or {}).get("screenshot") or str(shot2)
            steps.append(
                StepResult(name="screenshot_after_swipe", ok=True, detail={"screenshot": path2})
            )
            print(f"  [app] 截图2: {path2}")

    return steps


def main() -> int:
    parser = argparse.ArgumentParser(
        description="京东 App 真机 ada-mcp 验证（与 mcp-jd-app-verify.mjs 等价）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--probe", action="store_true", help="仅 Appium 探活")
    parser.add_argument(
        "--server",
        choices=("local", "dev", "npm"),
        default="local",
        help="MCP 入口，默认 local",
    )
    parser.add_argument(
        "--install-mobile-deps",
        action="store_true",
        help="经 MCP 安装 mobile 依赖（仅首次）",
    )
    parser.add_argument("--allow-mock", action="store_true")
    parser.add_argument("--skip-adb-launch", action="store_true", help="不先用 adb 启京东")
    parser.add_argument(
        "--app-package",
        default=os.environ.get("ADA_JD_APP_PACKAGE", JD_APP_PACKAGE),
    )
    parser.add_argument(
        "--app-activity",
        default=os.environ.get("ADA_JD_APP_ACTIVITY", JD_APP_ACTIVITY),
    )
    parser.add_argument(
        "--appium-url",
        default=os.environ.get("ADA_APPIUM_URL", DEFAULT_APPIUM_URL),
    )
    parser.add_argument("--app-wait-ms", type=int, default=4000)
    parser.add_argument("--output-dir", default="artifacts")
    parser.add_argument(
        "--launcher-version",
        default=os.environ.get("ADA_MCP_LAUNCHER_VERSION", "0.1.27"),
    )
    args = parser.parse_args()

    try:
        steps = asyncio.run(run_verify(args))
        ok = all(s.ok for s in steps)
        print("\n[app] 完成\n")
        print(json.dumps({"ok": ok, "steps": [{"name": s.name, "ok": s.ok} for s in steps]}, ensure_ascii=False))
        return 0 if ok else 1
    except Exception as exc:
        print(json.dumps({"ok": False, "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        root = repo_root()
        print(
            f"""
[排查]
  1) 手动启动 Appium:
     set APPIUM_HOME={root / "APPIUM_HOME"}
     npx appium --address 127.0.0.1 --port 4723
  2) adb devices 显示 device
  3) python scripts/mcp_jd_app_verify.py --server local
  4) Node 等价: node scripts/mcp-jd-app-verify.mjs --server local""",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
