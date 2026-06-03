"""滑动坐标解析（与 swipe-coords.mjs / driver-rpc swipe-coords.ts 同步）。"""
from __future__ import annotations

from typing import Any

SwipePointInput = tuple[float | str, float | str] | str

SWIPE_POINT_PRESETS: dict[str, tuple[float, float]] = {
    "center": (0.5, 0.5),
    "left": (0.06, 0.5),
    "right": (0.94, 0.5),
    "top": (0.5, 0.08),
    "bottom": (0.5, 0.92),
    "leftMiddle": (0.06, 0.5),
    "rightMiddle": (0.94, 0.5),
    "topMiddle": (0.5, 0.08),
    "bottomMiddle": (0.5, 0.92),
    "leftEdge": (0.06, 0.5),
    "rightEdge": (0.94, 0.5),
    "topEdge": (0.5, 0.08),
    "bottomEdge": (0.5, 0.92),
}

AXIS_RATIO: dict[str, float] = {
    "left": 0.06,
    "right": 0.94,
    "top": 0.08,
    "bottom": 0.92,
    "hcenter": 0.5,
    "vcenter": 0.5,
    "center": 0.5,
    "xcenter": 0.5,
    "ycenter": 0.5,
    "leftedge": 0.06,
    "rightedge": 0.94,
    "topedge": 0.08,
    "bottomedge": 0.92,
}


def _preset_key(name: str) -> str | None:
    t = name.strip()
    if t in SWIPE_POINT_PRESETS:
        return t
    lower = t.lower()
    for k in SWIPE_POINT_PRESETS:
        if k.lower() == lower:
            return k
    return None


def _as_pair(point: SwipePointInput) -> tuple[float | str, float | str]:
    if isinstance(point, str):
        key = _preset_key(point)
        if not key:
            raise RuntimeError(f'swipe: 未知占位符 "{point}"')
        return SWIPE_POINT_PRESETS[key]
    if not isinstance(point, (list, tuple)) or len(point) < 2:
        raise RuntimeError("swipe: 坐标须为 (x, y) 或命名占位符")
    return point[0], point[1]


def _parse_percent(value: str) -> float | None:
    s = value.strip()
    if s.endswith("%"):
        try:
            return float(s[:-1].strip()) / 100.0
        except ValueError:
            return None
    return None


def _resolve_axis(value: float | str, dim: int, *, relative: bool) -> int:
    if isinstance(value, (int, float)) and float(value) == value:
        v = float(value)
        if relative:
            return int(round(v * dim))
        return int(round(v))
    if not isinstance(value, str):
        raise RuntimeError(f"swipe: 无效坐标分量 {value!r}")
    raw = value.strip()
    pct = _parse_percent(raw)
    if pct is not None:
        return int(round(pct * dim))
    ratio = AXIS_RATIO.get(raw.lower())
    if ratio is not None:
        return int(round(ratio * dim))
    try:
        as_num = float(raw)
    except ValueError as e:
        raise RuntimeError(f'swipe: 无法解析坐标占位符 "{raw}"') from e
    if relative and 0 <= as_num <= 1:
        return int(round(as_num * dim))
    if not relative:
        return int(round(as_num))
    return int(round(as_num * dim))


def resolve_swipe_point(
    point: SwipePointInput,
    screen_w: int,
    screen_h: int,
    *,
    relative: bool = False,
) -> list[int]:
    x_val, y_val = _as_pair(point)
    return [
        _resolve_axis(x_val, screen_w, relative=relative),
        _resolve_axis(y_val, screen_h, relative=relative),
    ]


def resolve_swipe_endpoints(
    from_pt: SwipePointInput,
    to_pt: SwipePointInput,
    screen_w: int,
    screen_h: int,
    *,
    relative: bool = False,
) -> tuple[list[int], list[int]]:
    return (
        resolve_swipe_point(from_pt, screen_w, screen_h, relative=relative),
        resolve_swipe_point(to_pt, screen_w, screen_h, relative=relative),
    )


def parse_swipe_relative(opts: dict[str, Any] | None) -> bool:
    if not opts:
        return False
    return bool(opts.get("relative"))
