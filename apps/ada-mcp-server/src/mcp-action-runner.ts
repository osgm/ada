import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { runCommand } from "./executor.js";
import type { AdaPlatform } from "./mcp-normalize.js";

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

export async function executeWithTimeout(command: CommandEnvelope, timeoutMs?: number): Promise<CommandResult> {
  const effectiveTimeout = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 0;
  if (effectiveTimeout <= 0) {
    return runCommand(command);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      runCommand(command),
      new Promise<CommandResult>((resolve) => {
        timer = setTimeout(() => {
          resolve({
            requestId: command.requestId,
            success: false,
            errorCode: "MCP_ACTION_TIMEOUT",
            errorMessage: `action timeout after ${effectiveTimeout}ms`
          });
        }, effectiveTimeout);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
    last = await executeWithTimeout(attemptCommand, options.timeoutMs);
    if (last.success) {
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
