/** fillSearch 选项解析 — 与 packages/driver-rpc/src/fill-search-options.ts 同步 */

function asStringList(v) {
  if (v == null) return [];
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return [];
}

function mergeUnique(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const item of list) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** @param {string | string[] | Record<string, unknown> | undefined} hintsOrOpts */
export function fillSearchPayloadFromArg(hintsOrOpts) {
  if (hintsOrOpts == null) return {};
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
  if (Object.keys(ui).length) out.uiHeuristics = ui;
  if (entryHints.length) out.entryHints = entryHints;
  if (inputHints.length) out.inputHints = inputHints;
  if (legacy.length) out.hints = legacy;
  if (hintsOrOpts.strict === true) out.strict = true;
  if (typeof hintsOrOpts.settleMs === "number") out.settleMs = hintsOrOpts.settleMs;
  if (hintsOrOpts.skipRedundantDump === true) out.skipRedundantDump = true;
  return out;
}
