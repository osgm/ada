#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
京东 Web 首页验证：经 MCP stdio 调用 ada-mcp（Playwright）。

App 真机验证请用（与 Node 版等价）：
  python scripts/mcp_jd_app_verify.py --server local
  node scripts/mcp-jd-app-verify.mjs --server local

依赖：
  pip install -r scripts/requirements-mcp-verify.txt

用法：
  python scripts/ada_mcp_jd_verify.py
  python scripts/ada_mcp_jd_verify.py --server dev
  python scripts/ada_mcp_jd_verify.py --server local
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

JD_WEB_URL = "https://www.jd.com"
WEB_SESSION = "jd-mcp-verify-web"


@dataclass
class StepResult:
    name: str
    ok: bool
    error: str | None = None


@dataclass
class VerifyReport:
    steps: list[StepResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.steps) and all(s.ok for s in self.steps)


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


def assert_command_success(data: dict[str, Any], step: str, *, allow_mock: bool = False) -> None:
    if data.get("success") is False:
        raise RuntimeError(
            f"{step} failed: {data.get('errorCode') or ''} {data.get('errorMessage') or data}"
        )
    inner = data.get("data") if isinstance(data.get("data"), dict) else {}
    if not allow_mock and inner.get("mode") == "mock" and inner.get("reason"):
        raise RuntimeError(f"{step} fell back to mock: {inner.get('reason')}")


async def call_ada(session: ClientSession, tool: str, arguments: dict[str, Any], *, timeout_sec: float) -> dict[str, Any]:
    result = await asyncio.wait_for(session.call_tool(tool, arguments), timeout=timeout_sec)
    return parse_tool_payload(result)


def build_server_params(args: argparse.Namespace, root: Path) -> StdioServerParameters:
    env = {**os.environ}
    env.setdefault("ADA_MCP_INSTALL_DEPS", "playwright")

    if args.server == "dev":
        cli_ts = root / "apps" / "ada-mcp-server" / "src" / "cli.ts"
        if not cli_ts.is_file():
            raise FileNotFoundError(f"dev 入口不存在: {cli_ts}")
        env["ADA_MCP_SERVER_ENTRY"] = str(cli_ts)
        npx = "npx.cmd" if sys.platform == "win32" else "npx"
        return StdioServerParameters(command=npx, args=["tsx", str(cli_ts)], cwd=str(root), env=env)

    if args.server == "local":
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
    spec = f"@ada-mcp/launcher@{args.launcher_version}"
    return StdioServerParameters(command=pnpm, args=["dlx", spec], cwd=str(root), env=env)


def web_payload_base(args: argparse.Namespace) -> dict[str, Any]:
    payload: dict[str, Any] = {"headless": args.headless, "keepSession": True}
    if args.channel:
        payload["channel"] = args.channel
    if args.user_data_dir:
        payload["userDataDir"] = args.user_data_dir
    return payload


async def run_web_flow(session: ClientSession, args: argparse.Namespace, out_dir: Path) -> list[StepResult]:
    steps: list[StepResult] = []
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    shot_path = out_dir / f"jd-mcp-web-{ts}.png"
    base = web_payload_base(args)
    timeout = args.timeout_sec
    allow_mock = args.allow_mock

    async def step(name: str, tool: str, arguments: dict[str, Any]) -> dict[str, Any]:
        print(f"  [web] {name} …")
        try:
            data = await call_ada(session, tool, arguments, timeout_sec=timeout)
            assert_command_success(data, name, allow_mock=allow_mock)
            steps.append(StepResult(name=name, ok=True))
            return data
        except Exception as exc:
            steps.append(StepResult(name=name, ok=False, error=str(exc)))
            raise

    await step("health", "ada_health", {})
    await step("plugins", "ada_plugins", {})
    await step(
        "navigate",
        "ada_web_action",
        {
            "command": "navigate",
            "sessionId": WEB_SESSION,
            "requestId": f"jd-web-nav-{ts}",
            "allowMock": allow_mock,
            "payload": {**base, "url": JD_WEB_URL},
        },
    )
    await step(
        "wait_after_load",
        "ada_web_action",
        {
            "command": "wait",
            "sessionId": WEB_SESSION,
            "requestId": f"jd-web-wait-{ts}",
            "allowMock": allow_mock,
            "payload": {**base, "timeoutMs": args.web_wait_ms},
        },
    )
    await step(
        "press_escape",
        "ada_web_action",
        {
            "command": "press",
            "sessionId": WEB_SESSION,
            "requestId": f"jd-web-esc-{ts}",
            "allowMock": allow_mock,
            "payload": {**base, "key": "Escape"},
        },
    )
    await step(
        "scroll_down",
        "ada_web_action",
        {
            "command": "scroll",
            "sessionId": WEB_SESSION,
            "requestId": f"jd-web-scroll-{ts}",
            "allowMock": allow_mock,
            "payload": {**base, "deltaY": 600},
        },
    )
    shot = await step(
        "screenshot",
        "ada_web_action",
        {
            "command": "screenshot",
            "sessionId": WEB_SESSION,
            "requestId": f"jd-web-shot-{ts}",
            "allowMock": allow_mock,
            "payload": {**base, "fullPage": False, "screenshotPath": str(shot_path)},
        },
    )
    print(f"  [web] 截图: {(shot.get('data') or {}).get('screenshot') or shot_path}")
    try:
        await step(
            "close_session",
            "ada_close_session",
            {"platform": "web", "sessionId": WEB_SESSION, "engine": "playwright"},
        )
    except Exception:
        pass
    return steps


async def run_verify(args: argparse.Namespace) -> VerifyReport:
    root = repo_root()
    out_dir = Path(args.output_dir)
    if not out_dir.is_absolute():
        out_dir = root / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    report = VerifyReport()
    params = build_server_params(args, root)
    print(f"[ada-mcp] 启动 MCP: {params.command} {' '.join(params.args)}")
    print(f"[web] 京东 {JD_WEB_URL}\n")

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await asyncio.wait_for(session.initialize(), timeout=120)
            report.steps = await run_web_flow(session, args, out_dir)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="京东 Web 首页 ada-mcp 验证（App 请用 mcp-jd-app-verify.mjs）")
    parser.add_argument("--allow-mock", action="store_true")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--channel", default="chrome")
    parser.add_argument("--user-data-dir", default="artifacts/chrome-jd-profile")
    parser.add_argument("--output-dir", default="artifacts")
    parser.add_argument("--web-wait-ms", type=int, default=5000)
    parser.add_argument("--launcher-version", default=os.environ.get("ADA_MCP_LAUNCHER_VERSION", "0.1.27"))
    parser.add_argument("--server", choices=("npm", "dev", "local"), default="npm")
    parser.add_argument("--timeout-sec", type=float, default=360.0)
    args = parser.parse_args()

    try:
        report = asyncio.run(run_verify(args))
        print("\n=== Web ===")
        for s in report.steps:
            mark = "OK" if s.ok else "FAIL"
            line = f"  [{mark}] {s.name}"
            if s.error:
                line += f" — {s.error}"
            print(line)
        print(json.dumps({"ok": report.ok, "steps": len(report.steps)}, ensure_ascii=False))
        return 0 if report.ok else 1
    except Exception as exc:
        print(f"\n失败: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
