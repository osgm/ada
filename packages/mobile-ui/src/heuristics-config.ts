/** 通用 UI 启发式配置（无业务定开；可通过 payload / 环境变量覆盖） */

export interface UiHeuristicsConfig {
  /** 搜索入口文案/id 匹配（字符串将转为不区分大小写的正则） */
  searchEntryLabels?: string[];
  /** 搜索输入框 hint / 文案 */
  searchInputLabels?: string[];
  /** 底部「首页」类 Tab 文案/id */
  homeTabLabels?: string[];
  /** 输入控件 type 匹配 */
  inputTypePattern?: string;
  /** 顶部搜索区域最大 Y 比例（相对屏高） */
  topRegionRatio?: number;
  /** 输入框区域最大 Y 比例 */
  inputRegionRatio?: number;
  /** 底部 Tab 最小 Y 比例 */
  bottomTabMinRatio?: number;
  /** 搜索入口最小宽度比例 */
  minEntryWidthRatio?: number;
  /** 输入框最小宽度比例 */
  minInputWidthRatio?: number;
}

export const DEFAULT_UI_HEURISTICS: UiHeuristicsConfig = {
  searchEntryLabels: ["search", "query", "find", "搜索"],
  searchInputLabels: ["search", "query", "type", "enter", "input", "hint", "搜索", "请输入", "输入"],
  homeTabLabels: ["home", "main", "index"],
  inputTypePattern: "TextInput|TextField|TextArea|Search|Edit",
  topRegionRatio: 0.3,
  inputRegionRatio: 0.38,
  bottomTabMinRatio: 0.72,
  minEntryWidthRatio: 0.2,
  minInputWidthRatio: 0.15
};

function toRegex(parts: string[] | undefined, fallback: string[]): RegExp {
  const list = (parts?.length ? parts : fallback).map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return /^$/i;
  return new RegExp(list.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
}

export function resolveUiHeuristicsConfig(overrides?: UiHeuristicsConfig): Required<
  Omit<UiHeuristicsConfig, "searchEntryLabels" | "searchInputLabels" | "homeTabLabels" | "inputTypePattern">
> & {
  searchEntryRe: RegExp;
  searchInputRe: RegExp;
  homeTabRe: RegExp;
  inputTypeRe: RegExp;
} {
  const base = { ...DEFAULT_UI_HEURISTICS, ...overrides };
  return {
    topRegionRatio: base.topRegionRatio ?? DEFAULT_UI_HEURISTICS.topRegionRatio!,
    inputRegionRatio: base.inputRegionRatio ?? DEFAULT_UI_HEURISTICS.inputRegionRatio!,
    bottomTabMinRatio: base.bottomTabMinRatio ?? DEFAULT_UI_HEURISTICS.bottomTabMinRatio!,
    minEntryWidthRatio: base.minEntryWidthRatio ?? DEFAULT_UI_HEURISTICS.minEntryWidthRatio!,
    minInputWidthRatio: base.minInputWidthRatio ?? DEFAULT_UI_HEURISTICS.minInputWidthRatio!,
    searchEntryRe: toRegex(base.searchEntryLabels, DEFAULT_UI_HEURISTICS.searchEntryLabels!),
    searchInputRe: toRegex(base.searchInputLabels, DEFAULT_UI_HEURISTICS.searchInputLabels!),
    homeTabRe: toRegex(base.homeTabLabels, DEFAULT_UI_HEURISTICS.homeTabLabels!),
    inputTypeRe: new RegExp(base.inputTypePattern ?? DEFAULT_UI_HEURISTICS.inputTypePattern!, "i")
  };
}

/** 从环境变量解析（npm / CI 友好，无需 YAML） */
export function uiHeuristicsFromEnv(env: NodeJS.ProcessEnv = process.env): UiHeuristicsConfig | undefined {
  const json = env.ADA_UI_HEURISTICS_JSON?.trim();
  if (json) {
    try {
      return JSON.parse(json) as UiHeuristicsConfig;
    } catch {
      return undefined;
    }
  }
  const split = (key: string) =>
    env[key]
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const searchEntryLabels = split("ADA_UI_SEARCH_ENTRY_LABELS");
  const searchInputLabels = split("ADA_UI_SEARCH_INPUT_LABELS");
  const homeTabLabels = split("ADA_UI_HOME_TAB_LABELS");
  if (!searchEntryLabels?.length && !searchInputLabels?.length && !homeTabLabels?.length) {
    return undefined;
  }
  return {
    ...(searchEntryLabels?.length ? { searchEntryLabels } : {}),
    ...(searchInputLabels?.length ? { searchInputLabels } : {}),
    ...(homeTabLabels?.length ? { homeTabLabels } : {})
  };
}
