"""探测已连接移动设备（adb / hdc），与 read-device.mjs 对齐。"""
from __future__ import annotations

import os
import re
import subprocess
from typing import Any


def normalize_device_id(device_id: str | None) -> str:
    p = (device_id or "").strip()
    if not p:
        return ""
    if re.match(r"^(设备序列号|device[_\s-]?id|your[_\s-]?device|xxx+)$", p, re.I):
        return ""
    return p


def pick_device_id(rows: list[tuple[str, bool]], preferred: str) -> str:
    pref = normalize_device_id(preferred)
    if pref and any(i == pref and ok for i, ok in rows):
        return pref
    authorized = [i for i, ok in rows if ok]
    if len(authorized) == 1:
        return authorized[0]
    if not authorized:
        return ""
    physical = next((i for i in authorized if "emulator" not in i.lower() and "127.0.0.1" not in i), None)
    return physical or authorized[0]


def parse_screen(stdout: str, default: tuple[int, int] = (1080, 2400)) -> tuple[int, int]:
    m = re.search(r"(\d+)x(\d+)", stdout)
    return (int(m.group(1)), int(m.group(2))) if m else default


def read_device(*, type: str = "android", device_id: str | None = None) -> dict[str, Any]:
    """探测移动设备：capabilities + 屏幕宽高。"""
    platform = type.strip().lower()
    if platform == "android":
        preferred = normalize_device_id(device_id) or (
            os.environ.get("ADA_ANDROID_UDID") or os.environ.get("ADA_DEVICE_ID") or ""
        ).strip()
        listed = subprocess.check_output(["adb", "devices"], text=True)
        rows = []
        for line in listed.splitlines()[1:]:
            parts = line.strip().split()
            if len(parts) >= 2:
                rows.append((parts[0], parts[1] == "device"))
        udid = pick_device_id(rows, preferred)
        if not udid:
            raise RuntimeError("未检测到 adb 设备")
        size = subprocess.check_output(["adb", "-s", udid, "shell", "wm", "size"], text=True)
        w, h = parse_screen(size)
        return {"capabilities": {"udid": udid}, "screenWidth": w, "screenHeight": h}

    if platform == "harmony":
        preferred = normalize_device_id(device_id) or (
            os.environ.get("ADA_HARMONY_DEVICE_SN") or os.environ.get("ADA_DEVICE_ID") or ""
        ).strip()
        listed = subprocess.check_output(["hdc", "list", "targets"], text=True)
        rows = []
        for line in listed.splitlines():
            t = line.strip()
            if not t or t.lower().startswith("empty") or t.lower().startswith("count"):
                continue
            parts = t.split()
            state = (parts[1] if len(parts) > 1 else "Connected").lower()
            rows.append((parts[0], state in ("connected", "online", "device")))
        sn = pick_device_id(rows, preferred)
        if not sn:
            raise RuntimeError("未检测到 hdc 设备")
        size = subprocess.check_output(
            ["hdc", "-t", sn, "shell", "wm", "size"], text=True, stderr=subprocess.DEVNULL
        )
        w, h = parse_screen(size)
        return {"capabilities": {"deviceSn": sn}, "screenWidth": w, "screenHeight": h}

    raise RuntimeError(f'read_device: 不支持的 type "{type}"')
