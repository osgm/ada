const viewTreeCache = new Map<string, { at: number; rawValue: unknown }>();
const DEFAULT_VIEW_TREE_MAX = 24;

function viewTreeCacheTtlMs(): number {
  const raw = process.env.ADA_WEB_VIEW_TREE_CACHE_MS?.trim() ?? process.env.ADA_WEB_PAGE_PROBE_TTL_MS?.trim();
  const n = raw ? Number(raw) : 4000;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 4000;
}

function viewTreeMax(): number {
  const raw = process.env.ADA_WEB_VIEW_TREE_CACHE_MAX?.trim();
  const n = raw ? Number(raw) : DEFAULT_VIEW_TREE_MAX;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_VIEW_TREE_MAX;
}

function pruneViewTreeCache(now = Date.now()): void {
  const ttl = viewTreeCacheTtlMs();
  if (ttl > 0) {
    for (const [key, entry] of viewTreeCache) {
      if (now - entry.at > ttl) viewTreeCache.delete(key);
    }
  }
  const max = viewTreeMax();
  if (max <= 0 || viewTreeCache.size <= max) return;
  const ordered = [...viewTreeCache.entries()].sort((a, b) => a[1].at - b[1].at);
  const overflow = viewTreeCache.size - max;
  for (let i = 0; i < overflow; i += 1) {
    const key = ordered[i]?.[0];
    if (key) viewTreeCache.delete(key);
  }
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
  pruneViewTreeCache();
}
