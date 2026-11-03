import { suggestNextSessionId as suggestNextSessionIdShared } from "@ada/driver-rpc";
import type { AdaPlatform } from "./mcp-normalize.js";

export type ReleasedSessionRecord = {
  platform: AdaPlatform | string;
  sessionId: string;
  reason: string;
  releasedAt: number;
  suggestedSessionId: string;
  placeholder?: boolean;
};

const released = new Map<string, ReleasedSessionRecord>();

/** 默认 1 小时；`0`=不按时间过期 */
export const DEFAULT_RELEASED_SESSION_TTL_MS = 3_600_000;
/** 登记表上限，超出淘汰最旧 */
export const DEFAULT_RELEASED_SESSION_MAX = 200;

function keyOf(platform: string, sessionId: string): string {
  return `${platform}:${sessionId}`;
}

export function isPlaceholderSessionId(sessionId: string): boolean {
  return (
    sessionId === "mcp-session" ||
    sessionId === "mcp-batch" ||
    sessionId === "mcp-invoke" ||
    sessionId === "mcp-extract" ||
    sessionId === "mcp-mobile-extract"
  );
}

export function resolveReleasedSessionTtlMs(): number {
  const raw = process.env.ADA_RELEASED_SESSION_TTL_MS?.trim();
  if (!raw) return DEFAULT_RELEASED_SESSION_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_RELEASED_SESSION_TTL_MS;
}

export function resolveReleasedSessionMax(): number {
  const raw = process.env.ADA_RELEASED_SESSION_MAX?.trim();
  if (!raw) return DEFAULT_RELEASED_SESSION_MAX;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_RELEASED_SESSION_MAX;
}

/** 占位 sessionId：默认 warn（登记+提示，不硬拦）；`block` 硬拦；`off` 忽略 */
export function resolvePlaceholderReleasedMode(): "warn" | "block" | "off" {
  const raw = process.env.ADA_RELEASED_PLACEHOLDER_MODE?.trim().toLowerCase();
  if (raw === "block" || raw === "enforce" || raw === "1" || raw === "true") return "block";
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  return "warn";
}

function pruneReleasedSessions(now = Date.now()): void {
  const ttl = resolveReleasedSessionTtlMs();
  if (ttl > 0) {
    for (const [key, record] of released) {
      if (now - record.releasedAt > ttl) {
        released.delete(key);
      }
    }
  }
  const max = resolveReleasedSessionMax();
  if (max <= 0 || released.size <= max) return;
  const ordered = [...released.entries()].sort((a, b) => a[1].releasedAt - b[1].releasedAt);
  const overflow = released.size - max;
  for (let i = 0; i < overflow; i += 1) {
    const key = ordered[i]?.[0];
    if (key) released.delete(key);
  }
}

/** 生成建议的新 sessionId，避免 Agent 继续复用已释放 id */
export function suggestNextSessionId(sessionId: string): string {
  return suggestNextSessionIdShared(sessionId);
}

export function markSessionReleased(
  platform: string,
  sessionId: string,
  reason = "session released after timeout/precondition failure"
): ReleasedSessionRecord | undefined {
  const id = String(sessionId ?? "").trim();
  if (!id) {
    return undefined;
  }
  const placeholder = isPlaceholderSessionId(id);
  if (placeholder && resolvePlaceholderReleasedMode() === "off") {
    return undefined;
  }
  pruneReleasedSessions();
  const record: ReleasedSessionRecord = {
    platform,
    sessionId: id,
    reason,
    releasedAt: Date.now(),
    suggestedSessionId: suggestNextSessionId(id),
    ...(placeholder ? { placeholder: true } : {})
  };
  released.set(keyOf(platform, id), record);
  pruneReleasedSessions();
  return record;
}

export function clearReleasedSession(platform?: string, sessionId?: string): void {
  if (!platform && !sessionId) {
    released.clear();
    return;
  }
  if (platform && sessionId) {
    released.delete(keyOf(platform, sessionId));
    return;
  }
  for (const key of released.keys()) {
    if (platform && key.startsWith(`${platform}:`)) {
      released.delete(key);
    } else if (sessionId && key.endsWith(`:${sessionId}`)) {
      released.delete(key);
    }
  }
}

export function getReleasedSession(
  platform: string,
  sessionId: string
): ReleasedSessionRecord | undefined {
  pruneReleasedSessions();
  return released.get(keyOf(platform, sessionId));
}

export function countReleasedSessions(): number {
  pruneReleasedSessions();
  return released.size;
}

export type SessionReleasedGuardResult =
  | { action: "allow" }
  | { action: "warn"; record: ReleasedSessionRecord }
  | { action: "block"; record: ReleasedSessionRecord };

/** 检查是否可复用；占位 id 默认 warn，正式 id 硬拦 */
export function checkSessionNotReleased(
  platform: string,
  sessionId: string,
  options?: { allowForceReuse?: boolean; forceReuse?: boolean }
): SessionReleasedGuardResult {
  if (options?.allowForceReuse && options.forceReuse) {
    clearReleasedSession(platform, sessionId);
    return { action: "allow" };
  }
  const hit = getReleasedSession(platform, sessionId);
  if (!hit) {
    return { action: "allow" };
  }
  if (hit.placeholder || isPlaceholderSessionId(sessionId)) {
    const mode = resolvePlaceholderReleasedMode();
    if (mode === "off") return { action: "allow" };
    if (mode === "warn") return { action: "warn", record: hit };
    return { action: "block", record: hit };
  }
  return { action: "block", record: hit };
}

export function assertSessionNotReleased(
  platform: string,
  sessionId: string,
  command: string,
  options?: { allowForceReuse?: boolean; forceReuse?: boolean }
): ReleasedSessionRecord | undefined {
  const checked = checkSessionNotReleased(platform, sessionId, options);
  if (checked.action === "allow") {
    return undefined;
  }
  if (checked.action === "warn") {
    return checked.record;
  }
  throw createSessionReleasedError({
    sessionId,
    reason: checked.record.reason,
    suggestedSessionId: checked.record.suggestedSessionId,
    command
  });
}

export function buildSessionReleasedRecoveryHint(record: ReleasedSessionRecord): string {
  return (
    `Session "${record.sessionId}" was released. ` +
    `Switch to sessionId="${record.suggestedSessionId}" then navigate/launchApp before further actions.`
  );
}

export function isSessionReleasedError(error: unknown): error is Error & {
  code?: string;
  data?: Record<string, unknown>;
} {
  if (!(error instanceof Error)) return false;
  const code = String((error as Error & { code?: string }).code ?? "").toUpperCase();
  if (code === "SESSION_RELEASED") return true;
  return /SESSION_RELEASED|sessionReleased=true|requireNewSessionId/i.test(error.message);
}

/** 将 SESSION_RELEASED 异常转为可被 wrapCommandToolResult 消费的 CommandResult */
export function sessionReleasedErrorToCommandResult(
  error: Error & { data?: Record<string, unknown> },
  requestId: string
): {
  requestId: string;
  success: false;
  errorCode: string;
  errorMessage: string;
  data: Record<string, unknown>;
} {
  const data = error.data && typeof error.data === "object" ? { ...error.data } : {};
  const suggested =
    typeof data.suggestedSessionId === "string"
      ? data.suggestedSessionId
      : typeof data.previousSessionId === "string"
        ? suggestNextSessionId(String(data.previousSessionId))
        : suggestNextSessionId("mcp-session");
  const previousSessionId =
    typeof data.previousSessionId === "string" ? data.previousSessionId : undefined;
  return {
    requestId,
    success: false,
    errorCode: "SESSION_RELEASED",
    errorMessage: error.message,
    data: {
      sessionReleased: true,
      requireNewSessionId: true,
      suggestedSessionId: suggested,
      ...(previousSessionId ? { previousSessionId } : {}),
      ...data,
      recoveryHint:
        typeof data.recoveryHint === "string" && data.recoveryHint
          ? data.recoveryHint
          : `SESSION_RELEASED: use sessionId="${suggested}" then navigate/launchApp; do not reuse the released id.`
    }
  };
}

export function createSessionReleasedError(input: {
  sessionId: string;
  reason: string;
  suggestedSessionId: string;
  command?: string;
}): Error & { code: string; data: Record<string, unknown> } {
  const command = input.command ?? "action";
  const err = new Error(
    `SESSION_RELEASED: sessionId="${input.sessionId}" was released (${input.reason}). ` +
      `Do not reuse it for ${command}. Use a new sessionId="${input.suggestedSessionId}" ` +
      `and start with navigate/launchApp. ` +
      `(Advanced: payload.forceReuseReleasedSession=true to clear this guard.)`
  ) as Error & { code: string; data: Record<string, unknown> };
  err.code = "SESSION_RELEASED";
  err.data = {
    errorCode: "SESSION_RELEASED",
    sessionReleased: true,
    requireNewSessionId: true,
    previousSessionId: input.sessionId,
    suggestedSessionId: input.suggestedSessionId,
    reason: input.reason
  };
  return err;
}
