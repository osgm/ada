import type { CommandResult } from "@ada/contracts";
import { readUiDumpCacheTtlMs, shouldInvalidateDumpOnAction } from "@ada/driver-rpc";
import type { AdaPlatform } from "./mcp-normalize.js";

interface DumpCacheEntry {
  at: number;
  result: CommandResult;
}

const caches = new Map<string, DumpCacheEntry>();

function cacheKey(platform: AdaPlatform, sessionId: string): string {
  return `${platform}:${sessionId}`;
}

function ttlMs(): number {
  return readUiDumpCacheTtlMs();
}

export async function getCachedMobilePageSource(
  platform: AdaPlatform,
  sessionId: string,
  loader: () => Promise<CommandResult>
): Promise<{ result: CommandResult; cacheHit: boolean }> {
  const key = cacheKey(platform, sessionId);
  const ttl = ttlMs();
  const hit = caches.get(key);
  if (hit && ttl > 0 && Date.now() - hit.at < ttl) {
    return { result: hit.result, cacheHit: true };
  }
  const result = await loader();
  if (result.success && ttl > 0) {
    caches.set(key, { at: Date.now(), result });
  }
  return { result, cacheHit: false };
}

export function invalidateMobilePageSourceCache(platform?: AdaPlatform, sessionId?: string): void {
  if (!platform && !sessionId) {
    caches.clear();
    return;
  }
  if (platform && sessionId) {
    caches.delete(cacheKey(platform, sessionId));
    return;
  }
  for (const key of caches.keys()) {
    if (platform && key.startsWith(`${platform}:`)) {
      caches.delete(key);
    } else if (sessionId && key.endsWith(`:${sessionId}`)) {
      caches.delete(key);
    }
  }
}

const UI_MUTATING_MOBILE_COMMANDS = new Set([
  "click",
  "swipe",
  "type",
  "press",
  "pressHome",
  "home",
  "back",
  "launchApp",
  "exitApp",
  "recipe"
]);

export function invalidateMobileDumpAfterCommand(
  platform: AdaPlatform,
  sessionId: string,
  command: string
): void {
  if (!shouldInvalidateDumpOnAction()) return;
  if (!UI_MUTATING_MOBILE_COMMANDS.has(command)) return;
  invalidateMobilePageSourceCache(platform, sessionId);
}
