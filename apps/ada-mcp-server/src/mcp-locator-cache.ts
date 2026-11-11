import type { CommandEnvelope, CommandResult } from "@ada/contracts";

const DEFAULT_TTL_MS = 12_000;
const WARM_LOCATOR_TIMEOUT_MS = 2_500;
const DEFAULT_MAX_ENTRIES = 400;

type CacheEntry = { at: number; locator: Record<string, unknown> };

const cache = new Map<string, CacheEntry>();

const WARMABLE = new Set([
  "click",
  "type",
  "hover",
  "select",
  "getText",
  "assertVisible",
  "assertText"
]);

function ttlMs(): number {
  const raw = process.env.ADA_LOCATOR_HINT_TTL_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_TTL_MS;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_TTL_MS;
}

function maxEntries(): number {
  const raw = process.env.ADA_LOCATOR_HINT_MAX?.trim();
  const n = raw ? Number(raw) : DEFAULT_MAX_ENTRIES;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MAX_ENTRIES;
}

function pruneLocatorCache(now = Date.now()): void {
  const ttl = ttlMs();
  if (ttl > 0) {
    for (const [key, entry] of cache) {
      if (now - entry.at > ttl) cache.delete(key);
    }
  }
  const max = maxEntries();
  if (max <= 0 || cache.size <= max) return;
  const ordered = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  const overflow = cache.size - max;
  for (let i = 0; i < overflow; i += 1) {
    const key = ordered[i]?.[0];
    if (key) cache.delete(key);
  }
}

function warmCapMs(): number {
  const raw = process.env.ADA_LOCATOR_WARM_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : WARM_LOCATOR_TIMEOUT_MS;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : WARM_LOCATOR_TIMEOUT_MS;
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function locatorFromPayload(payload?: Record<string, unknown>): Record<string, unknown> | undefined {
  const p = payload ?? {};
  if (typeof p.locator === "object" && p.locator !== null) {
    return p.locator as Record<string, unknown>;
  }
  if (typeof p.selector === "object" && p.selector !== null) {
    return p.selector as Record<string, unknown>;
  }
  if (typeof p.selector === "string" && p.selector.trim()) {
    return { css: p.selector.trim() };
  }
  return undefined;
}

function fingerprint(locator: Record<string, unknown> | undefined): string | undefined {
  if (!locator) return undefined;
  return stableStringify(locator);
}

function cacheKey(platform: string, sessionId: string, fp: string): string {
  return `${platform}:${sessionId}:${fp}`;
}

/** 近期成功过的 locator 缩短 locatorTimeoutMs，加速命中/快速失败。 */
export function applyLocatorWarmHint(command: CommandEnvelope): CommandEnvelope {
  if (!WARMABLE.has(command.command)) {
    return command;
  }
  const ttl = ttlMs();
  if (ttl <= 0) {
    return command;
  }
  const locator = locatorFromPayload(command.payload);
  const fp = fingerprint(locator);
  if (!fp) {
    return command;
  }
  const hit = cache.get(cacheKey(command.platform, command.sessionId, fp));
  if (!hit || Date.now() - hit.at > ttl) {
    return command;
  }
  const payload = { ...(command.payload ?? {}) };
  const cap = warmCapMs();
  const existing =
    typeof payload.locatorTimeoutMs === "number" && payload.locatorTimeoutMs > 0
      ? Math.floor(payload.locatorTimeoutMs)
      : undefined;
  payload.locatorTimeoutMs = existing ? Math.min(existing, cap) : cap;
  payload.locatorWarm = true;
  return { ...command, payload };
}

export function rememberLocatorSuccess(command: CommandEnvelope, result: CommandResult): void {
  if (!result.success || !WARMABLE.has(command.command)) {
    return;
  }
  const ttl = ttlMs();
  if (ttl <= 0) {
    return;
  }
  const locator = locatorFromPayload(command.payload);
  const fp = fingerprint(locator);
  if (!fp || !locator) {
    return;
  }
  cache.set(cacheKey(command.platform, command.sessionId, fp), {
    at: Date.now(),
    locator: { ...locator }
  });
  pruneLocatorCache();
}

export function clearLocatorHintCache(sessionId?: string): void {
  if (!sessionId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(`:${sessionId}:`)) {
      cache.delete(key);
    }
  }
}
