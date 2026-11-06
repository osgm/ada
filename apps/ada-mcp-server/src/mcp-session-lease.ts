/** 软占用可观测：只记录谁在用、多久，不自动回收。 */

export type SessionLease = {
  platform: string;
  sessionId: string;
  firstSeenAt: number;
  lastActiveAt: number;
  ageMs: number;
  idleMs: number;
  source?: string;
  tool?: string;
  command?: string;
  deviceId?: string;
};

type LeaseRecord = {
  platform: string;
  sessionId: string;
  firstSeenAt: number;
  lastActiveAt: number;
  source?: string;
  tool?: string;
  command?: string;
  deviceId?: string;
};

const leases = new Map<string, LeaseRecord>();
const DEFAULT_LEASE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_LEASE_MAX = 200;

function pruneLeases(now = Date.now()): void {
  for (const [key, item] of leases) {
    if (now - item.lastActiveAt > DEFAULT_LEASE_TTL_MS) leases.delete(key);
  }
  if (leases.size <= DEFAULT_LEASE_MAX) return;
  const ordered = [...leases.entries()].sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt);
  const overflow = leases.size - DEFAULT_LEASE_MAX;
  for (let i = 0; i < overflow; i += 1) {
    const key = ordered[i]?.[0];
    if (key) leases.delete(key);
  }
}

function keyOf(platform: string, sessionId: string): string {
  return `${platform}::${sessionId}`;
}

export function touchSessionLease(input: {
  platform: string;
  sessionId: string;
  source?: string;
  tool?: string;
  command?: string;
  deviceId?: string;
}): void {
  const sessionId = String(input.sessionId ?? "").trim();
  const platform = String(input.platform ?? "").trim() || "web";
  if (!sessionId) return;
  const now = Date.now();
  const key = keyOf(platform, sessionId);
  const prev = leases.get(key);
  leases.set(key, {
    platform,
    sessionId,
    firstSeenAt: prev?.firstSeenAt ?? now,
    lastActiveAt: now,
    source: input.source ?? prev?.source,
    tool: input.tool ?? prev?.tool,
    command: input.command ?? prev?.command,
    deviceId: input.deviceId ?? prev?.deviceId
  });
  pruneLeases(now);
}

export function clearSessionLease(platform: string, sessionId: string): void {
  leases.delete(keyOf(platform, sessionId));
}

export function clearAllSessionLeases(): void {
  leases.clear();
}

export function listSessionLeases(now = Date.now()): SessionLease[] {
  return [...leases.values()]
    .map((item) => ({
      platform: item.platform,
      sessionId: item.sessionId,
      firstSeenAt: item.firstSeenAt,
      lastActiveAt: item.lastActiveAt,
      ageMs: Math.max(0, now - item.firstSeenAt),
      idleMs: Math.max(0, now - item.lastActiveAt),
      ...(item.source ? { source: item.source } : {}),
      ...(item.tool ? { tool: item.tool } : {}),
      ...(item.command ? { command: item.command } : {}),
      ...(item.deviceId ? { deviceId: item.deviceId } : {})
    }))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}
