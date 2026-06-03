"""open(target, second) 第二参 — 与 open-transport.mjs 对应。"""
from __future__ import annotations

from typing import Any


def is_mcp_handle(value: Any) -> bool:
    return callable(getattr(value, "call_tool", None)) or (
        callable(getattr(value, "health", None)) and callable(getattr(value, "close", None))
    )


def resolve_open_second(second: Any | None) -> tuple[bool, dict[str, Any]]:
    if second is None:
        return False, {}

    if second == "mcp":
        return True, {"via": "mcp"}

    if is_mcp_handle(second):
        return True, {"via": "mcp", "client": second}

    if not isinstance(second, dict):
        return False, {}

    if second.get("mcp") is not None:
        raw = second["mcp"]
        if hasattr(raw, "call_tool"):
            client = raw
        elif isinstance(raw, dict) and raw.get("client") is not None:
            client = raw["client"]
        else:
            client = raw
        return True, {"via": "mcp", "client": client, "mcpOptions": second.get("mcpOptions")}

    if second.get("connect") == "mcp" or second.get("via") == "mcp" or second.get("transport") == "mcp":
        raw = second.get("mcp") or second.get("client")
        client = None
        if raw is not None:
            client = raw if hasattr(raw, "call_tool") else (
                raw.get("client") if isinstance(raw, dict) else raw
            )
        out: dict[str, Any] = {"via": "mcp", "mcpOptions": second.get("mcpOptions")}
        if client is not None:
            out["client"] = client
        return True, out

    return False, second
