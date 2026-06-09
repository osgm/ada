/**
 * launchApp 后 smart-wait — 与 packages/driver-rpc/src/smart-wait.ts resolveLaunchSettleWait 对齐
 */

function envWaitOverride() {
  const until = process.env.ADA_WAIT_UNTIL?.trim();
  if (until !== "timeout" && until !== "ui_stable" && until !== "launch_settled") return {};
  const out = { until };
  if (process.env.ADA_WAIT_UI_STABLE_MS) out.stableMs = Number(process.env.ADA_WAIT_UI_STABLE_MS);
  if (process.env.ADA_WAIT_POLL_MS) out.pollMs = Number(process.env.ADA_WAIT_POLL_MS);
  if (process.env.ADA_WAIT_MAX_MS) out.timeoutMs = Number(process.env.ADA_WAIT_MAX_MS);
  return out;
}

/** @param {"android"|"ios"|"harmony"} platform */
export function resolveLaunchWait(platform, settleMs, explicitWait) {
  const defaultMax = 8000;
  const env = envWaitOverride();
  if (explicitWait?.until) {
    return {
      until: explicitWait.until,
      timeoutMs: explicitWait.timeoutMs ?? explicitWait.maxMs ?? defaultMax,
      pollMs: explicitWait.pollMs ?? 300,
      stablePolls: explicitWait.stablePolls ?? 3,
      stableMs: explicitWait.stableMs,
      ...env
    };
  }
  const maxMs = typeof settleMs === "number" && settleMs > 0 ? settleMs : defaultMax;
  // iOS WDA /source 单次可能很慢，launch_settled 反复 dump 易触发 COMMAND_TIMEOUT
  const until = env.until ?? (platform === "ios" ? "timeout" : "launch_settled");
  return {
    until,
    timeoutMs: env.timeoutMs ?? maxMs,
    pollMs: env.pollMs ?? 300,
    stablePolls: 3,
    stableMs: env.stableMs,
    ...env
  };
}

/** @param {(cmd: string, extra?: object) => Promise<unknown>} run */
export async function runLaunchSettle(run, platform, settleMs, explicitWait) {
  const wait = resolveLaunchWait(platform, settleMs, explicitWait);
  await run("custom", { custom: { action: "smart_wait" }, wait });
}
