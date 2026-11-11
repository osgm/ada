/** 内核命令墙钟超时：payload.commandTimeoutMs / ADA_COMMAND_TIMEOUT_MS / 默认值（与 payload.timeoutMs 语义等待分离） */

/** 未配置 env 时的默认墙钟超时。需盖住加长后的控件等待（可见 + 点击），避免慢页被 COMMAND_TIMEOUT 提前释放 */
export const DEFAULT_COMMAND_TIMEOUT_MS = 90_000;

/**
 * 打开页默认导航超时（毫秒），默认 2 分钟。
 * 可用 `ADA_WEB_NAVIGATION_TIMEOUT_MS` 或 payload.navigationTimeoutMs / timeoutMs 覆盖。
 */
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 120_000;

/** 内核墙钟相对导航超时额外缓冲，避免慢重定向/置前尚未结束就被 COMMAND_TIMEOUT 杀掉 */
export const NAVIGATION_COMMAND_TIMEOUT_BUFFER_MS = 15_000;

export class CommandTimeoutError extends Error {
  override readonly name = "CommandTimeoutError";

  constructor(message: string) {
    super(message);
  }
}

export function isNavigationLikeCommand(command?: string): boolean {
  return command === "navigate" || command === "reload" || command === "newTab";
}

/** page.goto / 打开页等待上限 */
export function resolveNavigationTimeoutMs(payload?: Record<string, unknown>): number {
  const p = payload ?? {};
  const fromPayload =
    typeof p.navigationTimeoutMs === "number"
      ? p.navigationTimeoutMs
      : typeof p.timeoutMs === "number" && p.timeoutMs > 0
        ? p.timeoutMs
        : undefined;
  if (typeof fromPayload === "number" && fromPayload > 0) {
    return Math.max(1_000, Math.floor(fromPayload));
  }
  const env = process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS?.trim();
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) {
      return Math.max(1_000, Math.floor(n));
    }
  }
  return DEFAULT_NAVIGATION_TIMEOUT_MS;
}

export function resolveCommandTimeoutMs(payload?: Record<string, unknown>, command?: string): number {
  const p = payload ?? {};
  const options =
    typeof p.options === "object" && p.options !== null ? (p.options as Record<string, unknown>) : {};
  const fromPayload =
    typeof p.commandTimeoutMs === "number"
      ? p.commandTimeoutMs
      : typeof options.commandTimeoutMs === "number"
        ? options.commandTimeoutMs
        : undefined;
  let resolved: number;
  if (typeof fromPayload === "number" && fromPayload > 0) {
    resolved = Math.floor(fromPayload);
  } else {
    const env = process.env.ADA_COMMAND_TIMEOUT_MS;
    if (env?.trim()) {
      const n = Number(env);
      if (Number.isFinite(n) && n > 0) {
        resolved = Math.floor(n);
      } else {
        resolved = DEFAULT_COMMAND_TIMEOUT_MS;
      }
    } else {
      resolved = DEFAULT_COMMAND_TIMEOUT_MS;
    }
  }
  // 打开页/登录等待：内核墙钟至少覆盖导航超时，超时后由内核 teardown 释放连接
  if (isNavigationLikeCommand(command)) {
    const navMs = resolveNavigationTimeoutMs(payload);
    resolved = Math.max(resolved, navMs + NAVIGATION_COMMAND_TIMEOUT_BUFFER_MS);
  }
  return resolved;
}

/** 控件查找超时（与 commandTimeoutMs 分离；兼容 payload.timeoutMs 作 locator 等待） */
export function resolveLocatorTimeoutMs(
  payload?: Record<string, unknown>,
  options?: { defaultMs?: number; maxMs?: number }
): number {
  const p = payload ?? {};
  const defaultMs = options?.defaultMs ?? 12_000;
  const maxMs = options?.maxMs ?? 30_000;
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
