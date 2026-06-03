import type { ScreenSize } from "@ada/mobile-ui";

/** hypium KeyCode.VIRTUAL_MULTITASK — 打开最近任务 */
export const HARMONY_KEY_RECENTS = 2210;

export const HARMONY_CLEAR_RECENTS_LABELS = ["清除全部", "全部关闭", "关闭全部", "一键清除", "清空"] as const;

export type HarmonySwipeNorm = {
  from: [number, number];
  to: [number, number];
  durationMs: number;
};

export {
  harmonySwipePixels,
  normalizedSwipePoints,
  resolveSwipeEndpoints,
  resolveSwipePoint,
  SWIPE_POINT_PRESETS
} from "./swipe-coords.js";
export type { ResolveSwipeCoordsOptions, SwipePointInput } from "./swipe-coords.js";
