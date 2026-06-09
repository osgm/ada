"""launchApp 后 smart-wait — 与 smart-wait-launch.mjs / driver-rpc 对齐。"""
from __future__ import annotations

import os
from typing import Any, Callable


def _env_wait_override() -> dict[str, Any]:
    until = (os.environ.get("ADA_WAIT_UNTIL") or "").strip()
    out: dict[str, Any] = {}
    if until in ("timeout", "ui_stable", "launch_settled"):
        out["until"] = until
    if os.environ.get("ADA_WAIT_UI_STABLE_MS"):
        out["stableMs"] = int(os.environ["ADA_WAIT_UI_STABLE_MS"])
    if os.environ.get("ADA_WAIT_POLL_MS"):
        out["pollMs"] = int(os.environ["ADA_WAIT_POLL_MS"])
    if os.environ.get("ADA_WAIT_MAX_MS"):
        out["timeoutMs"] = int(os.environ["ADA_WAIT_MAX_MS"])
    return out


def resolve_launch_wait(
    platform: str,
    settle_ms: int | float | None = None,
    explicit_wait: dict[str, Any] | None = None,
) -> dict[str, Any]:
    default_max = 8000
    env = _env_wait_override()
    if explicit_wait and explicit_wait.get("until"):
        wait = {
            "until": explicit_wait["until"],
            "timeoutMs": explicit_wait.get("timeoutMs") or explicit_wait.get("maxMs") or default_max,
            "pollMs": explicit_wait.get("pollMs", 300),
            "stablePolls": explicit_wait.get("stablePolls", 3),
        }
        if explicit_wait.get("stableMs") is not None:
            wait["stableMs"] = explicit_wait["stableMs"]
        wait.update(env)
        return wait
    max_ms = float(settle_ms) if isinstance(settle_ms, (int, float)) and settle_ms > 0 else float(default_max)
    # iOS WDA /source 单次可能很慢，launch_settled 反复 dump 易触发 COMMAND_TIMEOUT
    until = env.get("until") or ("timeout" if platform == "ios" else "launch_settled")
    wait = {
        "until": until,
        "timeoutMs": env.get("timeoutMs", max_ms),
        "pollMs": env.get("pollMs", 300),
        "stablePolls": 3,
    }
    if env.get("stableMs") is not None:
        wait["stableMs"] = env["stableMs"]
    return wait


def run_launch_settle(
    run: Callable[[str, dict[str, Any]], None],
    platform: str,
    settle_ms: int | float | None = None,
    explicit_wait: dict[str, Any] | None = None,
) -> None:
    wait = resolve_launch_wait(platform, settle_ms, explicit_wait)
    run("custom", {"custom": {"action": "smart_wait"}, "wait": wait})
