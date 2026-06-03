"""fillSearch 选项 — 与 fill-search-options.mjs 对齐。"""
from __future__ import annotations

from typing import Any


def _as_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        s = value.strip()
        return [s] if s else []
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    return []


def _merge_unique(*lists: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for lst in lists:
        for item in lst:
            key = item.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
    return out


def fill_search_payload_from_arg(hints_or_opts: Any) -> dict[str, Any]:
    if hints_or_opts is None:
        return {}
    if isinstance(hints_or_opts, str) or isinstance(hints_or_opts, list):
        labels = _as_string_list(hints_or_opts)
        if not labels:
            return {}
        return {"uiHeuristics": {"searchEntryLabels": labels, "searchInputLabels": labels}, "hints": labels}

    if not isinstance(hints_or_opts, dict):
        return {}

    entry_hints = _as_string_list(hints_or_opts.get("entryHints"))
    input_hints = _as_string_list(hints_or_opts.get("inputHints"))
    legacy = _as_string_list(hints_or_opts.get("hints"))
    ui: dict[str, Any] = {}
    merged_entry = _merge_unique(entry_hints, legacy)
    merged_input = _merge_unique(input_hints, legacy)
    if merged_entry:
        ui["searchEntryLabels"] = merged_entry
    if merged_input:
        ui["searchInputLabels"] = merged_input

    out: dict[str, Any] = {}
    if ui:
        out["uiHeuristics"] = ui
    if entry_hints:
        out["entryHints"] = entry_hints
    if input_hints:
        out["inputHints"] = input_hints
    if legacy:
        out["hints"] = legacy
    if hints_or_opts.get("strict") is True:
        out["strict"] = True
    settle = hints_or_opts.get("settleMs")
    if isinstance(settle, (int, float)):
        out["settleMs"] = int(settle)
    if hints_or_opts.get("skipRedundantDump") is True:
        out["skipRedundantDump"] = True
    return out
