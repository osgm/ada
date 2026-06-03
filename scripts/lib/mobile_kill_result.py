"""killAllApps 统一返回结构（与 mobile-kill-all-apps.mjs buildResult 对齐）。"""
from __future__ import annotations

import re
from typing import Any


def harmony_ps_pid_column_index(ps_text: str) -> int:
    """OpenHarmony `ps` 首列为 PID；传统 USER PID 格式 PID 在第二列。"""
    lines = [ln.strip() for ln in ps_text.splitlines() if ln.strip()]
    if lines:
        h = lines[0]
        if re.match(r"^PID\s", h, re.I) and not re.match(r"^USER\s", h, re.I):
            return 0
        if re.match(r"^USER\s+PID", h, re.I):
            return 1
    skip_re = re.compile(r"system_server|zygote", re.I)
    for line in lines:
        if re.match(r"^(PID|USER)\s", line, re.I) or skip_re.search(line):
            continue
        cols = line.split()
        if cols and cols[0].isdigit() and int(cols[0]) >= 100:
            return 0
        if len(cols) > 1 and cols[1].isdigit() and int(cols[1]) >= 100:
            return 1
        break
    return 0


def _harmony_user_bundles_on_line(line: str) -> list[str]:
    found: list[str] = []
    for m in re.finditer(r"\b([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\b", line, re.I):
        bid = m.group(1)
        if len(bid) < 5 or "." not in bid:
            continue
        if bid.startswith(("com.ohos.", "ohos.", "com.huawei.hmos.", "com.huawei.system")):
            continue
        if bid.startswith("com.android.") or bid.startswith("com.google.android."):
            continue
        found.append(bid)
    return found


def parse_harmony_kill_pids(ps_text: str, exclude_packages: list[str] | None = None) -> list[str]:
    skip = set(exclude_packages or [])
    pid_col = harmony_ps_pid_column_index(ps_text)
    require_user_bundle = pid_col == 0
    pids: list[str] = []
    skip_re = re.compile(r"system_server|zygote", re.I)
    for line in ps_text.splitlines():
        t = line.strip()
        if not t or skip_re.search(t):
            continue
        if require_user_bundle and not [b for b in _harmony_user_bundles_on_line(t) if b.startswith("com.")]:
            continue
        parts = t.split()
        if len(parts) <= pid_col:
            continue
        pid = parts[pid_col]
        if not pid.isdigit() or pid == "PID" or int(pid) < 100:
            continue
        if any(pkg in line for pkg in skip):
            continue
        pids.append(pid)
    return list(dict.fromkeys(pids))


def parse_harmony_running_bundles(ps_text: str, exclude_packages: list[str] | None = None) -> list[str]:
    skip = set(exclude_packages or [])
    pid_col = harmony_ps_pid_column_index(ps_text)
    require_user_bundle = pid_col == 0
    bundles: list[str] = []
    skip_re = re.compile(r"system_server|zygote", re.I)
    for line in ps_text.splitlines():
        t = line.strip()
        if not t or skip_re.search(t):
            continue
        ids = [b for b in _harmony_user_bundles_on_line(t) if b.startswith("com.")]
        if require_user_bundle and not ids:
            continue
        for bid in ids:
            if bid not in skip:
                bundles.append(bid)
    return list(dict.fromkeys(bundles))


def harmony_force_stop_ok(shell_out: str) -> bool:
    return bool(re.search(r"successfully|success", shell_out, re.I))


def build_kill_all_apps_result(
    *,
    killed: list[str],
    failed: list[str] | None = None,
    list_source: str,
    hits: list[str] | None = None,
    cleared: bool | None = None,
) -> dict[str, Any]:
    failed = failed or []
    killed_count = len(killed)
    failed_count = len(failed)
    is_cleared = cleared if cleared is not None else killed_count > 0
    if is_cleared and failed_count == 0:
        code = "APPS_KILLED"
    elif is_cleared:
        code = "APPS_PARTIAL"
    else:
        code = "APPS_NONE"
    return {
        "success": True,
        "cleared": is_cleared,
        "businessCode": code,
        "killedCount": killed_count,
        "failedCount": failed_count,
        "packages": killed,
        "listSource": list_source,
        "hits": hits or [],
    }
