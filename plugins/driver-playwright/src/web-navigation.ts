import { resolveNavigationTimeoutMs } from "@ada/driver-rpc";

const VALID_WAIT_UNTIL = new Set(["load", "domcontentloaded", "networkidle", "commit"]);

export type GotoWaitUntil = "load" | "domcontentloaded" | "networkidle" | "commit";

export interface GotoOptions {
  waitUntil: GotoWaitUntil;
  timeout: number;
}

type GotoPage = {
  goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
  waitForLoadState?: (state: string, options?: { timeout?: number }) => Promise<unknown>;
};

/** domcontentloaded 之后再等 load，超时不失败（慢资源/水合） */
const POST_GOTO_LOAD_WAIT_MS = 15_000;

/** 重站默认 domcontentloaded；打开页超时默认 2 分钟，见 resolveNavigationTimeoutMs */
export function resolveGotoOptions(payload: Record<string, unknown> | undefined): GotoOptions {
  const raw = payload?.waitUntil;
  const waitUntil =
    typeof raw === "string" && VALID_WAIT_UNTIL.has(raw) ? (raw as GotoWaitUntil) : "domcontentloaded";
  return { waitUntil, timeout: resolveNavigationTimeoutMs(payload) };
}

export async function gotoPage(page: GotoPage, url: string, payload?: Record<string, unknown>): Promise<void> {
  const opts = resolveGotoOptions(payload);
  await page.goto(url, { waitUntil: opts.waitUntil, timeout: opts.timeout });
  if (opts.waitUntil === "load" || opts.waitUntil === "networkidle") return;
  if (typeof page.waitForLoadState !== "function") return;
  try {
    await page.waitForLoadState("load", { timeout: POST_GOTO_LOAD_WAIT_MS });
  } catch {
    // DOM 已就绪；load 迟到不把本次打开判失败
  }
}
