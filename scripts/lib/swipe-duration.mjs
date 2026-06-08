/** 与 @ada/driver-rpc swipe-duration 保持同步 — run: npm run sync:scripts-lib */

/** 滑动时长预设（毫秒）：数值越大滑动越慢 */
/** hypium Driver.swipe 第 5 参数为手势时长（毫秒），默认约 600 */
export const SWIPE_DURATION_MS = {
    fast: 250,
    normal: 400,
    slow: 800
};
const PRESET_ALIASES = {
    fast: "fast",
    quick: "fast",
    快: "fast",
    normal: "normal",
    default: "normal",
    中: "normal",
    slow: "slow",
    慢: "slow"
};
function positiveMs(v) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0)
        return undefined;
    return Math.round(v);
}
function presetFromPayload(payload) {
    const raw = payload.swipePreset ?? payload.swipeSpeed;
    if (typeof raw !== "string" || !raw.trim())
        return undefined;
    return PRESET_ALIASES[raw.trim().toLowerCase()];
}
/**
 * 解析 swipe 手势时长（毫秒）。
 * 优先级：swipePreset / swipeSpeed → durationMs → speed（鸿蒙历史字段）→ envDefaultMs → fallbackMs
 */
export function resolveSwipeDurationMs(payload, options = {}) {
    const p = payload ?? {};
    const preset = presetFromPayload(p);
    if (preset)
        return SWIPE_DURATION_MS[preset];
    const fromDuration = positiveMs(p.durationMs);
    if (fromDuration !== undefined)
        return fromDuration;
    const fromSpeed = positiveMs(p.speed);
    if (fromSpeed !== undefined)
        return fromSpeed;
    const env = positiveMs(options.envDefaultMs ?? Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS));
    if (env !== undefined)
        return env;
    return options.fallbackMs ?? SWIPE_DURATION_MS.normal;
}
/** 写入 payload：durationMs + speed（鸿蒙驱动读 speed） */
export function withSwipeDuration(payload, durationMs) {
    const ms = Math.max(50, Math.round(durationMs));
    return { ...payload, durationMs: ms, speed: ms };
}
