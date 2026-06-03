/**
 * 分步 trace（与 step_log.py 对齐）；ADA_STEP_LOG=1 时输出 stderr
 */
export function stepLog(msg) {
  if (process.env.ADA_STEP_LOG?.trim() !== "1") return;
  const ms = String(Date.now() % 100_000).padStart(5, "0");
  console.error(`[${ms}ms] ${msg}`);
}
