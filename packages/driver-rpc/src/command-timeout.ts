/** 内核命令墙钟超时：payload.commandTimeoutMs / ADA_COMMAND_TIMEOUT_MS / 默认值（与 payload.timeoutMs 语义等待分离） */

/** 未配置 env 时的默认墙钟超时，避免插件调用无限挂起 */
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

export class CommandTimeoutError extends Error {
  override readonly name = "CommandTimeoutError";

  constructor(message: string) {
    super(message);
  }
}

export function resolveCommandTimeoutMs(payload?: Record<string, unknown>): number {
  const p = payload ?? {};
  const options =
    typeof p.options === "object" && p.options !== null ? (p.options as Record<string, unknown>) : {};
  const fromPayload =
    typeof p.commandTimeoutMs === "number"
      ? p.commandTimeoutMs
      : typeof options.commandTimeoutMs === "number"
        ? options.commandTimeoutMs
        : undefined;
  if (typeof fromPayload === "number" && fromPayload > 0) {
    return fromPayload;
  }
  const env = process.env.ADA_COMMAND_TIMEOUT_MS;
  if (env?.trim()) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return DEFAULT_COMMAND_TIMEOUT_MS;
}

/** 控件查找超时（与 commandTimeoutMs 分离；兼容 payload.timeoutMs 作 locator 等待） */
export function resolveLocatorTimeoutMs(
  payload?: Record<string, unknown>,
  options?: { defaultMs?: number; maxMs?: number }
): number {
  const p = payload ?? {};
  const defaultMs = options?.defaultMs ?? 4_000;
  const maxMs = options?.maxMs ?? 8_000;
  const explicit =
    typeof p.locatorTimeoutMs === "number"
      ? p.locatorTimeoutMs
      : typeof p.timeoutMs === "number" && p.timeoutMs > 0
        ? p.timeoutMs
        : defaultMs;
  return Math.min(Math.max(500, explicit), maxMs);
}

export function resolveSubOperationTimeoutMs(commandTimeoutMs: number, fallbackMs: number, ratio = 0.5): number {
  const scaled = Math.floor(commandTimeoutMs * ratio);
  return Math.min(commandTimeoutMs - 500, Math.max(fallbackMs, scaled));
}

export function raceCommandTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label = "command"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CommandTimeoutError(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
