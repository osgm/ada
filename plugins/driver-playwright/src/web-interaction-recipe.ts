import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  findControlByPath,
  normalizeControlPath,
  parseWebViewSnapshot,
  resolveExpandStrategy,
  WEB_INTERACTION_ERROR_CODES,
  WEB_VIEW_SCRIPT,
  type ControlObserveItem,
  type WebViewSnapshot,
  type ExpandStrategy,
  serializeRpcResult,
  truncateViewTreeValue
} from "@ada/driver-rpc";

const CLICK_PATH_CONTROLS_PREVIEW = 40;
import { autoWaitEnabled, resolveAutoWaitMs } from "./playwright-locator.js";

type PlaywrightPageLike = {
  url: () => string;
  evaluate: (script: string) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  getByRole: (role: string, options?: Record<string, unknown>) => any;
  locator: (selector: string) => any;
  waitForLoadState: (state: string, options?: Record<string, unknown>) => Promise<void>;
  waitForURL: (predicate: string | RegExp | ((url: URL) => boolean), options?: Record<string, unknown>) => Promise<void>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function failResult(command: CommandEnvelope, code: string, message: string, data?: Record<string, unknown>): CommandResult {
  return {
    requestId: command.requestId,
    success: false,
    errorCode: code,
    errorMessage: message,
    data
  };
}

export async function waitAfterNavigation(
  page: PlaywrightPageLike,
  payload: Record<string, unknown>,
  beforeUrl: string
): Promise<{ navigated: boolean; url: string }> {
  if (payload.waitNavigation !== true && payload.waitNavigation !== "true") {
    return { navigated: false, url: page.url() };
  }
  const timeoutMs = typeof payload.navigationTimeoutMs === "number" ? payload.navigationTimeoutMs : 8000;
  const before = beforeUrl || page.url();
  try {
    await page.waitForURL((url: URL) => url.href !== before, { timeout: timeoutMs });
    return { navigated: true, url: page.url() };
  } catch {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: Math.min(timeoutMs, 3000) });
    } catch {
      // ignore
    }
    const after = page.url();
    if (after !== before) {
      return { navigated: true, url: after };
    }
    return { navigated: false, url: after };
  }
}

export async function observeViewOnPage(page: PlaywrightPageLike): Promise<WebViewSnapshot> {
  const raw = await page.evaluate(WEB_VIEW_SCRIPT);
  const snapshot = parseWebViewSnapshot(raw);
  return {
    ...snapshot,
    url: snapshot.url || page.url()
  };
}

async function resolveLabelLocator(page: PlaywrightPageLike, label: string, nthFallback?: number): Promise<any | null> {
  const roles = ["menuitem", "link", "button", "tab"] as const;
  for (const role of roles) {
    try {
      const exact = page.getByRole(role, { name: label, exact: true });
      if ((await exact.count()) > 0) return exact.first();
    } catch {
      // continue
    }
    try {
      const loose = page.getByRole(role, { name: label });
      if ((await loose.count()) > 0) return loose.first();
    } catch {
      // continue
    }
  }
  try {
    const aria = page.locator(`[aria-label="${label.replace(/"/g, '\\"')}"]`);
    if ((await aria.count()) > 0) return aria.first();
  } catch {
    // continue
  }
  if (typeof nthFallback === "number" && nthFallback >= 0) {
    for (const role of ["menuitem", "button", "link"] as const) {
      try {
        const items = page.getByRole(role);
        const count = await items.count();
        if (nthFallback < count) return items.nth(nthFallback);
      } catch {
        // continue
      }
    }
  }
  return null;
}

async function expandPathSegment(
  page: PlaywrightPageLike,
  label: string,
  strategy: ExpandStrategy,
  waitMs: number,
  nthFallback?: number
): Promise<{ ok: boolean; error?: string }> {
  const locator = await resolveLabelLocator(page, label, nthFallback);
  if (!locator) {
    return { ok: false, error: `control label not found: ${label}` };
  }
  await autoWaitEnabled(locator, waitMs);
  if (strategy === "hover") {
    await locator.hover({ timeout: waitMs });
  } else {
    await locator.click({ timeout: waitMs });
  }
  await page.waitForTimeout(250);
  return { ok: true };
}

export async function executeClickPath(
  command: CommandEnvelope,
  page: PlaywrightPageLike,
  payload?: Record<string, unknown>
): Promise<CommandResult> {
  const path = normalizeControlPath(payload?.path);
  if (path.length === 0) {
    return failResult(command, WEB_INTERACTION_ERROR_CODES.PATH_INVALID, "clickPath requires non-empty path array");
  }
  const waitMs = resolveAutoWaitMs(payload);
  let observed = await observeViewOnPage(page);
  let targetMeta = findControlByPath(observed.flat, path);
  const beforeUrl = page.url();

  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    const segMeta = findControlByPath(observed.flat, path.slice(0, i + 1));
    const segStrategy = resolveExpandStrategy(payload?.strategy, segMeta);
    const nthFallback = segment ? undefined : Number(payload?.triggerNth ?? i);
    const expanded = await expandPathSegment(page, segment || "", segStrategy, waitMs, nthFallback);
    if (!expanded.ok) {
      return failResult(command, WEB_INTERACTION_ERROR_CODES.PATH_NOT_EXPANDED, expanded.error ?? `failed to expand ${segment}`, {
        path,
        segment,
        businessCode: WEB_INTERACTION_ERROR_CODES.PATH_NOT_EXPANDED
      });
    }
    observed = await observeViewOnPage(page);
    targetMeta = findControlByPath(observed.flat, path);
  }

  const leaf = path[path.length - 1];
  const leafStrategy = resolveExpandStrategy(payload?.strategy, targetMeta);
  const isLeafPopup = targetMeta?.hasPopup === true && path.length === 1;
  const locator = await resolveLabelLocator(page, leaf, Number(payload?.leafNth));
  if (!locator) {
    return failResult(command, WEB_INTERACTION_ERROR_CODES.CONTROL_NOT_FOUND, `path leaf not found: ${leaf}`, {
      path,
      businessCode: WEB_INTERACTION_ERROR_CODES.CONTROL_NOT_FOUND
    });
  }
  await autoWaitEnabled(locator, waitMs);
  if (isLeafPopup && leafStrategy === "hover") {
    await locator.hover({ timeout: waitMs });
  } else {
    await locator.click({ timeout: waitMs });
  }

  const waitPayload = {
    ...payload,
    waitNavigation: payload?.waitNavigation !== false
  };
  const nav = await waitAfterNavigation(page, waitPayload, beforeUrl);
  if (waitPayload.waitNavigation === true && !nav.navigated && (targetMeta?.href || payload?.requireNavigation === true)) {
    return failResult(command, WEB_INTERACTION_ERROR_CODES.NAV_TIMEOUT, `navigation did not complete after clickPath: ${leaf}`, {
      path,
      beforeUrl,
      afterUrl: nav.url,
      businessCode: WEB_INTERACTION_ERROR_CODES.NAV_TIMEOUT
    });
  }

  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "playwright",
      command: "recipe",
      action: "clickPath",
      path,
      strategy: leafStrategy,
      navigated: nav.navigated,
      url: nav.url,
      controls: serializeRpcResult(truncateViewTreeValue(observed.flat, CLICK_PATH_CONTROLS_PREVIEW).value),
      controlsTruncated: observed.flat.length > CLICK_PATH_CONTROLS_PREVIEW ? true : undefined,
      reObservedAfterExpand: path.length > 1 ? true : undefined,
      businessCode: "PATH_CLICK_OK"
    }
  };
}
