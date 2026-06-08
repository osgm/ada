const viewTreeCache = new Map<string, { at: number; rawValue: unknown }>();

function viewTreeCacheTtlMs(): number {
  const raw = process.env.ADA_WEB_VIEW_TREE_CACHE_MS?.trim() ?? process.env.ADA_WEB_PAGE_PROBE_TTL_MS?.trim();
  const n = raw ? Number(raw) : 2000;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2000;
}

export function clearWebViewTreeCache(sessionId?: string): void {
  if (sessionId) {
    viewTreeCache.delete(sessionId);
    return;
  }
  viewTreeCache.clear();
}

export function getCachedWebViewTreeRaw(sessionId: string): unknown | undefined {
  const ttlMs = viewTreeCacheTtlMs();
  if (ttlMs <= 0) return undefined;
  const hit = viewTreeCache.get(sessionId);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ttlMs) {
    viewTreeCache.delete(sessionId);
    return undefined;
  }
  return hit.rawValue;
}

export function setCachedWebViewTreeRaw(sessionId: string, rawValue: unknown): void {
  const ttlMs = viewTreeCacheTtlMs();
  if (ttlMs <= 0) return;
  viewTreeCache.set(sessionId, { at: Date.now(), rawValue });
}
