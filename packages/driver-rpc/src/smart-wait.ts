import type { UiNode } from "@ada/mobile-ui";

export type WaitUntilMode = "timeout" | "ui_stable" | "launch_settled";

export interface SmartWaitOptions {
  until: WaitUntilMode;
  timeoutMs?: number;
  stableMs?: number;
  pollMs?: number;
  /** launch_settled：连续多少次 dump 节点数相同视为稳定 */
  stablePolls?: number;
}

export interface UiDumpReader {
  dumpUi(): Promise<UiNode[]>;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function smartWaitFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<SmartWaitOptions> {
  const until = env.ADA_WAIT_UNTIL?.trim() as WaitUntilMode | undefined;
  return {
    ...(until === "ui_stable" || until === "launch_settled" || until === "timeout" ? { until } : {}),
    ...(env.ADA_WAIT_UI_STABLE_MS ? { stableMs: Number(env.ADA_WAIT_UI_STABLE_MS) } : {}),
    ...(env.ADA_WAIT_POLL_MS ? { pollMs: Number(env.ADA_WAIT_POLL_MS) } : {}),
    ...(env.ADA_WAIT_MAX_MS ? { timeoutMs: Number(env.ADA_WAIT_MAX_MS) } : {})
  };
}

export function parseSmartWaitFromPayload(payload?: Record<string, unknown>): SmartWaitOptions | null {
  const p = payload ?? {};
  const wait = (typeof p.wait === "object" && p.wait !== null ? p.wait : undefined) as Record<string, unknown> | undefined;
  const custom = (typeof p.custom === "object" && p.custom !== null ? p.custom : undefined) as
    | Record<string, unknown>
    | undefined;
  const block = (wait ?? custom?.wait) as Record<string, unknown> | undefined;
  if (!block || typeof block !== "object") return null;
  const until = String(block.until ?? "").trim() as WaitUntilMode;
  if (until !== "timeout" && until !== "ui_stable" && until !== "launch_settled") return null;
  return {
    until,
    timeoutMs: numberOr(block.timeoutMs ?? block.maxMs, 15_000),
    stableMs: numberOr(block.stableMs, 600),
    pollMs: numberOr(block.pollMs, 400),
    stablePolls: numberOr(block.stablePolls, 3)
  };
}

export function mergeSmartWait(
  ...parts: Array<Partial<SmartWaitOptions> | null | undefined>
): SmartWaitOptions {
  const merged: SmartWaitOptions = { until: "timeout", timeoutMs: 1000, stableMs: 600, pollMs: 400, stablePolls: 3 };
  for (const p of parts) {
    if (!p) continue;
    Object.assign(merged, p);
  }
  return merged;
}

export async function runSmartWait(reader: UiDumpReader | undefined, options: SmartWaitOptions): Promise<void> {
  if (options.until === "timeout" || !reader) {
    await new Promise((r) => setTimeout(r, options.timeoutMs ?? 1000));
    return;
  }

  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  const pollMs = options.pollMs ?? 400;
  const stableMs = options.stableMs ?? 600;
  const needPolls = options.stablePolls ?? 3;

  if (options.until === "ui_stable") {
    let lastCount = -1;
    let stableSince = 0;
    while (Date.now() < deadline) {
      const nodes = await reader.dumpUi();
      const count = nodes.length;
      if (count > 0 && count === lastCount) {
        if (stableSince === 0) stableSince = Date.now();
        if (Date.now() - stableSince >= stableMs) return;
      } else {
        lastCount = count;
        stableSince = 0;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return;
  }

  // launch_settled: N consecutive equal node counts
  let lastCount = -1;
  let streak = 0;
  while (Date.now() < deadline) {
    const nodes = await reader.dumpUi();
    const count = nodes.length;
    if (count > 0 && count === lastCount) {
      streak += 1;
      if (streak >= needPolls) return;
    } else {
      lastCount = count;
      streak = count > 0 ? 1 : 0;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export async function recipeSettleDelay(
  reader: UiDumpReader | undefined,
  payload?: Record<string, unknown>,
  fallbackMs = 600
): Promise<void> {
  const fromPayload = parseSmartWaitFromPayload(payload);
  const fromEnv = smartWaitFromEnv();
  const opts = mergeSmartWait({ until: "timeout", timeoutMs: fallbackMs }, fromEnv, fromPayload);
  await runSmartWait(reader, opts);
}

export type LaunchPlatform = "android" | "ios" | "harmony";

/** launchApp 后 settle：数字 settleMs 为上限，优先 launch_settled 早返回 */
export function resolveLaunchSettleWait(
  platform: LaunchPlatform,
  settleMs?: number,
  explicitWait?: Partial<SmartWaitOptions> | null
): SmartWaitOptions {
  const defaultMax = 8000;
  const fromEnv = smartWaitFromEnv();
  if (explicitWait?.until) {
    return mergeSmartWait(
      { until: "launch_settled", timeoutMs: defaultMax, pollMs: 300, stablePolls: 3 },
      fromEnv,
      explicitWait
    );
  }
  const maxMs = typeof settleMs === "number" && settleMs > 0 ? settleMs : defaultMax;
  return mergeSmartWait(
    { until: "launch_settled", timeoutMs: maxMs, pollMs: 300, stablePolls: 3 },
    fromEnv
  );
}
