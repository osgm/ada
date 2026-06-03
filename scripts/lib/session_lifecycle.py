"""会话生命周期 — 与 session-lifecycle.mjs 对应。"""
from __future__ import annotations

from typing import Any, Callable


def resolve_app_id(cfg: dict[str, Any], app_id: str | None = None) -> str | None:
    return app_id or cfg.get("appId") or cfg.get("app_id")


def should_keep_target(opts: dict[str, Any] | None = None) -> bool:
    o = opts or {}
    return bool(o.get("keepApp") or o.get("keepBrowser") or o.get("keepTarget"))


def close_with_target(
    *,
    platform: str,
    cfg: dict[str, Any],
    run: Callable[[str, dict | None], None],
    session_close: Callable[[], None],
    opts: dict[str, Any] | None = None,
    app_id: str | None = None,
) -> None:
    """close 默认先 exit 再关会话；keepApp/keepBrowser/keepTarget 时仅关会话。"""
    if not should_keep_target(opts):
        exit_target(platform=platform, cfg=cfg, run=run, session_close=session_close, app_id=app_id)
        if platform == "web":
            return
    session_close()


def exit_target(
    *,
    platform: str,
    cfg: dict[str, Any],
    run: Callable[[str, dict | None], None],
    session_close: Callable[[], None],
    app_id: str | None = None,
) -> None:
    if platform == "web":
        session_close()
        return
    aid = resolve_app_id(cfg, app_id)
    if not aid:
        return
    run("exitApp", {"appId": aid})
