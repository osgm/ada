/** 滑动时长预设（毫秒）：数值越大滑动越慢 */
/** hypium Driver.swipe 第 5 参数为手势时长（毫秒），默认约 600 */
export const SWIPE_DURATION_MS = {
  fast: 250,
  normal: 400,
  slow: 800
} as const;

export type SwipePreset = keyof typeof SWIPE_DURATION_MS;

const PRESET_ALIASES: Record<string, SwipePreset> = {
  fast: "fast",
  quick: "fast",
  快: "fast",
  normal: "normal",
  default: "normal",
  中: "normal",
  slow: "slow",
  慢: "slow"
};

export interface ResolveSwipeDurationOptions {
  /** 未指定 duration / preset / speed 时的默认毫秒 */
  fallbackMs?: number;
  /** 环境变量解析后的默认（如 ADA_HARMONY_SWIPE_SPEED_MS） */
  envDefaultMs?: number;
}

function positiveMs(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return undefined;
  return Math.round(v);
}

function presetFromPayload(payload: Record<string, unknown>): SwipePreset | undefined {
  const raw = payload.swipePreset ?? payload.swipeSpeed;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return PRESET_ALIASES[raw.trim().toLowerCase()];
}

/**
 * 解析 swipe 手势时长（毫秒）。
 * 优先级：swipePreset / swipeSpeed → durationMs → speed（鸿蒙历史字段）→ envDefaultMs → fallbackMs
 */
export function resolveSwipeDurationMs(
  payload: Record<string, unknown> | undefined,
  options: ResolveSwipeDurationOptions = {}
): number {
  const p = payload ?? {};
  const preset = presetFromPayload(p);
  if (preset) return SWIPE_DURATION_MS[preset];

  const fromDuration = positiveMs(p.durationMs);
  if (fromDuration !== undefined) return fromDuration;

  const fromSpeed = positiveMs(p.speed);
  if (fromSpeed !== undefined) return fromSpeed;

  const env = positiveMs(options.envDefaultMs ?? Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS));
  if (env !== undefined) return env;

  return options.fallbackMs ?? SWIPE_DURATION_MS.normal;
}

/** 写入 payload：durationMs + speed（鸿蒙驱动读 speed） */
export function withSwipeDuration(
  payload: Record<string, unknown>,
  durationMs: number
): Record<string, unknown> {
  const ms = Math.max(50, Math.round(durationMs));
  return { ...payload, durationMs: ms, speed: ms };
}
