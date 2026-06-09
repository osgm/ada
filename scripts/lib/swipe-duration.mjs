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
/** @param {number|string|Record<string, unknown>|null|undefined} arg */
export function normalizeSwipeArg(arg) {
    if (arg == null)
        return {};
    if (typeof arg === "number")
        return { durationMs: arg };
    if (typeof arg === "string")
        return { swipePreset: arg };
    if (typeof arg === "object")
        return arg;
    return {};
}

/**
 * 解析滑动参数：时长 + 重复次数（ada-fluent 用，不在 driver-rpc 中）
 * @param {number|string|Record<string, unknown>|null|undefined} durationOrOpts
 * @param {Record<string, unknown>} cfg
 */
export function parseSwipeOptions(durationOrOpts, cfg = {}) {
    const { durationMs: _d, swipePreset: _p, swipeSpeed: _s, speed: _sp, ...sessionCfg } = cfg;
    const merged = { ...sessionCfg, ...normalizeSwipeArg(durationOrOpts) };
    return {
        durationMs: resolveSwipeDurationMs(merged),
        swipePreset: merged.swipePreset,
        fling: merged.fling,
        relative: merged.relative === true,
        times: Math.max(1, Math.floor(Number(merged.times ?? 1) || 1)),
        gapMs: Math.max(0, Math.floor(Number(merged.gapMs ?? 280) || 280))
    };
}

/** 解析 pinch 第三参起：distance、pinchIn、时长等 */
export function parsePinchOptions(distanceOrOpts, cfg = {}) {
    const merged = typeof distanceOrOpts === "number"
        ? { ...cfg, distance: distanceOrOpts }
        : typeof distanceOrOpts === "object" && distanceOrOpts
            ? { ...cfg, ...distanceOrOpts }
            : { ...cfg };
    const swipe = parseSwipeOptions({
        durationMs: merged.durationMs,
        swipePreset: merged.swipePreset,
        times: merged.times,
        gapMs: merged.gapMs
    });
    if (merged.pinchIn === undefined) {
        throw new Error("pinch 需要 pinchIn: true（缩小）或 false（放大）");
    }
    return {
        distance: Number(merged.distance ?? 0),
        pinchIn: merged.pinchIn === true,
        relative: merged.relative === true,
        durationMs: swipe.durationMs,
        times: swipe.times,
        gapMs: swipe.gapMs
    };
}

/** 合并 cfg + 单次滑动参数，写入 durationMs / speed */
export function mobileSwipePayload(cfg, extra = {}) {
    const ms = resolveSwipeDurationMs({ ...cfg, ...extra });
    return withSwipeDuration(extra, ms);
}

