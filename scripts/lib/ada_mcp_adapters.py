"""MCP 设备适配：与 ada-mcp-adapters.mjs 对齐，复用 HarmonyDevice / WebPage API。"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from ada_client import (
    AndroidDevice,
    ElementHandle,
    HarmonyDevice,
    IosDevice,
    WebPage,
    _locator_spec,
    _resolve_session,
    _ui_for_search,
)
from popups import normalize_dismiss_opts
from ada_mcp import McpConnection, assert_mcp_ok, mcp_needs_risk
from step_log import step_log


def _base_payload(cfg: dict[str, Any]) -> dict[str, Any]:
    p = dict(cfg)
    for k in ("_openKind", "platform", "probeDevice"):
        p.pop(k, None)
    if p.get("real") is None:
        p["real"] = True
    if p.get("mock") is None:
        p["mock"] = False
    return p


def _normalize_dismiss_mcp_result(data: dict[str, Any], timeout_ms: int) -> dict[str, Any]:
    return {
        "success": True,
        "dismissed": bool(data.get("dismissed")),
        "businessCode": data.get("businessCode") or "POPUP_NOT_FOUND",
        "reason": data.get("reason") or ("probe_error" if data.get("ok") is False else "no_popup"),
        "hits": data.get("hits") or [],
        "rounds": data.get("rounds") or 0,
        "dismissActions": data.get("dismissActions") or 0,
        "timedOut": bool(data.get("timedOut")),
        "elapsedMs": data.get("elapsedMs") or 0,
        "timeoutMs": timeout_ms,
    }


def _create_mcp_mobile_runners(
    mcp: McpConnection, platform: str, session_id: str, cfg: dict[str, Any]
) -> dict[str, Any]:
    payload = _base_payload(cfg)

    def run(command: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        args: dict[str, Any] = {
            "command": command,
            "platform": platform,
            "sessionId": session_id,
            "payload": {**payload, **(extra or {})},
        }
        if mcp_needs_risk(platform, command, extra):
            args["riskApproved"] = True
        data = mcp.call_tool("ada_mobile_action", args)
        assert_mcp_ok(command, data)
        return data

    def recipe(action: str, text: str = "", extra: dict[str, Any] | None = None) -> dict[str, Any]:
        step_log(f"recipe start action={action} platform={platform} text={text!r}")
        data = mcp.call_tool(
            "ada_mobile_recipe",
            {
                "platform": platform,
                "sessionId": session_id,
                "action": action,
                "text": text,
                "payload": {**payload, **(extra or {})},
            },
        )
        assert_mcp_ok(action, data)
        step_log(f"recipe done action={action} businessCode={data.get('businessCode')}")
        return data

    def close_session() -> dict[str, Any]:
        return mcp.call_tool(
            "ada_close_session", {"platform": platform, "sessionId": session_id}
        )

    def dismiss_popups(
        timeout_ms: int | dict[str, Any] | None = None, attempts: int | None = None
    ) -> dict[str, Any]:
        timeout, max_attempts = normalize_dismiss_opts(timeout_ms, attempts)
        try:
            data = mcp.call_tool(
                "ada_mobile_dismiss_popups",
                {
                    "platform": platform,
                    "sessionId": session_id,
                    "payload": payload,
                    "timeoutMs": timeout,
                    "attempts": max_attempts,
                },
            )
            return _normalize_dismiss_mcp_result(data, timeout)
        except Exception as e:
            return _normalize_dismiss_mcp_result(
                {
                    "dismissed": False,
                    "businessCode": "POPUP_NOT_FOUND",
                    "reason": "client_error",
                    "hits": [f"error:{str(e)[:120]}"],
                },
                timeout,
            )

    def kill_all_apps(opts: dict[str, Any] | None = None) -> dict[str, Any]:
        if platform == "harmony":
            return mcp.harmony_kill_all_apps(session_id, payload, opts)
        if platform == "android":
            return mcp.android_kill_all_apps(session_id, payload, opts)
        raise RuntimeError(f"kill_all_apps via MCP: unsupported platform {platform}")

    return {
        "run": run,
        "recipe": recipe,
        "close": close_session,
        "dismiss_popups": dismiss_popups,
        "kill_all_apps": kill_all_apps,
        "payload": payload,
    }


def _create_mcp_web_runners(mcp: McpConnection, session_id: str, cfg: dict[str, Any]) -> dict[str, Any]:
    payload = _base_payload(cfg)

    def run(command: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        args: dict[str, Any] = {
            "command": command,
            "sessionId": session_id,
            "payload": {**payload, **(extra or {})},
        }
        if mcp_needs_risk("web", command, extra):
            args["riskApproved"] = True
        data = mcp.call_tool("ada_web_action", args)
        assert_mcp_ok(command, data)
        return data

    def close_session() -> dict[str, Any]:
        return mcp.call_tool(
            "ada_close_session",
            {
                "platform": "web",
                "sessionId": session_id,
                "engine": payload.get("channel") or "playwright",
            },
        )

    def dismiss_popups(
        timeout_ms: int | dict[str, Any] | None = None, attempts: int | None = None
    ) -> dict[str, Any]:
        timeout, max_attempts = normalize_dismiss_opts(timeout_ms, attempts)
        try:
            data = mcp.call_tool(
                "ada_web_dismiss_popups",
                {
                    "sessionId": session_id,
                    "payload": payload,
                    "timeoutMs": timeout,
                    "attempts": max_attempts,
                },
            )
            return _normalize_dismiss_mcp_result(data, timeout)
        except Exception as e:
            return _normalize_dismiss_mcp_result(
                {
                    "dismissed": False,
                    "businessCode": "POPUP_NOT_FOUND",
                    "reason": "client_error",
                    "hits": [f"error:{str(e)[:120]}"],
                },
                timeout,
            )

    return {"run": run, "close": close_session, "dismiss_popups": dismiss_popups, "payload": payload}


def _mcp_element_call(
    mcp: McpConnection,
    runners: dict[str, Any],
    platform: str,
    session_id: str,
    payload: dict[str, Any],
) -> Callable[[str, dict[str, Any]], dict[str, Any]]:
    def call(command: str, extra: dict[str, Any]) -> dict[str, Any]:
        merged = {**payload, **extra}
        if platform == "web":
            tool = "ada_web_action"
            args: dict[str, Any] = {"command": command, "sessionId": session_id, "payload": merged}
            if mcp_needs_risk("web", command, extra):
                args["riskApproved"] = True
        else:
            tool = "ada_mobile_action"
            args = {
                "command": command,
                "platform": platform,
                "sessionId": session_id,
                "payload": merged,
            }
            if mcp_needs_risk(platform, command, extra):
                args["riskApproved"] = True
        data = mcp.call_tool(tool, args)
        result = data.get("result") if isinstance(data.get("result"), dict) else {}
        return {
            "success": data.get("ok") is not False and result.get("success") is not False,
            "data": result.get("data") or data.get("data"),
            "errorMessage": result.get("errorMessage") or data.get("message"),
        }

    return call


class McpHarmonyDevice(HarmonyDevice):
    def __init__(self, mcp: McpConnection, session_id: str, base: dict[str, Any], owned: McpConnection | None):
        super().__init__(session_id, base)
        self._mcp = mcp
        self._owned_mcp = owned
        self._runners = _create_mcp_mobile_runners(mcp, "harmony", session_id, base)
        self._call = _mcp_element_call(mcp, self._runners, "harmony", session_id, self._runners["payload"])

    def _run(self, command: str, extra: dict | None = None) -> None:
        self._runners["run"](command, extra or {})

    def find(self, loc) -> ElementHandle:
        return ElementHandle(
            "harmony",
            self.session_id,
            self.base,
            _locator_spec(loc, mobile=True),
            call=self._call,
        )

    def kill_all_apps(self, exclude: list[str] | None = None) -> dict[str, Any]:
        opts = {"excludePackages": exclude} if exclude else {}
        return self._runners["kill_all_apps"](opts)

    def wake(self) -> None:
        self._runners["run"](
            "custom",
            {"custom": {"action": "shell", "command": "power-shell wakeup"}},
        )

    def dismiss_popups(
        self, timeout_ms: int | dict[str, Any] | None = None, attempts: int | None = None
    ) -> dict[str, Any]:
        return self._runners["dismiss_popups"](timeout_ms, attempts)

    def _session_close(self) -> None:
        self._runners["close"]()

    def close(self, opts: dict | None = None) -> None:
        from session_lifecycle import close_with_target

        close_with_target(
            platform="harmony",
            cfg=self.base,
            run=self._run,
            session_close=self._session_close,
            opts=opts,
        )
        if self._owned_mcp:
            self._owned_mcp.close()


class McpAndroidDevice(AndroidDevice):
    def __init__(self, mcp: McpConnection, session_id: str, base: dict[str, Any], owned: McpConnection | None):
        super().__init__(session_id, base)
        self._mcp = mcp
        self._owned_mcp = owned
        self._runners = _create_mcp_mobile_runners(mcp, "android", session_id, base)
        self._call = _mcp_element_call(mcp, self._runners, "android", session_id, self._runners["payload"])

    def _run(self, command: str, extra: dict | None = None) -> None:
        self._runners["run"](command, extra or {})

    def find(self, loc) -> ElementHandle:
        return ElementHandle(
            "android",
            self.session_id,
            self.base,
            _locator_spec(loc, mobile=True),
            call=self._call,
        )

    def kill_all_apps(self, exclude: list[str] | None = None) -> dict[str, Any]:
        opts = {"excludePackages": exclude} if exclude else {}
        return self._runners["kill_all_apps"](opts)

    def wake(self) -> None:
        self._runners["run"](
            "custom",
            {"custom": {"action": "shell", "command": "input keyevent KEYCODE_WAKEUP"}},
        )

    def dismiss_popups(
        self, timeout_ms: int | dict[str, Any] | None = None, attempts: int | None = None
    ) -> dict[str, Any]:
        return self._runners["dismiss_popups"](timeout_ms, attempts)

    def fill_search(self, text: str, hints: str | list[str] | None = None) -> None:
        self._runners["recipe"]("fill_search", text, _ui_for_search(hints))

    def _session_close(self) -> None:
        self._runners["close"]()

    def close(self, opts: dict | None = None) -> None:
        from session_lifecycle import close_with_target

        close_with_target(
            platform="android",
            cfg=self.base,
            run=self._run,
            session_close=self._session_close,
            opts=opts,
        )
        if self._owned_mcp:
            self._owned_mcp.close()


class McpWebPage(WebPage):
    def __init__(self, mcp: McpConnection, session_id: str, options: dict[str, Any], owned: McpConnection | None):
        super().__init__(session_id, **options)
        self._mcp = mcp
        self._owned_mcp = owned
        self._runners = _create_mcp_web_runners(mcp, session_id, options)
        self._call = _mcp_element_call(mcp, self._runners, "web", session_id, self._runners["payload"])

    def _run(self, command: str, extra: dict | None = None) -> None:
        self._runners["run"](command, extra or {})

    def find(self, loc) -> ElementHandle:
        return ElementHandle(
            "web",
            self.session_id,
            self.options,
            _locator_spec(loc, mobile=False),
            call=self._call,
        )

    def dismiss_popups(
        self, timeout_ms: int | dict[str, Any] | None = None, attempts: int | None = None
    ) -> dict[str, Any]:
        return self._runners["dismiss_popups"](timeout_ms, attempts)

    def _session_close(self) -> None:
        self._runners["close"]()

    def close(self, opts: dict | None = None) -> None:
        from session_lifecycle import close_with_target

        close_with_target(
            platform="web",
            cfg=self.options,
            run=self._run,
            session_close=self._session_close,
            opts=opts,
        )
        if self._owned_mcp:
            self._owned_mcp.close()


class McpIosDevice(IosDevice):
    def __init__(self, mcp: McpConnection, session_id: str, base: dict[str, Any], owned: McpConnection | None):
        super().__init__(session_id, base)
        self._owned_mcp = owned
        self._runners = _create_mcp_mobile_runners(mcp, "ios", session_id, base)
        self._call = _mcp_element_call(mcp, self._runners, "ios", session_id, self._runners["payload"])

    def _run(self, command: str, extra: dict | None = None) -> None:
        self._runners["run"](command, extra or {})

    def find(self, loc) -> ElementHandle:
        return ElementHandle(
            "ios", self.session_id, self.base, _locator_spec(loc, mobile=True), call=self._call
        )

    def kill_all_apps(self, exclude: list[str] | None = None) -> dict[str, Any]:
        return self._runners["kill_all_apps"]({"excludePackages": exclude} if exclude else {})

    def _session_close(self) -> None:
        self._runners["close"]()

    def close(self, opts: dict | None = None) -> None:
        from session_lifecycle import close_with_target

        close_with_target(
            platform="ios",
            cfg=self.base,
            run=self._run,
            session_close=self._session_close,
            opts=opts,
        )
        if self._owned_mcp:
            self._owned_mcp.close()


def open_device_via_mcp(
    mcp: McpConnection, platform: str, cfg: dict[str, Any], owned: McpConnection | None
) -> HarmonyDevice | AndroidDevice | IosDevice:
    sid, base = _resolve_session(platform, cfg)
    if platform == "harmony":
        return McpHarmonyDevice(mcp, sid, base, owned)
    if platform == "android":
        return McpAndroidDevice(mcp, sid, base, owned)
    if platform == "ios":
        return McpIosDevice(mcp, sid, base, owned)
    raise RuntimeError(f'open_device_via_mcp: 不支持的平台 "{platform}"')


def open_web_via_mcp(
    mcp: McpConnection, cfg: dict[str, Any], owned: McpConnection | None
) -> McpWebPage:
    sid, opts = _resolve_session("web", cfg)
    return McpWebPage(mcp, sid, opts, owned)
