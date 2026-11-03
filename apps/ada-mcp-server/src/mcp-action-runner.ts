import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { runCommand } from "./executor.js";
import { applyLocatorWarmHint, rememberLocatorSuccess } from "./mcp-locator-cache.js";
import type { AdaPlatform } from "./mcp-normalize.js";
import {
  assertSessionNotReleased,
  clearReleasedSession,
  markSessionReleased,
  suggestNextSessionId
} from "./mcp-released-sessions.js";

export { ensureWebRuntimeReady } from "./mcp-runtime-preflight.js";

export interface ActionRunOptions {
  retry?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 不可恢复/已等满的错误不再重试，避免空转拖慢批处理。 */
export function isTransientCommandFailure(result: CommandResult): boolean {
  const code = String(result.errorCode ?? "").toUpperCase();
  const message = String(result.errorMessage ?? "").toLowerCase();
  if (!code && !message) return true;
  if (
    code.includes("TIMEOUT") ||
    code.includes("TIMED_OUT") ||
    code === "MCP_ACTION_TIMEOUT" ||
    code === "COMMAND_TIMEOUT" ||
    code === "INBOUND_BUDGET_EXHAUSTED"
  ) {
    return false;
  }
  if (
    code.includes("RISK") ||
    code.includes("DENIED") ||
    code.includes("VALIDATION") ||
    code.includes("NOT_ALLOWED") ||
    code.includes("UNSUPPORTED") ||
    code.includes("NOT_READY")
  ) {
    return false;
  }
  if (/risk.?denied|not allowed|unsupported command|validation/.test(message)) {
    return false;
  }
  return true;
}

/**
 * 将 MCP 层 timeoutMs 写入 payload.commandTimeoutMs，交给内核墙钟超时。
 * 内核超时会 teardown 驱动会话，避免 Promise.race 留下孤儿命令与会话泄漏。
 */
export function applyCommandTimeout(
  command: CommandEnvelope,
  timeoutMs?: number
): CommandEnvelope {
  const effectiveTimeout = typeof timeoutMs === "number" && timeoutMs > 0 ? Math.floor(timeoutMs) : 0;
  if (effectiveTimeout <= 0) {
    return command;
  }
  const payload = { ...(command.payload ?? {}) };
  const existing =
    typeof payload.commandTimeoutMs === "number" && payload.commandTimeoutMs > 0
      ? Math.floor(payload.commandTimeoutMs)
      : undefined;
  payload.commandTimeoutMs = existing ? Math.min(existing, effectiveTimeout) : effectiveTimeout;
  return { ...command, payload };
}

function annotateReleasedResult(command: CommandEnvelope, result: CommandResult): CommandResult {
  const data = result.data && typeof result.data === "object" ? { ...result.data } : {};
  if (data.sessionReleased !== true && data.requireNewSessionId !== true) {
    return result;
  }
  const record = markSessionReleased(
    command.platform,
    command.sessionId,
    String(result.errorMessage ?? result.errorCode ?? "timeout/precondition release")
  );
  const suggestedSessionId =
    (typeof data.suggestedSessionId === "string" && data.suggestedSessionId) ||
    record?.suggestedSessionId ||
    suggestNextSessionId(command.sessionId);
  return {
    ...result,
    data: {
      ...data,
      sessionReleased: true,
      requireNewSessionId: true,
      previousSessionId: command.sessionId,
      suggestedSessionId,
      recoveryHint:
        typeof data.recoveryHint === "string" && data.recoveryHint
          ? data.recoveryHint
          : `Session released. Use new sessionId="${suggestedSessionId}" then navigate/launchApp; do not reuse "${command.sessionId}".`
    }
  };
}

export async function executeWithTimeout(command: CommandEnvelope, timeoutMs?: number): Promise<CommandResult> {
  const forceReuse = command.payload?.forceReuseReleasedSession === true;
  assertSessionNotReleased(command.platform, command.sessionId, command.command, {
    allowForceReuse: true,
    forceReuse
  });
  const result = await runCommand(applyCommandTimeout(command, timeoutMs));
  if (
    result.success &&
    (command.command === "navigate" || command.command === "launchApp" || command.command === "newTab")
  ) {
    clearReleasedSession(command.platform, command.sessionId);
  }
  return annotateReleasedResult(command, result);
}

export async function runCommandWithRetry(
  command: CommandEnvelope,
  options: ActionRunOptions
): Promise<{ result: CommandResult; attempts: number }> {
  const maxAttempts = Math.max(1, 1 + Math.floor(options.retry ?? 0));
  const delayMs = Math.max(0, Math.floor(options.retryDelayMs ?? 500));
  let last: CommandResult = {
    requestId: command.requestId,
    success: false,
    errorCode: "MCP_RETRY_NOT_RUN",
    errorMessage: "command not executed"
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptCommand =
      attempt === 1
        ? command
        : {
            ...command,
            requestId: `${command.requestId}-r${attempt}`
          };
    const warmed = applyLocatorWarmHint(attemptCommand);
    last = await executeWithTimeout(warmed, options.timeoutMs);
    if (last.success) {
      rememberLocatorSuccess(warmed, last);
      return { result: last, attempts: attempt };
    }
    // 已释放会话：禁止同 sessionId 重试，避免幽灵连接错误
    if (last.data && (last.data as { sessionReleased?: boolean }).sessionReleased === true) {
      return { result: last, attempts: attempt };
    }
    if (String(last.errorCode ?? "").toUpperCase() === "SESSION_RELEASED") {
      return { result: last, attempts: attempt };
    }
    if (attempt < maxAttempts && !isTransientCommandFailure(last)) {
      return { result: last, attempts: attempt };
    }
    if (attempt < maxAttempts && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return { result: last, attempts: maxAttempts };
}

export function parseActionRunOptions(args: Record<string, unknown>): ActionRunOptions {
  return {
    retry: typeof args.retry === "number" ? Math.max(0, Math.floor(args.retry)) : 0,
    retryDelayMs: typeof args.retryDelayMs === "number" ? Math.max(0, Math.floor(args.retryDelayMs)) : 500,
    timeoutMs: typeof args.timeoutMs === "number" ? Math.max(0, Math.floor(args.timeoutMs)) : 0
  };
}

export function shouldPreflightSession(command: string, platform: AdaPlatform): boolean {
  if (platform === "web" && command === "navigate") return false;
  if (platform !== "web" && (command === "launchApp" || command === "custom" || command === "recipe")) {
    return false;
  }
  if (command === "invoke" || command === "recipe") return true;
  return ["click", "type", "screenshot", "assertVisible", "assertText", "getText", "swipe", "hover"].includes(command);
}
