"""双指 pinch 坐标（与 pinch-coords.mjs / driver-rpc 同步）。"""
from __future__ import annotations

from typing import Any

from swipe_coords import SwipePointInput, resolve_swipe_point


def _unit_from_to(
    from_pt: tuple[float, float], to_pt: tuple[float, float]
) -> tuple[float, float]:
    dx = to_pt[0] - from_pt[0]
    dy = to_pt[1] - from_pt[1]
    length = (dx * dx + dy * dy) ** 0.5
    if length < 1e-6:
        return (0.0, 0.0)
    return (dx / length, dy / length)


def resolve_pinch_distance(distance: float, screen_w: int, screen_h: int, *, relative: bool) -> int:
    d = max(0.0, float(distance))
    if relative:
        return int(round(d * min(screen_w, screen_h)))
    return int(round(d))


def compute_pinch_finger_ends(
    finger1: list[int],
    finger2: list[int],
    distance_px: int,
    pinch_in: bool,
) -> dict[str, list[int]]:
    f1 = [int(finger1[0]), int(finger1[1])]
    f2 = [int(finger2[0]), int(finger2[1])]
    center = [int((f1[0] + f2[0]) / 2), int((f1[1] + f2[1]) / 2)]
    d = max(0, int(distance_px))
    toward1 = _unit_from_to((float(f1[0]), float(f1[1])), (float(center[0]), float(center[1])))
    toward2 = _unit_from_to((float(f2[0]), float(f2[1])), (float(center[0]), float(center[1])))
    away1 = _unit_from_to((float(center[0]), float(center[1])), (float(f1[0]), float(f1[1])))
    away2 = _unit_from_to((float(center[0]), float(center[1])), (float(f2[0]), float(f2[1])))
    dir1 = toward1 if pinch_in else away1
    dir2 = toward2 if pinch_in else away2
    return {
        "finger1Start": f1,
        "finger1End": [int(round(f1[0] + dir1[0] * d)), int(round(f1[1] + dir1[1] * d))],
        "finger2Start": f2,
        "finger2End": [int(round(f2[0] + dir2[0] * d)), int(round(f2[1] + dir2[1] * d))],
        "center": center,
    }


def resolve_pinch_gesture(
    finger1: SwipePointInput,
    finger2: SwipePointInput,
    distance: float,
    screen_w: int,
    screen_h: int,
    *,
    pinch_in: bool,
    relative: bool = False,
) -> dict[str, list[int]]:
    f1 = resolve_swipe_point(finger1, screen_w, screen_h, relative=relative)
    f2 = resolve_swipe_point(finger2, screen_w, screen_h, relative=relative)
    distance_px = resolve_pinch_distance(distance, screen_w, screen_h, relative=relative)
    return compute_pinch_finger_ends(f1, f2, distance_px, pinch_in)


def parse_pinch_options(
    distance_or_opts: Any,
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    from swipe_duration import parse_swipe_options

    if isinstance(distance_or_opts, (int, float)):
        merged: dict[str, Any] = {**(cfg or {}), "distance": float(distance_or_opts)}
    elif isinstance(distance_or_opts, dict):
        merged = {**(cfg or {}), **distance_or_opts}
    else:
        merged = dict(cfg or {})
    swipe = parse_swipe_options(
        {
            "durationMs": merged.get("durationMs") or merged.get("duration_ms"),
            "swipePreset": merged.get("swipePreset"),
            "times": merged.get("times"),
            "gapMs": merged.get("gapMs") or merged.get("gap_ms"),
        },
        {},
    )
    if "pinchIn" not in merged and "pinch_in" not in merged:
        raise RuntimeError("pinch 需要 pinchIn / pinch_in: true（缩小）或 false（放大）")
    pinch_in = merged.get("pinchIn") if "pinchIn" in merged else merged.get("pinch_in")
    return {
        "distance": float(merged.get("distance", 0)),
        "pinch_in": bool(pinch_in),
        "relative": merged.get("relative") is True,
        "duration_ms": swipe["durationMs"],
        "times": swipe["times"],
        "gap_ms": swipe["gap_ms"],
    }
