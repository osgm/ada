import type { UiNode } from "@ada/mobile-ui";
import type { MobileRecipeContext } from "./mobile-recipes.js";
import { recipeSettleDelay } from "./smart-wait.js";

export const MOBILE_DISMISS_LABELS = [
  "关闭",
  "跳过",
  "我知道了",
  "知道了",
  "暂不",
  "不再提示",
  "取消",
  "×",
  "Close",
  "Got it"
] as const;

const DISMISS_HIT_SLEEP_MS = 200;
const DISMISS_ROUND_SLEEP_MS = 200;
const DEFAULT_DISMISS_TIMEOUT_MS = 10_000;

export type MobileDismissBusinessCode = "POPUP_DISMISSED" | "POPUP_DISMISS_TIMEOUT" | "POPUP_NOT_FOUND";

export interface MobileDismissPopupsResult {
  businessCode: MobileDismissBusinessCode;
  dismissed: boolean;
  reason: string;
  dismissActions: number;
  rounds: number;
  timedOut: boolean;
  elapsedMs: number;
  timeoutMs: number;
  hits: string[];
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function matchDismissLabel(node: UiNode, label: string): boolean {
  if (!node.clickable) return false;
  const needle = label.trim().toLowerCase();
  if (!needle) return false;
  const hay = `${node.text} ${node.desc}`.toLowerCase();
  return hay.includes(needle) || node.text === label || node.desc === label;
}

function findDismissNode(nodes: UiNode[], label: string): UiNode | null {
  for (const node of nodes) {
    if (matchDismissLabel(node, label)) return node;
  }
  return null;
}

async function dismissRound(ctx: MobileRecipeContext, deadline: number, hitLog: string[]): Promise<boolean> {
  if (Date.now() >= deadline) return false;
  ctx.invalidateDumpCache?.();
  let nodes: UiNode[] = [];
  try {
    nodes = await ctx.dumpUi();
  } catch {
    nodes = [];
  }

  for (const label of MOBILE_DISMISS_LABELS) {
    if (Date.now() >= deadline) break;
    const node = findDismissNode(nodes, label);
    if (!node) continue;
    try {
      await ctx.clickPoint(node.point);
      hitLog.push(`text:${label}`);
      await recipeSettleDelay(ctx, undefined, DISMISS_HIT_SLEEP_MS);
      return true;
    } catch {
      // try next label
    }
  }

  if (Date.now() >= deadline) return false;
  const x = Math.round(ctx.screen.width * 0.92);
  const y = Math.round(ctx.screen.height * 0.08);
  try {
    await ctx.clickPoint([x, y]);
    hitLog.push(`point:${x},${y}`);
    return true;
  } catch {
    return false;
  }
}

export async function executeMobileDismissPopups(
  ctx: MobileRecipeContext,
  payload?: Record<string, unknown>
): Promise<MobileDismissPopupsResult> {
  const timeoutMs = Math.max(0, numberOr(payload?.timeoutMs, DEFAULT_DISMISS_TIMEOUT_MS));
  const attempts = Math.max(1, Math.floor(numberOr(payload?.attempts, Number.POSITIVE_INFINITY)));
  const started = Date.now();
  const deadline = started + timeoutMs;
  let dismissActions = 0;
  let rounds = 0;
  let idleStreak = 0;
  const hitLog: string[] = [];

  while (Date.now() < deadline && rounds < attempts) {
    rounds += 1;
    let roundOk = false;
    try {
      roundOk = await dismissRound(ctx, deadline, hitLog);
    } catch {
      roundOk = false;
    }

    if (roundOk) {
      dismissActions += 1;
      idleStreak = 0;
    } else {
      idleStreak += 1;
      if (idleStreak >= 2) break;
    }
    if (Date.now() >= deadline) break;
    await recipeSettleDelay(ctx, undefined, DISMISS_ROUND_SLEEP_MS);
  }

  const endedAt = Date.now();
  const dismissed = dismissActions > 0;
  const timedOut = endedAt >= deadline;
  return {
    businessCode: dismissed ? "POPUP_DISMISSED" : timedOut ? "POPUP_DISMISS_TIMEOUT" : "POPUP_NOT_FOUND",
    dismissed,
    reason: dismissed ? "dismissed" : timedOut ? "timed_out" : "no_popup",
    dismissActions,
    rounds,
    timedOut,
    elapsedMs: endedAt - started,
    timeoutMs,
    hits: hitLog
  };
}
