import { resolveNavigationTimeoutMs } from "@ada/driver-rpc";

const VALID_WAIT_UNTIL = new Set(["load", "domcontentloaded", "networkidle", "commit"]);

export type GotoWaitUntil = "load" | "domcontentloaded" | "networkidle" | "commit";

export interface GotoOptions {
  waitUntil: GotoWaitUntil;
  timeout: number;
}

/** 重站默认 domcontentloaded；超时默认 ≥60s（登录墙），见 resolveNavigationTimeoutMs */
export function resolveGotoOptions(payload: Record<string, unknown> | undefined): GotoOptions {
  const raw = payload?.waitUntil;
  const waitUntil =
    typeof raw === "string" && VALID_WAIT_UNTIL.has(raw) ? (raw as GotoWaitUntil) : "domcontentloaded";
  return { waitUntil, timeout: resolveNavigationTimeoutMs(payload) };
}

export async function gotoPage(
  page: { goto: (url: string, options?: Record<string, unknown>) => Promise<unknown> },
  url: string,
  payload?: Record<string, unknown>
): Promise<void> {
  const opts = resolveGotoOptions(payload);
  await page.goto(url, { waitUntil: opts.waitUntil, timeout: opts.timeout });
}
