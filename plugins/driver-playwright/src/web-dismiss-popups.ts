import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { WEB_DISMISS_DOM_CLICK_SCRIPT } from "../../../scripts/lib/popups-dismiss-dom.mjs";
import {
  WEB_POPUP_BLOCKER_PROBE_SCRIPT,
  WEB_POPUP_IDLE_POLLS,
  WEB_POPUP_PRE_WAIT_POLL_MS
} from "../../../scripts/lib/popups-wait-dom.mjs";
import { locatorFromPayload, resolveAutoWaitMs } from "./playwright-locator.js";

type PageLike = {
  evaluate: (script: string) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
};

const DOM_SCAN_BURST = 4;
const DISMISS_HIT_SLEEP_MS = 200;
const DISMISS_ROUND_SLEEP_MS = 200;
const DISMISS_LOCATOR_TIMEOUT_MS = 300;

const POPUP_ROOT =
  '[role="dialog"],dialog,[class*="modal" i],[class*="popup" i],[aria-modal="true"],' +
  '[class*="login-layer" i],[class*="login-modal" i],[class*="login-popup" i],[class*="login-bottom-bar" i],' +
  '[id*="dialog-wrap" i],[id*="dialog" i]';

const WEB_DISMISS_LOCATORS = [
  {
    css:
      `${POPUP_ROOT} [id*="close" i], ${POPUP_ROOT} [class*="close" i], ` +
      `${POPUP_ROOT} [class*="cancel" i], ${POPUP_ROOT} [class*="dismiss" i]`
  },
  {
    css:
      `#login2025-dialog-wrap [id*="close" i], #login2025-dialog-wrap [class*="close" i], ` +
      `#login2025-dialog-wrap [aria-label*="关闭"], #login2025-dialog-wrap [aria-label*="close" i]`
  },
  {
    css:
      `${POPUP_ROOT} [aria-label*="关闭"], ${POPUP_ROOT} [aria-label*="close" i], ` +
      `${POPUP_ROOT} [title*="关闭"], ${POPUP_ROOT} [title*="close" i]`
  },
  {
    css:
      `${POPUP_ROOT} img[id*="close" i], ${POPUP_ROOT} img[class*="close" i], ` +
      `${POPUP_ROOT} button[id*="close" i], ${POPUP_ROOT} button[class*="close" i]`
  },
  {
    css:
      `${POPUP_ROOT} [id^="close" i], ${POPUP_ROOT} [id$="close" i], ` +
      `${POPUP_ROOT} [class^="close" i], ${POPUP_ROOT} [class$="close" i]`
  },
  { css: `${POPUP_ROOT} [data-dismiss="modal"]` }
];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sleep(page: PageLike, ms: number) {
  return page.waitForTimeout(Math.max(0, ms));
}

async function waitForWebPopupReady(page: PageLike, budgetMs: number) {
  const deadline = Date.now() + Math.max(0, budgetMs);
  let idleStreak = 0;
  let sawBlocker = false;
  while (Date.now() < deadline) {
    const value = asRecord(await page.evaluate(WEB_POPUP_BLOCKER_PROBE_SCRIPT));
    if (value.blocking) {
      sawBlocker = true;
      idleStreak = 0;
      return { ready: true, reason: "blocking", id: String(value.id ?? "blocker") };
    }
    idleStreak += 1;
    if (idleStreak >= WEB_POPUP_IDLE_POLLS) {
      return { ready: true, reason: sawBlocker ? "cleared" : "idle" };
    }
    await sleep(page, WEB_POPUP_PRE_WAIT_POLL_MS);
  }
  return { ready: true, reason: "timeout", sawBlocker };
}

async function tryDomDismiss(page: PageLike) {
  const value = asRecord(await page.evaluate(WEB_DISMISS_DOM_CLICK_SCRIPT));
  return value.clicked === true ? value : null;
}

async function tryLocatorDismiss(page: PageLike, payload: Record<string, unknown>, waitMs: number) {
  for (const locatorSpec of WEB_DISMISS_LOCATORS) {
    const locator = locatorFromPayload(page as never, { ...payload, locator: locatorSpec });
    if (!locator) continue;
    try {
      await locator.click({ timeout: Math.min(waitMs, DISMISS_LOCATOR_TIMEOUT_MS) });
      return locatorSpec;
    } catch {
      // try next
    }
  }
  return null;
}

export async function executeDismissPopups(
  command: CommandEnvelope,
  page: PageLike,
  payload: Record<string, unknown>
): Promise<CommandResult> {
  const timeoutMs = Math.max(600, getNumber(payload.timeoutMs) ?? 10_000);
  const attempts = Math.max(1, Math.floor(getNumber(payload.attempts) ?? 4));
  const waitMs = resolveAutoWaitMs(payload);
  const started = Date.now();
  const deadline = started + timeoutMs;
  let dismissActions = 0;
  let rounds = 0;
  let idleStreak = 0;
  const hitLog: string[] = [];

  const preBudget = Math.min(4000, Math.max(600, Math.floor(timeoutMs * 0.45)));
  const pre = await waitForWebPopupReady(page, preBudget);
  if (pre.reason === "blocking") hitLog.push(`pre:${pre.id ?? "blocker"}`);
  else if (pre.reason === "idle") hitLog.push("pre:idle");

  while (Date.now() < deadline && rounds < attempts) {
    rounds += 1;
    let roundOk = false;

    for (let i = 0; i < DOM_SCAN_BURST; i++) {
      if (Date.now() >= deadline) break;
      const dom = await tryDomDismiss(page);
      if (!dom) break;
      roundOk = true;
      hitLog.push(`dom:${dom.via ?? "scan"}:${String(dom.text ?? dom.tag ?? "?").slice(0, 40)}`);
      await sleep(page, DISMISS_HIT_SLEEP_MS);
      break;
    }

    if (!roundOk) {
      const loc = await tryLocatorDismiss(page, payload, waitMs);
      if (loc) {
        roundOk = true;
        hitLog.push(`locator:${JSON.stringify(loc).slice(0, 72)}`);
        await sleep(page, DISMISS_HIT_SLEEP_MS);
      }
    }

    if (roundOk) {
      dismissActions += 1;
      idleStreak = 0;
    } else {
      idleStreak += 1;
      if (idleStreak >= 2) break;
    }
    if (Date.now() >= deadline) break;
    await sleep(page, DISMISS_ROUND_SLEEP_MS);
  }

  const endedAt = Date.now();
  const dismissed = dismissActions > 0;
  const timedOut = endedAt >= deadline;
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "playwright",
      command: command.command,
      action: "dismissPopups",
      businessCode: dismissed ? "POPUP_DISMISSED" : timedOut ? "POPUP_DISMISS_TIMEOUT" : "POPUP_NOT_FOUND",
      dismissed,
      reason: dismissed ? "dismissed" : timedOut ? "timed_out" : "no_popup",
      dismissActions,
      rounds,
      timedOut,
      elapsedMs: endedAt - started,
      timeoutMs,
      hits: hitLog
    }
  };
}
