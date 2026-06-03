"""关页面弹窗（Web / 移动），与 popups.mjs 对齐。"""
from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any, Callable

DEFAULT_DISMISS_TIMEOUT_MS = 10_000
DOM_SCAN_BURST = 4
DISMISS_LOCATOR_TIMEOUT_MS = 300
DISMISS_HIT_SLEEP_S = 0.2
DISMISS_ROUND_SLEEP_S = 0.2

_POPUP_ROOT = (
    '[role="dialog"],dialog,[class*="modal" i],[class*="popup" i],[aria-modal="true"],'
    '[id*="dialog-wrap" i],[id*="dialog" i]'
)
WEB_DISMISS_LOCATORS: tuple[dict[str, Any], ...] = (
    {
        "css": (
            f'{_POPUP_ROOT} [id*="close" i], {_POPUP_ROOT} [class*="close" i], '
            f'{_POPUP_ROOT} [class*="cancel" i], {_POPUP_ROOT} [class*="dismiss" i]'
        )
    },
    {
        "css": (
            '#login2025-dialog-wrap [id*="close" i], '
            '#login2025-dialog-wrap [class*="close" i], '
            '#login2025-dialog-wrap [aria-label*="关闭"], '
            '#login2025-dialog-wrap [aria-label*="close" i]'
        )
    },
    {
        "css": (
            f'{_POPUP_ROOT} [aria-label*="关闭"], '
            f'{_POPUP_ROOT} [aria-label*="close" i], '
            f'{_POPUP_ROOT} [title*="关闭"], '
            f'{_POPUP_ROOT} [title*="close" i]'
        )
    },
    {
        "css": (
            f'{_POPUP_ROOT} img[id*="close" i], {_POPUP_ROOT} img[class*="close" i], '
            f'{_POPUP_ROOT} button[id*="close" i], {_POPUP_ROOT} button[class*="close" i]'
        )
    },
    {
        "css": (
            f'{_POPUP_ROOT} [id^="close" i], {_POPUP_ROOT} [id$="close" i], '
            f'{_POPUP_ROOT} [class^="close" i], {_POPUP_ROOT} [class$="close" i]'
        )
    },
    {"css": f'{_POPUP_ROOT} [data-dismiss="modal"]'},
)

MOBILE_DISMISS_LABELS: tuple[str, ...] = (
    "关闭",
    "跳过",
    "我知道了",
    "知道了",
    "暂不",
    "以后再说",
    "不再提示",
    "取消",
    "拒绝",
    "×",
    "Close",
    "Got it",
)


def _load_web_dismiss_dom_script() -> str:
    path = Path(__file__).resolve().parent / "popups-dismiss-dom.mjs"
    text = path.read_text(encoding="utf-8")
    m = re.search(r"export const WEB_DISMISS_DOM_CLICK_SCRIPT = `([\s\S]*?)`;", text)
    if not m:
        raise RuntimeError("WEB_DISMISS_DOM_CLICK_SCRIPT not found in popups-dismiss-dom.mjs")
    return m.group(1)


_WEB_DISMISS_DOM_SCRIPT = _load_web_dismiss_dom_script()


def _load_web_popup_probe_script() -> str:
    path = Path(__file__).resolve().parent / "popups-wait-dom.mjs"
    text = path.read_text(encoding="utf-8")
    m = re.search(r"export const WEB_POPUP_BLOCKER_PROBE_SCRIPT = `([\s\S]*?)`;", text)
    if not m:
        raise RuntimeError("WEB_POPUP_BLOCKER_PROBE_SCRIPT not found in popups-wait-dom.mjs")
    return m.group(1)


_WEB_POPUP_PROBE_SCRIPT = _load_web_popup_probe_script()
WEB_POPUP_PRE_WAIT_POLL_S = 0.2
WEB_POPUP_IDLE_POLLS = 2


def normalize_dismiss_opts(
    timeout_or_opts: int | dict[str, Any] | None = None, attempts: int | None = None
) -> tuple[int, int | None]:
    timeout_ms: int | None = None
    tries: int | None = attempts
    if isinstance(timeout_or_opts, dict):
        timeout_ms = timeout_or_opts.get("timeoutMs") or timeout_or_opts.get("timeout_ms")
        if tries is None:
            tries = timeout_or_opts.get("attempts")
    else:
        timeout_ms = timeout_or_opts
    timeout = DEFAULT_DISMISS_TIMEOUT_MS if timeout_ms is None else int(timeout_ms)
    max_attempts = max(1, int(tries)) if tries is not None else None
    return timeout, max_attempts


def dismiss_probe_payload(base: dict[str, Any]) -> dict[str, Any]:
    return {
        **base,
        "optional": True,
        "bestEffort": True,
        "locatorTimeoutMs": base.get("locatorTimeoutMs", DISMISS_LOCATOR_TIMEOUT_MS),
    }


def _ada(platform: str, session_id: str, command: str, payload: dict[str, Any]) -> dict[str, Any]:
    from ada_client import ada as ada_fn

    return ada_fn(platform, session_id, command, payload)


def _safe_ada(platform: str, session_id: str, command: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return _ada(platform, session_id, command, payload)
    except Exception as exc:
        return {
            "success": False,
            "errorCode": "UI_ELEMENT_NOT_FOUND",
            "errorMessage": str(exc),
            "data": {"businessCode": "LOCATOR_NOT_FOUND", "optional": True},
        }


def _dismiss_web_dom_scan_burst(session_id: str, options: dict[str, Any]) -> bool:
    for _ in range(DOM_SCAN_BURST):
        r = _safe_ada(
            "web",
            session_id,
            "custom",
            {**options, "action": "evaluate", "script": _WEB_DISMISS_DOM_SCRIPT},
        )
        if not r.get("success"):
            break
        value = (r.get("data") or {}).get("value") or {}
        if not value.get("clicked"):
            break
        time.sleep(DISMISS_HIT_SLEEP_S)
        return True
    return False


def _wait_for_web_popup_ready(session_id: str, options: dict[str, Any], budget_s: float) -> dict[str, Any]:
    deadline = time.time() + max(0.0, budget_s)
    idle_streak = 0
    saw_blocker = False
    while time.time() < deadline:
        r = _safe_ada(
            "web",
            session_id,
            "custom",
            {**options, "action": "evaluate", "script": _WEB_POPUP_PROBE_SCRIPT},
        )
        if not r.get("success"):
            break
        value = (r.get("data") or {}).get("value") or {}
        if value.get("blocking"):
            saw_blocker = True
            idle_streak = 0
            return {"ready": True, "reason": "blocking", "id": value.get("id") or "blocker"}
        idle_streak += 1
        if idle_streak >= WEB_POPUP_IDLE_POLLS:
            return {"ready": True, "reason": "cleared" if saw_blocker else "idle"}
        time.sleep(WEB_POPUP_PRE_WAIT_POLL_S)
    return {"ready": True, "reason": "timeout", "sawBlocker": saw_blocker}


def dismiss_web_popups(
    session_id: str,
    options: dict[str, Any],
    timeout_or_opts: int | dict[str, Any] | None = None,
    attempts: int | None = None,
) -> dict[str, Any]:
    timeout, max_attempts = normalize_dismiss_opts(timeout_or_opts, attempts)
    opts = {
        **options,
        "waitTimeoutMs": options.get("dismissWaitMs")
        or options.get("dismissActionWaitMs")
        or 1200,
    }
    started = time.time()
    deadline = started + timeout / 1000.0
    dismiss_actions = 0
    rounds = 0
    idle_streak = 0
    hit_log: list[str] = []

    pre_budget_s = min(4.0, max(0.6, (timeout / 1000.0) * 0.45))
    pre = _wait_for_web_popup_ready(session_id, opts, pre_budget_s)
    if pre.get("reason") == "blocking":
        hit_log.append(f"pre:{pre.get('id') or 'blocker'}")
    elif pre.get("reason") == "idle":
        hit_log.append("pre:idle")

    while time.time() < deadline and (max_attempts is None or rounds < max_attempts):
        rounds += 1
        round_ok = False
        if time.time() < deadline and _dismiss_web_dom_scan_burst(session_id, opts):
            round_ok = True
            hit_log.append("dom:scan")
        if not round_ok:
            for loc in WEB_DISMISS_LOCATORS:
                if time.time() >= deadline:
                    break
                r = _safe_ada("web", session_id, "click", {**opts, "locator": loc})
                if r.get("success"):
                    round_ok = True
                    hit_log.append(f"locator:{loc}")
                    time.sleep(DISMISS_HIT_SLEEP_S)
                    break
        if round_ok:
            dismiss_actions += 1
            idle_streak = 0
        else:
            idle_streak += 1
            if idle_streak >= 2:
                break
        if time.time() >= deadline:
            break
        time.sleep(DISMISS_ROUND_SLEEP_S)

    ended = time.time()
    elapsed_ms = int((ended - started) * 1000)
    return {
        "success": True,
        "dismissed": dismiss_actions > 0,
        "businessCode": "POPUP_DISMISSED"
        if dismiss_actions > 0
        else ("POPUP_DISMISS_TIMEOUT" if ended >= deadline else "POPUP_NOT_FOUND"),
        "reason": "dismissed"
        if dismiss_actions > 0
        else ("timed_out" if ended >= deadline else "no_popup"),
        "dismissActions": dismiss_actions,
        "rounds": rounds,
        "timedOut": ended >= deadline,
        "elapsedMs": elapsed_ms,
        "timeoutMs": timeout,
        "hits": hit_log,
    }


def _mobile_dismiss_round(
    platform: str,
    session_id: str,
    base: dict[str, Any],
    screen_w: int,
    screen_h: int,
    deadline: float,
    hit_log: list[str],
) -> bool:
    probe = dismiss_probe_payload(base)
    for label in MOBILE_DISMISS_LABELS:
        if time.time() >= deadline:
            break
        r = _safe_ada(platform, session_id, "click", {**probe, "locator": {"text": label}})
        if r.get("success"):
            hit_log.append(f"text:{label}")
            time.sleep(DISMISS_HIT_SLEEP_S)
            return True
    if time.time() >= deadline:
        return False
    corner = _safe_ada(
        platform,
        session_id,
        "click",
        {**probe, "point": [int(screen_w * 0.92), int(screen_h * 0.08)]},
    )
    if corner.get("success"):
        hit_log.append(f"point:{int(screen_w * 0.92)},{int(screen_h * 0.08)}")
        return True
    return False


def dismiss_mobile_popups(
    platform: str,
    session_id: str,
    base: dict[str, Any],
    screen_w: int,
    screen_h: int,
    timeout_or_opts: int | dict[str, Any] | None = None,
    attempts: int | None = None,
    *,
    on_round: Callable[[int, bool], None] | None = None,
) -> dict[str, Any]:
    timeout, max_attempts = normalize_dismiss_opts(timeout_or_opts, attempts)
    started = time.time()
    deadline = started + timeout / 1000.0
    dismiss_actions = 0
    rounds = 0
    idle_streak = 0
    hit_log: list[str] = []

    while time.time() < deadline and (max_attempts is None or rounds < max_attempts):
        rounds += 1
        round_ok = _mobile_dismiss_round(
            platform, session_id, base, screen_w, screen_h, deadline, hit_log
        )
        if on_round is not None:
            on_round(rounds, round_ok)
        if round_ok:
            dismiss_actions += 1
            idle_streak = 0
        else:
            idle_streak += 1
            if idle_streak >= 2:
                break
        if time.time() >= deadline:
            break
        time.sleep(DISMISS_ROUND_SLEEP_S)

    ended = time.time()
    elapsed_ms = int((ended - started) * 1000)
    return {
        "success": True,
        "dismissed": dismiss_actions > 0,
        "businessCode": "POPUP_DISMISSED"
        if dismiss_actions > 0
        else ("POPUP_DISMISS_TIMEOUT" if ended >= deadline else "POPUP_NOT_FOUND"),
        "reason": "dismissed"
        if dismiss_actions > 0
        else ("timed_out" if ended >= deadline else "no_popup"),
        "dismissActions": dismiss_actions,
        "rounds": rounds,
        "timedOut": ended >= deadline,
        "elapsedMs": elapsed_ms,
        "timeoutMs": timeout,
        "hits": hit_log,
    }
