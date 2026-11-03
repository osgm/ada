import type { AdaPlatform } from "./mcp-normalize.js";

export type ReleasedSessionRecord = {
  platform: AdaPlatform | string;
  sessionId: string;
  reason: string;
  releasedAt: number;
  suggestedSessionId: string;
};

const released = new Map<string, ReleasedSessionRecord>();

function keyOf(platform: string, sessionId: string): string {
  return `${platform}:${sessionId}`;
}

function isPlaceholderSessionId(sessionId: string): boolean {
  return (
    sessionId === "mcp-session" ||
    sessionId === "mcp-batch" ||
    sessionId === "mcp-invoke" ||
    sessionId === "mcp-extract" ||
    sessionId === "mcp-mobile-extract"
  );
}

/** 生成建议的新 sessionId，避免 Agent 继续复用已释放 id */
export function suggestNextSessionId(sessionId: string): string {
  const base = String(sessionId || "mcp-session").replace(/-r\d{6,}.*$/, "") || "mcp-session";
  return `${base}-r${Date.now()}`;
}

export function markSessionReleased(
  platform: string,
  sessionId: string,
  reason = "session released after timeout/precondition failure"
): ReleasedSessionRecord | undefined {
  const id = String(sessionId ?? "").trim();
  if (!id || isPlaceholderSessionId(id)) {
    return undefined;
  }
  const record: ReleasedSessionRecord = {
    platform,
    sessionId: id,
    reason,
    releasedAt: Date.now(),
    suggestedSessionId: suggestNextSessionId(id)
  };
  released.set(keyOf(platform, id), record);
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
  return released.get(keyOf(platform, sessionId));
}

export function assertSessionNotReleased(
  platform: string,
  sessionId: string,
  command: string,
  options?: { allowForceReuse?: boolean; forceReuse?: boolean }
): void {
  if (isPlaceholderSessionId(sessionId)) {
    return;
  }
  if (options?.allowForceReuse && options.forceReuse) {
    clearReleasedSession(platform, sessionId);
    return;
  }
  const hit = getReleasedSession(platform, sessionId);
  if (!hit) {
    return;
  }
  throw createSessionReleasedError({
    sessionId,
    reason: hit.reason,
    suggestedSessionId: hit.suggestedSessionId,
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
