import type { CommandEnvelope } from "@ada/contracts";

/** 与 Playwright resolveAutoWaitMs 默认对齐；仅作 MCP 侧抬升基准。 */
export const DEFAULT_INTERACTION_WAIT_MS = 25_000;
export const MAX_INTERACTION_WAIT_MS = 60_000;
export const DEFAULT_RETRY_DELAY_MS = 1_500;

const WINDOW_SIZE = 12;
const OUTCOME_TTL_MS = 10 * 60_000;

type Outcome = { ok: boolean; at: number };

const outcomesBySession = new Map<string, Outcome[]>();

function adaptiveEnabled(): boolean {
  const raw = (process.env.ADA_ADAPTIVE_WAIT ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function sessionKey(platform: string, sessionId: string): string {
  return `${platform}:${sessionId}`;
}

function pruneOutcomes(list: Outcome[], now = Date.now()): Outcome[] {
  return list.filter((item) => now - item.at <= OUTCOME_TTL_MS).slice(-WINDOW_SIZE);
}

/** 最近失败越多，基线等待抬得越高（找到控件仍会立刻返回）。 */
export function getAdaptiveWaitBoostMs(platform: string, sessionId: string): number {
  if (!adaptiveEnabled()) return 0;
  const key = sessionKey(platform, sessionId);
  const list = pruneOutcomes(outcomesBySession.get(key) ?? []);
  outcomesBySession.set(key, list);
  if (list.length < 2) return 0;
  const fails = list.filter((item) => !item.ok).length;
  const ratio = fails / list.length;
  if (ratio >= 0.7) return 25_000;
  if (ratio >= 0.5) return 15_000;
  if (ratio >= 0.25) return 8_000;
  return 0;
}

/** 同一次工具调用内第 N 次尝试再加长（attempt 从 1 起）。 */
export function getAttemptWaitBoostMs(attempt: number): number {
  if (attempt <= 1) return 0;
  if (attempt === 2) return 8_000;
  return 15_000;
}

export function recordAdaptiveWaitOutcome(platform: string, sessionId: string, success: boolean): void {
  if (!adaptiveEnabled()) return;
  const id = sessionId.trim();
  if (!id) return;
  const key = sessionKey(platform, id);
  const list = pruneOutcomes(outcomesBySession.get(key) ?? []);
  list.push({ ok: success, at: Date.now() });
  outcomesBySession.set(key, pruneOutcomes(list));
}

export function clearAdaptiveWait(sessionId?: string): void {
  if (!sessionId) {
    outcomesBySession.clear();
    return;
  }
  const suffix = `:${sessionId}`;
  for (const key of [...outcomesBySession.keys()]) {
    if (key.endsWith(suffix)) outcomesBySession.delete(key);
  }
}

export function resolveRetryDelayMs(baseDelayMs: number, attempt: number, boostMs = 0): number {
  const base = Math.max(0, Math.floor(baseDelayMs));
  if (base <= 0) return 0;
  const attemptFactor = Math.max(1, Math.floor(attempt));
  const boosted = base * attemptFactor + Math.min(5_000, Math.max(0, Math.floor(boostMs / 3)));
  return Math.min(15_000, boosted);
}

function readExplicitWaitMs(payload: Record<string, unknown>): number | undefined {
  for (const key of ["waitTimeoutMs", "locatorTimeoutMs", "timeoutMs"] as const) {
    const value = payload[key];
    if (typeof value === "number" && value > 0) {
      return Math.floor(value);
    }
  }
  return undefined;
}

/**
 * 按近期失败率与本轮 attempt 抬升 waitTimeoutMs / locatorTimeoutMs。
 * 显式更大超时保留；warm 缩短在有压力时会被抬回去。
 */
export function applyAdaptiveWaitHint(
  command: CommandEnvelope,
  options?: { attempt?: number }
): CommandEnvelope {
  if (!adaptiveEnabled()) return command;
  const attempt = Math.max(1, Math.floor(options?.attempt ?? 1));
  const recentBoost = getAdaptiveWaitBoostMs(command.platform, command.sessionId);
  const attemptBoost = getAttemptWaitBoostMs(attempt);
  const boost = recentBoost + attemptBoost;
  if (boost <= 0) return command;

  const payload = { ...(command.payload ?? {}) };
  const explicit = readExplicitWaitMs(payload);
  const target = Math.min(
    MAX_INTERACTION_WAIT_MS,
    Math.max(explicit ?? DEFAULT_INTERACTION_WAIT_MS, DEFAULT_INTERACTION_WAIT_MS + boost)
  );

  const currentWait =
    typeof payload.waitTimeoutMs === "number" && payload.waitTimeoutMs > 0
      ? Math.floor(payload.waitTimeoutMs)
      : 0;
  payload.waitTimeoutMs = Math.max(currentWait, target);

  const currentLocator =
    typeof payload.locatorTimeoutMs === "number" && payload.locatorTimeoutMs > 0
      ? Math.floor(payload.locatorTimeoutMs)
      : 0;
  // warm 可能把 locatorTimeoutMs 压到 1~2s；有失败压力时抬回
  payload.locatorTimeoutMs = Math.max(currentLocator, Math.min(MAX_INTERACTION_WAIT_MS, target));
  payload.adaptiveWaitBoostMs = boost;
  if (payload.locatorWarm === true && boost > 0) {
    payload.locatorWarm = false;
  }
  return { ...command, payload };
}
