"""滑动时长预设（与 swipe-duration.mjs / driver-rpc 对齐）。"""
from __future__ import annotations

import os
from typing import Any

SWIPE_DURATION_MS = {
    "fast": 250,
    "normal": 400,
    "slow": 800,
}

_PRESET_ALIASES = {
    "fast": "fast",
    "quick": "fast",
    "快": "fast",
    "normal": "normal",
    "default": "normal",
    "中": "normal",
    "slow": "slow",
    "慢": "slow",
}


def _resolve_swipe_duration_ms(payload: dict[str, Any] | None, *, fallback_ms: int = 400) -> int:
    p = payload or {}
    raw = p.get("swipePreset") or p.get("swipeSpeed")
    if isinstance(raw, str) and raw.strip():
        key = _PRESET_ALIASES.get(raw.strip().lower())
        if key:
            return SWIPE_DURATION_MS[key]
    for field in ("durationMs", "speed"):
        v = p.get(field)
        if isinstance(v, (int, float)) and v > 0:
            return int(round(v))
    env = os.environ.get("ADA_HARMONY_SWIPE_SPEED_MS")
    if env and str(env).strip().isdigit():
        return int(env)
    return fallback_ms


def parse_swipe_options(duration_or_opts: Any, cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    """解析 swipe 第三参：时长、次数、relative 等。"""
    merged: dict[str, Any] = dict(cfg or {})
    if isinstance(duration_or_opts, (int, float)):
        merged["durationMs"] = int(duration_or_opts)
    elif isinstance(duration_or_opts, str):
        merged["swipePreset"] = duration_or_opts
    elif isinstance(duration_or_opts, dict):
        merged.update(duration_or_opts)
    return {
        "durationMs": _resolve_swipe_duration_ms(merged),
        "relative": merged.get("relative") is True,
        "times": max(1, int(merged.get("times") or 1)),
        "gap_ms": max(0, int(merged.get("gapMs") or merged.get("gap_ms") or 280)),
        "fling": merged.get("fling"),
    }
