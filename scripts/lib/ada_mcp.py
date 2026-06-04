"""MCP 传输层（Python）— 与 scripts/lib/ada-mcp.mjs 对应。"""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE = Path(__file__).resolve().parent / "ada-mcp-bridge.mjs"

from step_log import step_log

MOBILE_RISK_COMMANDS = frozenset({"custom", "invoke", "launchApp", "exitApp"})
WEB_RISK_COMMANDS = frozenset({"custom", "invoke"})


def parse_mcp_tool_result(data: dict[str, Any]) -> dict[str, Any]:
    return data.get("data") if isinstance(data.get("data"), dict) else data


def assert_mcp_ok(label: str, data: dict[str, Any], *, allow_business_codes: set[str] | None = None) -> dict[str, Any]:
    allow = allow_business_codes or {"POPUP_NOT_FOUND"}
    if data.get("ok") is False:
        raise RuntimeError(f"{label} failed:\n{json.dumps(data, ensure_ascii=False, indent=2)}")
    result = data.get("result") if isinstance(data.get("result"), dict) else {}
    if result.get("success") is False:
        code = data.get("businessCode") or result.get("businessCode")
        if code and str(code) in allow:
            return data
        raise RuntimeError(f"{label} failed:\n{json.dumps(data, ensure_ascii=False, indent=2)}")
    return data


def mcp_needs_risk(platform: str, command: str, extra: dict[str, Any] | None = None) -> bool:
    if extra and extra.get("riskApproved") is True:
        return False
    if platform == "web":
        return command in WEB_RISK_COMMANDS
    return command in MOBILE_RISK_COMMANDS


def _bridge_argv() -> list[str]:
    import shutil

    npx = shutil.which("npx") or "npx"
    return [npx, "tsx", str(BRIDGE)]


def _start_stderr_drain(proc: subprocess.Popen[str]) -> None:
    """避免 stderr=PIPE 未读取导致子进程写满管道后死锁。"""
    if not proc.stderr:
        return

    def drain() -> None:
        try:
            for _ in proc.stderr:
                pass
        except Exception:
            pass

    threading.Thread(target=drain, daemon=True).start()


class McpConnection:
    """持久 stdio 连接 ada-mcp-server（经 ada-mcp-bridge.mjs）。"""

    def __init__(self, proc: subprocess.Popen[str], *, owned: bool = True):
        self._proc = proc
        self._id = 0
        self.owned = owned

    def _request(self, body: dict[str, Any]) -> dict[str, Any]:
        op = body.get("op", "?")
        step_log(f"mcp-bridge request op={op} id={self._id + 1}")
        self._id += 1
        body = {**body, "id": self._id}
        assert self._proc.stdin is not None
        assert self._proc.stdout is not None
        t0 = time.monotonic()
        self._proc.stdin.write(json.dumps(body, ensure_ascii=False) + "\n")
        self._proc.stdin.flush()
        line = self._proc.stdout.readline()
        if not line.strip():
            step_log(f"mcp-bridge response op={op} id={self._id} → bridge closed")
            raise RuntimeError("MCP bridge closed unexpectedly")
        resp = json.loads(line)
        if resp.get("id") != self._id:
            raise RuntimeError(f"MCP bridge id mismatch: expected {self._id}, got {resp.get('id')}")
        if resp.get("ok") is False:
            step_log(
                f"mcp-bridge response op={op} id={self._id} → error "
                f"({int((time.monotonic() - t0) * 1000)}ms): {resp.get('error')}"
            )
            raise RuntimeError(resp.get("error") or "MCP bridge request failed")
        step_log(f"mcp-bridge response op={op} id={self._id} → ok ({int((time.monotonic() - t0) * 1000)}ms)")
        return resp

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        step_log(f"MCP tool start: {name}")
        t0 = time.monotonic()
        resp = self._request({"op": "callTool", "name": name, "arguments": arguments or {}})
        data = resp.get("data")
        out = data if isinstance(data, dict) else {}
        step_log(
            f"MCP tool done: {name} ({int((time.monotonic() - t0) * 1000)}ms) "
            f"ok={out.get('ok')} businessCode={out.get('businessCode')}"
        )
        return out

    def harmony_kill_all_apps(
        self, session_id: str, payload: dict[str, Any], opts: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        raw = self._request(
            {
                "op": "harmonyKillAllApps",
                "sessionId": session_id,
                "payload": payload,
                "opts": opts or {},
            }
        )
        return raw.get("data") if isinstance(raw.get("data"), dict) else raw

    def android_kill_all_apps(
        self, session_id: str, payload: dict[str, Any], opts: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        raw = self._request(
            {
                "op": "androidKillAllApps",
                "sessionId": session_id,
                "payload": payload,
                "opts": opts or {},
            }
        )
        return raw.get("data") if isinstance(raw.get("data"), dict) else raw

    def close(self) -> None:
        """释放 MCP 客户端连接（经 bridge 通知内层 disconnect），并结束 bridge 子进程；不结束 Host 侧 MCP Server。"""
        try:
            self.call_tool("ada_close_all_sessions", {})
        except Exception:
            pass
        try:
            self._request({"op": "shutdown"})
        except Exception:
            pass
        if self._proc.stdin:
            try:
                self._proc.stdin.close()
            except Exception:
                pass
        self._proc.terminate()
        try:
            self._proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self._proc.kill()


def connect_mcp(*, root: Path | str | None = None, env: dict[str, str] | None = None) -> McpConnection:
    root_path = Path(root) if root else REPO_ROOT
    plugin_dir = root_path / "apps" / "ada-mcp-server" / "plugins"
    proc_env = {
        **os.environ,
        "ADA_MCP_SKIP_INSTALL_DEPS": "1",
        "ADA_MCP_HIDE_ADVANCED": os.environ.get("ADA_MCP_HIDE_ADVANCED", "1"),
        "ADA_REPO_ROOT": str(root_path),
        "ADA_PLUGIN_DIR": str(plugin_dir),
        **(env or {}),
    }
    proc = subprocess.Popen(
        _bridge_argv(),
        cwd=str(root_path),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        env=proc_env,
    )
    _start_stderr_drain(proc)
    return McpConnection(proc, owned=True)


_SCRIPT_OWNED_MCP: McpConnection | None = None


def release_mcp_transport() -> None:
    """脚本 exit() 时释放自建 MCP 连接，不关 Host 配置的 MCP Server。"""
    global _SCRIPT_OWNED_MCP
    conn = _SCRIPT_OWNED_MCP
    _SCRIPT_OWNED_MCP = None
    if conn is None:
        return
    conn.close()


def ensure_mcp_client(
    second: dict[str, Any] | None = None,
) -> tuple[McpConnection, McpConnection | None]:
    opts = second or {}
    client = opts.get("client")
    if client is not None:
        return client, None
    mcp = opts.get("mcp") or {}
    inner = mcp.get("client") if isinstance(mcp, dict) else None
    if inner is not None:
        return inner, None
    bridge_opts = dict(opts.get("mcpOptions") or {})
    if opts.get("root") is not None:
        bridge_opts.setdefault("root", opts["root"])
    if opts.get("env") is not None:
        bridge_opts["env"] = {**(bridge_opts.get("env") or {}), **opts["env"]}
    owned = connect_mcp(root=bridge_opts.get("root"), env=bridge_opts.get("env"))
    global _SCRIPT_OWNED_MCP
    _SCRIPT_OWNED_MCP = owned
    return owned, owned
