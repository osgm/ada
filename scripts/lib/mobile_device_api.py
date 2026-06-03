"""移动设备管理 API（P0–P2）— 与 mobile-device-api.mjs 对齐。"""
from __future__ import annotations

from typing import Any, Callable


def _admin(
    run_data: Callable[[str, dict[str, Any] | None], dict[str, Any]],
    action: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"action": action, **(extra or {})}
    data = run_data("deviceAdmin", payload)
    return data if isinstance(data, dict) else {}


def attach_device_admin(
    device: Any,
    run_data: Callable[[str, dict[str, Any] | None], dict[str, Any]],
) -> Any:
    """在 phone 实例上挂载设备管理方法。"""

    def list_apps(opts: dict[str, Any] | None = None) -> dict[str, Any]:
        return _admin(run_data, "listApps", opts or {})

    def app_list(opts: dict[str, Any] | None = None) -> dict[str, Any]:
        return list_apps(opts)

    def app_info(app_id: str) -> dict[str, Any]:
        return _admin(run_data, "appInfo", {"appId": app_id})

    def app(app_id: str) -> dict[str, Any]:
        return app_info(app_id)

    def is_installed(app_id: str) -> dict[str, Any]:
        return _admin(run_data, "isInstalled", {"appId": app_id})

    def install(path: str) -> dict[str, Any]:
        return _admin(run_data, "installApp", {"path": path})

    def uninstall(app_id: str) -> dict[str, Any]:
        return _admin(run_data, "uninstallApp", {"appId": app_id})

    def push(local_path: str, remote_path: str) -> dict[str, Any]:
        return _admin(run_data, "pushFile", {"localPath": local_path, "remotePath": remote_path})

    def pull(remote_path: str, local_path: str) -> dict[str, Any]:
        return _admin(run_data, "pullFile", {"remotePath": remote_path, "localPath": local_path})

    def shell(command: str) -> dict[str, Any]:
        return _admin(run_data, "shell", {"command": command})

    def hdc(command: str) -> dict[str, Any]:
        return _admin(run_data, "hdc", {"command": command})

    def current_app() -> dict[str, Any]:
        return _admin(run_data, "currentApp")

    def clear_app_data(app_id: str) -> dict[str, Any]:
        return _admin(run_data, "clearAppData", {"appId": app_id})

    def open_deep_link(url: str) -> dict[str, Any]:
        return _admin(run_data, "openUrl", {"url": url})

    def open_url(url: str) -> dict[str, Any]:
        return open_deep_link(url)

    def press_key(key: str | int) -> dict[str, Any]:
        return _admin(run_data, "pressKey", {"key": key})

    def long_press(point: tuple[float, float], ms: int = 800) -> dict[str, Any]:
        return _admin(
            run_data,
            "longPress",
            {"point": [int(point[0]), int(point[1])], "durationMs": ms},
        )

    def set_clipboard(text: str) -> dict[str, Any]:
        return _admin(run_data, "setClipboard", {"text": text})

    def get_clipboard() -> dict[str, Any]:
        return _admin(run_data, "getClipboard")

    def device_info() -> dict[str, Any]:
        return _admin(run_data, "deviceInfo")

    def grant_permission(app_id: str, permission: str) -> dict[str, Any]:
        return _admin(run_data, "grantPermission", {"appId": app_id, "permission": permission})

    def set_orientation(orientation: str) -> dict[str, Any]:
        return _admin(run_data, "setOrientation", {"orientation": orientation})

    def start_screen_record(remote_path: str | None = None) -> dict[str, Any]:
        extra = {"remotePath": remote_path} if remote_path else {}
        return _admin(run_data, "startScreenRecord", extra)

    def stop_screen_record() -> dict[str, Any]:
        return _admin(run_data, "stopScreenRecord")

    def reboot() -> dict[str, Any]:
        return _admin(run_data, "reboot")

    device.list_apps = list_apps
    device.app_list = app_list
    device.app_info = app_info
    device.app = app
    device.is_installed = is_installed
    device.install = install
    device.uninstall = uninstall
    device.push = push
    device.pull = pull
    device.shell = shell
    device.hdc = hdc
    device.current_app = current_app
    device.clear_app_data = clear_app_data
    device.open_deep_link = open_deep_link
    device.open_url = open_url
    device.press_key = press_key
    device.long_press = long_press
    device.set_clipboard = set_clipboard
    device.get_clipboard = get_clipboard
    device.device_info = device_info
    device.grant_permission = grant_permission
    device.set_orientation = set_orientation
    device.start_screen_record = start_screen_record
    device.stop_screen_record = stop_screen_record
    device.reboot = reboot
    return device
