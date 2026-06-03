/**
 * 关页面弹窗（仅 dialog / popup / modal；串行执行，不碰 Escape / 全屏遮罩）
 */
import { ada, sleep } from "./ada.mjs";
import { WEB_DISMISS_DOM_CLICK_SCRIPT } from "./popups-dismiss-dom.mjs";
import {
  WEB_POPUP_BLOCKER_PROBE_SCRIPT,
  WEB_POPUP_IDLE_POLLS,
  WEB_POPUP_PRE_WAIT_POLL_MS
} from "./popups-wait-dom.mjs";

export { WEB_DISMISS_DOM_CLICK_SCRIPT } from "./popups-dismiss-dom.mjs";

export const DEFAULT_DISMISS_TIMEOUT_MS = 10_000;

const DOM_SCAN_BURST = 4;
const DISMISS_ACTION_WAIT_MS = 1_200;
/** 关弹窗探测：文案未命中时尽快跳过（默认 600 易拖长单轮） */
const DISMISS_LOCATOR_TIMEOUT_MS = 300;
const DISMISS_HIT_SLEEP_MS = 200;
const DISMISS_ROUND_SLEEP_MS = 200;
const POPUP_ROOT =
  '[role="dialog"],dialog,[class*="modal" i],[class*="popup" i],[aria-modal="true"],' +
  '[class*="login-layer" i],[class*="login-modal" i],[class*="login-popup" i],[class*="login-bottom-bar" i],' +
  '[id*="dialog-wrap" i],[id*="dialog" i]';

/** 仅在弹窗根节点内的关闭按钮 */
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

const MOBILE_DISMISS_LABELS = [
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
];

/**
 * @param {number|false|null|undefined|{ timeoutMs?: number, attempts?: number }} arg
 *   不传 → 默认 {@link DEFAULT_DISMISS_TIMEOUT_MS}（10s）；数字为**整次调用总时长上限**（非每轮各 N 秒）
 * @param {number|undefined} attemptsArg 最多轮数（与 timeoutMs 同时生效，先到先停）
 */
export function normalizeDismissOpts(arg, attemptsArg) {
  const normalizeAttempts = (value) => {
    if (value == null) return Number.POSITIVE_INFINITY;
    const n = Number(value);
    if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY;
    return Math.max(1, Math.floor(n));
  };

  if (arg === undefined || arg === null || arg === false) {
    return { timeoutMs: DEFAULT_DISMISS_TIMEOUT_MS, attempts: normalizeAttempts(attemptsArg) };
  }
  if (typeof arg === "number") {
    return { timeoutMs: Math.max(0, arg), attempts: normalizeAttempts(attemptsArg) };
  }
  return {
    timeoutMs: arg.timeoutMs ?? DEFAULT_DISMISS_TIMEOUT_MS,
    attempts: normalizeAttempts(arg.attempts ?? attemptsArg)
  };
}

function dismissPayload(options = {}) {
  const waitTimeoutMs =
    options.dismissWaitMs ?? options.dismissActionWaitMs ?? DISMISS_ACTION_WAIT_MS;
  return {
    ...options,
    waitTimeoutMs,
    /** 探测关弹窗：未命中返回 UI_ELEMENT_NOT_FOUND 业务码，不抛系统异常 */
    optional: true,
    bestEffort: true,
    locatorTimeoutMs: options.locatorTimeoutMs ?? DISMISS_LOCATOR_TIMEOUT_MS
  };
}

/** 关弹窗探测：任何底层异常都视为业务未命中，不向上抛 */
async function safeAda(platform, sessionId, command, payload) {
  try {
    return await ada(platform, sessionId, command, payload);
  } catch (error) {
    return {
      success: false,
      errorCode: "UI_ELEMENT_NOT_FOUND",
      errorMessage: error instanceof Error ? error.message : String(error),
      data: { businessCode: "LOCATOR_NOT_FOUND", optional: true }
    };
  }
}

/**
 * @typedef {object} DismissPopupsResult
 * @property {boolean} success
 * @property {boolean} dismissed
 * @property {string} businessCode POPUP_DISMISSED | POPUP_NOT_FOUND | POPUP_DISMISS_TIMEOUT
 * @property {string} reason dismissed | no_popup | timed_out
 * @property {number} dismissActions
 * @property {number} rounds
 * @property {boolean} timedOut
 * @property {number} elapsedMs
 * @property {number} timeoutMs
 * @property {string[]} hits
 */

async function waitForWebPopupReady(sessionId, payload, budgetMs) {
  const deadline = Date.now() + Math.max(0, budgetMs);
  let idleStreak = 0;
  let sawBlocker = false;
  while (Date.now() < deadline) {
    const r = await safeAda("web", sessionId, "custom", {
      ...payload,
      action: "evaluate",
      script: WEB_POPUP_BLOCKER_PROBE_SCRIPT
    });
    if (!r.success) break;
    const value = r.data?.value;
    if (value?.blocking) {
      sawBlocker = true;
      idleStreak = 0;
      return { ready: true, reason: "blocking", id: value.id ?? "blocker" };
    }
    idleStreak += 1;
    if (idleStreak >= WEB_POPUP_IDLE_POLLS) {
      return { ready: true, reason: sawBlocker ? "cleared" : "idle" };
    }
    await sleep(WEB_POPUP_PRE_WAIT_POLL_MS);
  }
  return { ready: true, reason: "timeout", sawBlocker };
}

export async function dismissWebPopups(sessionId, options = {}, dismissArg, attemptsArg) {
  const { timeoutMs, attempts } = normalizeDismissOpts(dismissArg, attemptsArg);
  const payload = dismissPayload(options);
  const started = Date.now();
  const deadline = started + timeoutMs;
  let dismissActions = 0;
  let rounds = 0;
  let idleStreak = 0;
  const hitLog = [];

  const preBudget = Math.min(4000, Math.max(600, Math.floor(timeoutMs * 0.45)));
  const pre = await waitForWebPopupReady(sessionId, payload, preBudget);
  if (pre.reason === "blocking") hitLog.push(`pre:${pre.id ?? "blocker"}`);
  else if (pre.reason === "idle") hitLog.push("pre:idle");

  while (Date.now() < deadline && rounds < attempts) {
    rounds += 1;
    let roundOk = false;

    for (let i = 0; i < DOM_SCAN_BURST; i++) {
      if (Date.now() >= deadline) break;
      const r = await safeAda("web", sessionId, "custom", {
        ...payload,
        action: "evaluate",
        script: WEB_DISMISS_DOM_CLICK_SCRIPT
      });
      if (!r.success) break;
      const value = r.data?.value;
      if (!value?.clicked) break;
      roundOk = true;
      hitLog.push(`dom:${value.via}:${value.text ?? value.tag ?? "?"}`);
      await sleep(DISMISS_HIT_SLEEP_MS);
      break;
    }

    if (!roundOk) {
      for (const locator of WEB_DISMISS_LOCATORS) {
        if (Date.now() >= deadline) break;
        const r = await safeAda("web", sessionId, "click", { ...payload, locator });
        if (!r.success) continue;
        roundOk = true;
        hitLog.push(`locator:${JSON.stringify(locator).slice(0, 72)}`);
        await sleep(DISMISS_HIT_SLEEP_MS);
        break;
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
    await sleep(DISMISS_ROUND_SLEEP_MS);
  }

  const endedAt = Date.now();
  const dismissed = dismissActions > 0;
  const timedOut = endedAt >= deadline;
  return {
    success: true,
    dismissed,
    businessCode: dismissed ? "POPUP_DISMISSED" : timedOut ? "POPUP_DISMISS_TIMEOUT" : "POPUP_NOT_FOUND",
    reason: dismissed ? "dismissed" : timedOut ? "timed_out" : "no_popup",
    dismissActions,
    rounds,
    timedOut,
    elapsedMs: endedAt - started,
    timeoutMs,
    hits: hitLog
  };
}

export async function dismissMobilePopups(platform, sessionId, base, screen, dismissArg, attemptsArg) {
  const { timeoutMs, attempts } = normalizeDismissOpts(dismissArg, attemptsArg);
  const payload = dismissPayload(base);
  const started = Date.now();
  const deadline = started + timeoutMs;
  let dismissActions = 0;
  let rounds = 0;
  let idleStreak = 0;
  const hitLog = [];

  while (Date.now() < deadline && rounds < attempts) {
    rounds += 1;
    let roundOk = false;

    for (const text of MOBILE_DISMISS_LABELS) {
      if (Date.now() >= deadline) break;
      const r = await safeAda(platform, sessionId, "click", {
        ...payload,
        locator: { text }
      });
      if (!r.success) continue;
      roundOk = true;
      hitLog.push(`text:${text}`);
      await sleep(DISMISS_HIT_SLEEP_MS);
      break;
    }

    if (!roundOk && Date.now() < deadline) {
      const x = Math.round((screen?.width ?? 1080) * 0.92);
      const y = Math.round((screen?.height ?? 2400) * 0.08);
      const corner = await safeAda(platform, sessionId, "click", { ...payload, point: [x, y] });
      if (corner.success) {
        roundOk = true;
        hitLog.push(`point:${x},${y}`);
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
    await sleep(DISMISS_ROUND_SLEEP_MS);
  }

  const endedAt = Date.now();
  const dismissed = dismissActions > 0;
  const timedOut = endedAt >= deadline;
  return {
    success: true,
    dismissed,
    businessCode: dismissed ? "POPUP_DISMISSED" : timedOut ? "POPUP_DISMISS_TIMEOUT" : "POPUP_NOT_FOUND",
    reason: dismissed ? "dismissed" : timedOut ? "timed_out" : "no_popup",
    dismissActions,
    rounds,
    timedOut,
    elapsedMs: endedAt - started,
    timeoutMs,
    hits: hitLog
  };
}
