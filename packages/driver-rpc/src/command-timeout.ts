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

/** 批处理/ inbound 默认整批墙钟：按步数放大，上限 3 分钟，避免无顶层超时无限挂起。 */
export const DEFAULT_BATCH_MAX_BUDGET_MS = 180_000;
export const DEFAULT_BATCH_MIN_BUDGET_MS = 45_000;
export const DEFAULT_BATCH_PER_STEP_MS = 30_000;

/**
 * 整批墙钟预算（正确性优先）：有显式 timeoutMs 用显式；否则按步数缩放并封顶。
 * overhead 预留给返回序列化等尾部开销。
 */
export function resolveBatchBudgetMs(input: {
  timeoutMs?: number;
  actionCount: number;
  perStepMs?: number;
  minBudgetMs?: number;
  maxBudgetMs?: number;
  overheadMs?: number;
}): number {
  const overhead = Math.max(0, input.overheadMs ?? 500);
  const minBudget = input.minBudgetMs ?? DEFAULT_BATCH_MIN_BUDGET_MS;
  const maxBudget = input.maxBudgetMs ?? DEFAULT_BATCH_MAX_BUDGET_MS;
  const perStep = input.perStepMs ?? DEFAULT_BATCH_PER_STEP_MS;
  const count = Math.max(1, Math.floor(input.actionCount) || 1);
  if (typeof input.timeoutMs === "number" && input.timeoutMs > 0) {
    // 显式预算必须尊重调用方（含短 E2E / 单测），不再抬到 5s。
    return Math.max(1_000, Math.floor(input.timeoutMs) - overhead);
  }
  const env = process.env.ADA_BATCH_TIMEOUT_MS?.trim();
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) {
      return Math.max(1_000, Math.floor(n) - overhead);
    }
  }
  const scaled = Math.min(maxBudget, Math.max(minBudget, count * perStep));
  return Math.max(minBudget, scaled - overhead);
}

/** 剩余墙钟下本步应使用的 commandTimeoutMs（显式超时取更紧者）。 */
export function resolveBatchStepTimeoutMs(input: {
  remainingMs: number;
  totalSteps: number;
  explicitTimeoutMs?: number;
  maxStepMs?: number;
  minStepMs?: number;
}): number {
  const remaining = Math.max(0, Math.floor(input.remainingMs));
  const maxStep = input.maxStepMs ?? 30_000;
  const minStep = input.minStepMs ?? 3_000;
  if (typeof input.explicitTimeoutMs === "number" && input.explicitTimeoutMs > 0) {
    return Math.max(1, Math.min(Math.floor(input.explicitTimeoutMs), remaining));
  }
  if (input.totalSteps <= 1) {
    return Math.max(1, remaining);
  }
  return Math.max(1, Math.min(maxStep, Math.max(minStep, remaining)));
}
