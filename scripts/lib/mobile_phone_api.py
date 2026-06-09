"""移动 phone 通用 API（Python）— back / goto。"""
from __future__ import annotations

import re
import time
from typing import Any, Callable

from smart_wait_launch import run_launch_settle


def is_app_bundle_id(value: str) -> bool:
    # 各段须以字母或数字开头（兼容 com.360buy.jdmobile 等数字段 bundle）
    return bool(re.match(r"^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+$", value, re.I))


def back_times(
    run: Callable[[str, dict[str, Any]], None], times: int = 1, gap_ms: float = 400
) -> None:
    n = max(1, times)
    for i in range(n):
        run("back", {})
        if i < n - 1:
            time.sleep(max(0.0, float(gap_ms)) / 1000.0)


def _settle_after_launch(
    run: Callable[[str, dict[str, Any]], None],
    platform: str,
    settle_ms: int | float | None,
    explicit_wait: dict[str, Any] | None = None,
) -> None:
    run_launch_settle(run, platform, settle_ms, explicit_wait)


def goto_target(
    platform: str,
    find: Callable[[Any], Any],
    run: Callable[[str, dict[str, Any]], None],
    target: str | list[str] | dict[str, Any],
    second: str | int | None = None,
    third: int | None = None,
) -> None:
    if isinstance(target, dict):
        app_id = target.get("appId") or target.get("bundleId")
        if not app_id:
            raise RuntimeError("goto: appId is required")
        extra: dict[str, Any] = {"appId": str(app_id)}
        if platform == "harmony":
            extra["abilityId"] = str(target.get("abilityId") or target.get("ability") or "EntryAbility")
        run("launchApp", extra)
        _settle_after_launch(
            run,
            platform,
            target.get("settleMs") if isinstance(target.get("settleMs"), (int, float)) else None,
            target.get("wait") if isinstance(target.get("wait"), dict) else None,
        )
        return

    if isinstance(target, str) and is_app_bundle_id(target):
        extra = {"appId": target}
        if platform == "harmony":
            ability = second if isinstance(second, str) else "EntryAbility"
            extra["abilityId"] = ability
            settle_ms = third if isinstance(third, (int, float)) else (second if isinstance(second, (int, float)) else None)
        else:
            settle_ms = second if isinstance(second, (int, float)) else None
        run("launchApp", extra)
        _settle_after_launch(run, platform, settle_ms)
        return

    labels = target if isinstance(target, list) else [target]
    for label in labels:
        el = find(str(label))
        if el.exists():
            el.click()
            return
    raise RuntimeError(f"goto: page not found: {target!r}")
