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
