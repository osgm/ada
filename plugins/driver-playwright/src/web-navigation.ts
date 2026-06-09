const VALID_WAIT_UNTIL = new Set(["load", "domcontentloaded", "networkidle", "commit"]);

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export type GotoWaitUntil = "load" | "domcontentloaded" | "networkidle" | "commit";

export interface GotoOptions {
  waitUntil: GotoWaitUntil;
  timeout: number;
}

/** 重站默认 domcontentloaded，避免 load 事件迟迟不触发导致 30s 超时 */
export function resolveGotoOptions(payload: Record<string, unknown> | undefined): GotoOptions {
  const raw = payload?.waitUntil;
  const waitUntil =
    typeof raw === "string" && VALID_WAIT_UNTIL.has(raw) ? (raw as GotoWaitUntil) : "domcontentloaded";
  const timeout =
    getNumber(payload?.navigationTimeoutMs) ??
    getNumber(payload?.timeoutMs) ??
    30_000;
  return { waitUntil, timeout: Math.max(1000, timeout) };
}

export async function gotoPage(
  page: { goto: (url: string, options?: Record<string, unknown>) => Promise<unknown> },
  url: string,
  payload?: Record<string, unknown>
): Promise<void> {
  const opts = resolveGotoOptions(payload);
  await page.goto(url, { waitUntil: opts.waitUntil, timeout: opts.timeout });
}
