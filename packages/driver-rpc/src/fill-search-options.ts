import type { UiHeuristicsConfig } from "@ada/mobile-ui";
import type { RecipeOptions } from "./mobile-recipes.js";

export interface FillSearchOptions {
  /** 兼容：同时作为 entry + input 匹配词 */
  hints?: string | string[];
  entryHints?: string[];
  inputHints?: string[];
  /** true 时不走文本/坐标 fallback */
  strict?: boolean;
  settleMs?: number;
  skipRedundantDump?: boolean;
}

export interface ParsedFillSearchOptions {
  heuristics?: UiHeuristicsConfig;
  entryHints: string[];
  inputHints: string[];
  strict: boolean;
  recipeOptions: RecipeOptions;
}

function asStringList(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  return [];
}

function mergeUnique(...lists: string[][]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
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

/** 从 recipe/custom payload 解析 fillSearch 选项（P1） */
export function parseFillSearchPayload(payload?: Record<string, unknown>): ParsedFillSearchOptions {
  const p = payload ?? {};
  const nested =
    typeof p.fillSearch === "object" && p.fillSearch !== null
      ? (p.fillSearch as Record<string, unknown>)
      : {};
  const ui = (p.uiHeuristics ?? nested.uiHeuristics) as UiHeuristicsConfig | undefined;

  const legacyHints = asStringList(p.hints ?? nested.hints);
  const entryHints = mergeUnique(
    asStringList(p.entryHints ?? nested.entryHints),
    asStringList(ui?.searchEntryLabels),
    legacyHints
  );
  const inputHints = mergeUnique(
    asStringList(p.inputHints ?? nested.inputHints),
    asStringList(ui?.searchInputLabels),
    legacyHints
  );

  const heuristics: UiHeuristicsConfig | undefined =
    entryHints.length || inputHints.length || ui
      ? {
          ...ui,
          ...(entryHints.length ? { searchEntryLabels: entryHints } : {}),
          ...(inputHints.length ? { searchInputLabels: inputHints } : {})
        }
      : ui;

  const strict = p.strict === true || nested.strict === true;
  const settleMs =
    typeof p.settleMs === "number"
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
export function fillSearchPayloadFromArg(hintsOrOpts?: FillSearchOptions | string | string[]): Record<string, unknown> {
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
  const ui: UiHeuristicsConfig = {
    ...(entryHints.length || legacy.length
      ? { searchEntryLabels: mergeUnique(entryHints, legacy) }
      : {}),
    ...(inputHints.length || legacy.length
      ? { searchInputLabels: mergeUnique(inputHints, legacy) }
      : {})
  };
  const out: Record<string, unknown> = {};
  if (Object.keys(ui).length) out.uiHeuristics = ui;
  if (entryHints.length) out.entryHints = entryHints;
  if (inputHints.length) out.inputHints = inputHints;
  if (legacy.length) out.hints = legacy;
  if (hintsOrOpts.strict === true) out.strict = true;
  if (typeof hintsOrOpts.settleMs === "number") out.settleMs = hintsOrOpts.settleMs;
  if (hintsOrOpts.skipRedundantDump === true) out.skipRedundantDump = true;
  return out;
}
