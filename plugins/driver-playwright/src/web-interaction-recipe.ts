import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  findControlByPath,
  findSearchEntryInFlat,
  findSearchInputInFlat,
  normalizeControlPath,
  parseFillSearchPayload,
  parseWebViewSnapshot,
  resolveClickPathWaitNavigation,
  resolveExpandStrategy,
  resolveFillSearchSettleMs,
  resolveWebExpandSettleMs,
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
  getByPlaceholder: (text: string, options?: Record<string, unknown>) => any;
  locator: (selector: string) => any;
  waitForLoadState: (state: string, options?: Record<string, unknown>) => Promise<void>;
  waitForURL: (predicate: string | RegExp | ((url: URL) => boolean), options?: Record<string, unknown>) => Promise<void>;
};

type PlaywrightLocatorLike = {
  count: () => Promise<number>;
  first: () => PlaywrightLocatorLike;
  click: (options?: Record<string, unknown>) => Promise<void>;
  fill: (value: string, options?: Record<string, unknown>) => Promise<void>;
  press: (key: string, options?: Record<string, unknown>) => Promise<void>;
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
  expandSettleMs: number,
  nthFallback?: number
): Promise<{ ok: boolean; error?: string }> {
  const locator = await resolveLabelLocator(page, label, nthFallback);
  if (!locator) {
    return { ok: false, error: `control label not found: ${label}` };
  }
  if (strategy === "hover") {
    await locator.hover({ timeout: waitMs });
  } else {
    await locator.click({ timeout: waitMs });
  }
  if (expandSettleMs > 0) {
    await page.waitForTimeout(expandSettleMs);
  }
  return { ok: true };
}

async function firstVisibleLocator(
  locator: PlaywrightLocatorLike,
  waitMs: number
): Promise<PlaywrightLocatorLike | null> {
  try {
    const count = await locator.count();
    if (count <= 0) return null;
    const first = locator.first();
    await autoWaitEnabled(first, waitMs);
    return first;
  } catch {
    return null;
  }
}

/** Fast DOM probe without auto-wait (for fill_search polling after entry tap) */
async function probeSearchInputLocator(
  page: PlaywrightPageLike,
  inputHints: string[]
): Promise<{ locator: PlaywrightLocatorLike; mode: string } | null> {
  try {
    const searchbox = page.getByRole("searchbox");
    if ((await searchbox.count()) > 0) {
      return { locator: searchbox.first(), mode: "searchbox" };
    }
  } catch {
    // continue
  }
  try {
    const typeSearch = page.locator('input[type="search"]');
    if ((await typeSearch.count()) > 0) {
      return { locator: typeSearch.first(), mode: "input-type-search" };
    }
  } catch {
    // continue
  }
  for (const hint of inputHints) {
    for (const role of ["textbox", "searchbox"] as const) {
      try {
        const byRole = page.getByRole(role, { name: hint });
        if ((await byRole.count()) > 0) {
          return { locator: byRole.first(), mode: `role-${role}` };
        }
      } catch {
        // continue
      }
    }
    try {
      const byPlaceholder = page.getByPlaceholder(hint);
      if ((await byPlaceholder.count()) > 0) {
        return { locator: byPlaceholder.first(), mode: "placeholder" };
      }
    } catch {
      // continue
    }
  }
  try {
    const headerInput = page.locator('header input, nav input, [role="search"] input, form input[type="search"]');
    if ((await headerInput.count()) > 0) {
      return { locator: headerInput.first(), mode: "header-input" };
    }
  } catch {
    // continue
  }
  return null;
}

async function waitForSearchInputAfterEntry(
  page: PlaywrightPageLike,
  inputHints: string[],
  maxMs: number,
  pollMs = 80
): Promise<{ locator: PlaywrightLocatorLike; mode: string } | null> {
  if (maxMs <= 0) {
    return probeSearchInputLocator(page, inputHints);
  }
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const hit = await probeSearchInputLocator(page, inputHints);
    if (hit) {
      return hit;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await page.waitForTimeout(Math.min(pollMs, remaining));
  }
  return probeSearchInputLocator(page, inputHints);
}

async function resolveSearchInputLocator(
  page: PlaywrightPageLike,
  inputHints: string[],
  waitMs: number,
  flat?: ControlObserveItem[]
): Promise<{ locator: PlaywrightLocatorLike; mode: string } | null> {
  const probed = await probeSearchInputLocator(page, inputHints);
  if (probed) {
    try {
      await autoWaitEnabled(probed.locator, waitMs);
      return probed;
    } catch {
      // fall through to slower paths
    }
  }

  const observed = flat ?? (await observeViewOnPage(page)).flat;
  const meta = findSearchInputInFlat(observed, inputHints);
  const label = meta?.name ?? meta?.ariaLabel;
  if (label) {
    const fromFlat = await resolveLabelLocator(page, label);
    if (fromFlat) {
      try {
        await autoWaitEnabled(fromFlat, waitMs);
        return { locator: fromFlat, mode: "flat-input" };
      } catch {
        // continue
      }
    }
  }

  return null;
}

async function resolveSearchEntryLocator(
  page: PlaywrightPageLike,
  entryHints: string[],
  waitMs: number,
  flat?: ControlObserveItem[]
): Promise<{ locator: PlaywrightLocatorLike; mode: string; meta?: ControlObserveItem } | null> {
  for (const hint of entryHints) {
    for (const role of ["button", "link", "menuitem"] as const) {
      const byRole = await firstVisibleLocator(page.getByRole(role, { name: hint }), waitMs);
      if (byRole) return { locator: byRole, mode: `entry-${role}` };
    }
  }

  const observed = flat ?? (await observeViewOnPage(page)).flat;
  const meta = findSearchEntryInFlat(observed, entryHints);
  const label = meta?.name ?? meta?.ariaLabel;
  if (label) {
    const fromFlat = await resolveLabelLocator(page, label);
    if (fromFlat) {
      try {
        await autoWaitEnabled(fromFlat, waitMs);
        return { locator: fromFlat, mode: "flat-entry", meta };
      } catch {
        // continue
      }
    }
  }

  return null;
}

export async function executeFillSearch(
  command: CommandEnvelope,
  page: PlaywrightPageLike,
  payload?: Record<string, unknown>
): Promise<CommandResult> {
  const text = getString(payload?.text);
  if (!text) {
    return failResult(
      command,
      WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_MISSING_TEXT,
      "fill_search requires text"
    );
  }

  const parsed = parseFillSearchPayload(payload);
  const waitMs = resolveAutoWaitMs(payload);
  const beforeUrl = page.url();
  let mode = "direct";
  let tapMode: string | undefined;
  let tapMeta: ControlObserveItem | undefined;

  let input = await resolveSearchInputLocator(page, parsed.inputHints, waitMs);
  if (!input) {
    const entry = await resolveSearchEntryLocator(page, parsed.entryHints, waitMs);
    if (!entry) {
      if (parsed.strict) {
        return failResult(
          command,
          WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_ENTRY,
          "search entry not found (strict)",
          { entryHints: parsed.entryHints, businessCode: WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_ENTRY }
        );
      }
      return failResult(
        command,
        WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_ENTRY,
        "search entry not found",
        { entryHints: parsed.entryHints, businessCode: WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_ENTRY }
      );
    }

    tapMode = entry.mode;
    tapMeta = entry.meta;
    await entry.locator.click({ timeout: waitMs });
    mode = "entryTap";
    const settleMs = resolveFillSearchSettleMs(
      entry.mode.includes("flat") ? "direct input" : undefined,
      parsed.recipeOptions.settleMs
    );
    input = await waitForSearchInputAfterEntry(page, parsed.inputHints, settleMs);
    if (input) {
      try {
        await autoWaitEnabled(input.locator, waitMs);
      } catch {
        input = null;
      }
    }
  }

  if (!input) {
    if (parsed.strict) {
      return failResult(
        command,
        WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_INPUT,
        "search input not found (strict)",
        { inputHints: parsed.inputHints, tapMode, businessCode: WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_INPUT }
      );
    }
    return failResult(
      command,
      WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_INPUT,
      "search input not found",
      { inputHints: parsed.inputHints, tapMode, businessCode: WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_INPUT }
    );
  }

  try {
    await input.locator.fill(text, { timeout: waitMs });
    await input.locator.press("Enter", { timeout: waitMs });
  } catch (error) {
    return failResult(
      command,
      WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
      error instanceof Error ? error.message : String(error),
      {
        mode,
        inputMode: input.mode,
        tapMode,
        businessCode: WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_TYPE_FAILED
      }
    );
  }

  const nav = await waitAfterNavigation(page, { ...payload, waitNavigation: payload?.waitNavigation === true }, beforeUrl);

  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "playwright",
      command: "recipe",
      action: "fill_search",
      text,
      mode,
      inputMode: input.mode,
      tapMode,
      tapMeta,
      enterOk: true,
      navigated: nav.navigated,
      url: nav.url,
      businessCode: "FILL_SEARCH_OK"
    }
  };
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
  const expandSettleMs = resolveWebExpandSettleMs(payload);
  let observed = await observeViewOnPage(page);
  let targetMeta = findControlByPath(observed.flat, path);
  const beforeUrl = page.url();

  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    const segMeta = findControlByPath(observed.flat, path.slice(0, i + 1));
    const segStrategy = resolveExpandStrategy(payload?.strategy, segMeta);
    const nthFallback = segment ? undefined : Number(payload?.triggerNth ?? i);
    const expanded = await expandPathSegment(page, segment || "", segStrategy, waitMs, expandSettleMs, nthFallback);
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
  if (isLeafPopup && leafStrategy === "hover") {
    await locator.hover({ timeout: waitMs });
  } else {
    await locator.click({ timeout: waitMs });
  }

  const shouldWaitNavigation = resolveClickPathWaitNavigation(payload, targetMeta);
  const waitPayload = {
    ...payload,
    waitNavigation: shouldWaitNavigation
  };
  const nav = await waitAfterNavigation(page, waitPayload, beforeUrl);
  if (shouldWaitNavigation && !nav.navigated && (targetMeta?.href || payload?.requireNavigation === true)) {
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
      waitNavigation: shouldWaitNavigation,
      controls: serializeRpcResult(truncateViewTreeValue(observed.flat, CLICK_PATH_CONTROLS_PREVIEW).value),
      controlsTruncated: observed.flat.length > CLICK_PATH_CONTROLS_PREVIEW ? true : undefined,
      reObservedAfterExpand: path.length > 1 ? true : undefined,
      businessCode: "PATH_CLICK_OK"
    }
  };
}
