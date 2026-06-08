/** fillSearch 选项解析 — 与 packages/driver-rpc/src/fill-search-options.ts 同步 — run: npm run sync:scripts-lib */

function asStringList(v) {
    if (v == null)
        return [];
    if (typeof v === "string")
        return v.trim() ? [v.trim()] : [];
    if (Array.isArray(v)) {
        return v.map((x) => String(x).trim()).filter(Boolean);
    }
    return [];
}
function mergeUnique(...lists) {
    const out = [];
    const seen = new Set();
    for (const list of lists) {
        for (const item of list) {
            const key = item.toLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push(item);
        }
    }
    return out;
}
/** 从 recipe/custom payload 解析 fillSearch 选项（P1） */
export function parseFillSearchPayload(payload) {
    const p = payload ?? {};
    const nested = typeof p.fillSearch === "object" && p.fillSearch !== null
        ? p.fillSearch
        : {};
    const ui = (p.uiHeuristics ?? nested.uiHeuristics);
    const legacyHints = asStringList(p.hints ?? nested.hints);
    const entryHints = mergeUnique(asStringList(p.entryHints ?? nested.entryHints), asStringList(ui?.searchEntryLabels), legacyHints);
    const inputHints = mergeUnique(asStringList(p.inputHints ?? nested.inputHints), asStringList(ui?.searchInputLabels), legacyHints);
    const heuristics = entryHints.length || inputHints.length || ui
        ? {
            ...ui,
            ...(entryHints.length ? { searchEntryLabels: entryHints } : {}),
            ...(inputHints.length ? { searchInputLabels: inputHints } : {})
        }
        : ui;
    const strict = p.strict === true || nested.strict === true;
    const settleMs = typeof p.settleMs === "number"
        ? p.settleMs
        : typeof nested.settleMs === "number"
            ? nested.settleMs
            : undefined;
    return {
        heuristics,
        entryHints,
        inputHints,
        strict,
        recipeOptions: {
            settleMs,
            skipRedundantDump: p.skipRedundantDump === true || nested.skipRedundantDump === true,
            payload: p
        }
    };
}
/** 脚本层 hints 参数 → recipe payload 字段 */
export function fillSearchPayloadFromArg(hintsOrOpts) {
    if (hintsOrOpts == null)
        return {};
    if (typeof hintsOrOpts === "string" || Array.isArray(hintsOrOpts)) {
        const list = asStringList(hintsOrOpts);
        return list.length
            ? { uiHeuristics: { searchEntryLabels: list, searchInputLabels: list }, hints: list }
            : {};
    }
    const entryHints = asStringList(hintsOrOpts.entryHints);
    const inputHints = asStringList(hintsOrOpts.inputHints);
    const legacy = asStringList(hintsOrOpts.hints);
    const ui = {
        ...(entryHints.length || legacy.length
            ? { searchEntryLabels: mergeUnique(entryHints, legacy) }
            : {}),
        ...(inputHints.length || legacy.length
            ? { searchInputLabels: mergeUnique(inputHints, legacy) }
            : {})
    };
    const out = {};
    if (Object.keys(ui).length)
        out.uiHeuristics = ui;
    if (entryHints.length)
        out.entryHints = entryHints;
    if (inputHints.length)
        out.inputHints = inputHints;
    if (legacy.length)
        out.hints = legacy;
    if (hintsOrOpts.strict === true)
        out.strict = true;
    if (typeof hintsOrOpts.settleMs === "number")
        out.settleMs = hintsOrOpts.settleMs;
    if (hintsOrOpts.skipRedundantDump === true)
        out.skipRedundantDump = true;
    return out;
}
