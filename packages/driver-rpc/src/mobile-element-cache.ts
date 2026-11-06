/** Stable cache key for locator-based element lookup. */
export function locatorCacheKey(locator?: {
  id?: string;
  text?: string;
  accessibilityId?: string;
  xpath?: string;
  uiautomator?: string;
}): string | null {
  if (!locator) {
    return null;
  }
  const parts: string[] = [];
  if (locator.id) parts.push(`id:${locator.id}`);
  if (locator.text) parts.push(`text:${locator.text}`);
  if (locator.accessibilityId) parts.push(`a11y:${locator.accessibilityId}`);
  if (locator.xpath) parts.push(`xpath:${locator.xpath}`);
  if (locator.uiautomator) parts.push(`uia:${locator.uiautomator}`);
  return parts.length > 0 ? parts.join("|") : null;
}

export class ElementIdCache {
  private readonly entries = new Map<string, { elementId: string; at: number }>();

  constructor(private readonly ttlMs = 10_000) {}

  get(key: string): string | undefined {
    const hit = this.entries.get(key);
    if (!hit) {
      return undefined;
    }
    if (Date.now() - hit.at > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.elementId;
  }

  set(key: string, elementId: string): void {
    const now = Date.now();
    for (const [entryKey, entry] of this.entries) {
      if (now - entry.at > this.ttlMs) this.entries.delete(entryKey);
    }
    this.entries.set(key, { elementId, at: now });
    const max = 256;
    if (this.entries.size <= max) return;
    const oldest = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) this.entries.delete(oldest);
  }

  clear(): void {
    this.entries.clear();
  }
}
