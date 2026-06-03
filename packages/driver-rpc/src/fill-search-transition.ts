import type { ScreenSize, UiPickResult } from "@ada/mobile-ui";

/** 首页「搜索栏」点按后跳转搜索页时的默认等待（毫秒） */
export const FILL_SEARCH_DIRECT_INPUT_SETTLE_MS = 800;
/** 检测到页面切换后的追加等待（毫秒） */
export const FILL_SEARCH_PAGE_TRANSITION_SETTLE_MS = 500;
/** 常规 tap 后等待（毫秒） */
export const FILL_SEARCH_DEFAULT_SETTLE_MS = 400;

function resourceIdFromLabel(label: string): string {
  const m = label.match(/([\w.]+:id\/\w+)/i);
  return (m?.[1] ?? label).toLowerCase();
}

export function pickPointDistance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** tap 前后 pick 变化 → 视为已跳转（如京东首页 → 搜索页） */
export function detectFillSearchPageTransition(
  tapPick: UiPickResult | undefined,
  afterPick: UiPickResult | null,
  screen: ScreenSize,
  beforeNodeCount = 0,
  afterNodeCount = 0
): boolean {
  if (tapPick?.point && afterPick?.point) {
    const threshold = Math.min(screen.width, screen.height) * 0.06;
    if (pickPointDistance(tapPick.point, afterPick.point) >= threshold) return true;
    const tapLabel = (tapPick.label ?? "").trim();
    const afterLabel = (afterPick.label ?? "").trim();
    if (tapLabel && afterLabel && tapLabel !== afterLabel) {
      if (resourceIdFromLabel(tapLabel) !== resourceIdFromLabel(afterLabel)) return true;
    }
  }
  if (beforeNodeCount > 0 && afterNodeCount > 0) {
    const ratio = afterNodeCount / beforeNodeCount;
    if (ratio < 0.55 || ratio > 1.75) return true;
  }
  return false;
}

export function isDirectInputTapDetail(detail: string | undefined): boolean {
  return typeof detail === "string" && detail.includes("direct input");
}

export function resolveFillSearchSettleMs(
  tapDetail: string | undefined,
  userSettleMs?: number
): number {
  if (typeof userSettleMs === "number" && userSettleMs > 0) return userSettleMs;
  return isDirectInputTapDetail(tapDetail) ? FILL_SEARCH_DIRECT_INPUT_SETTLE_MS : FILL_SEARCH_DEFAULT_SETTLE_MS;
}
