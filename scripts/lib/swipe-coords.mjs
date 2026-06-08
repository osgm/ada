/** 滑动坐标解析（与 packages/driver-rpc/src/swipe-coords.ts 同步） — run: npm run sync:scripts-lib */

/** 命名点占位符（相对比例 0~1，配合 relative:true 或按屏换算像素） */
export const SWIPE_POINT_PRESETS = {
    center: [0.5, 0.5],
    left: [0.06, 0.5],
    right: [0.94, 0.5],
    top: [0.5, 0.08],
    bottom: [0.5, 0.92],
    leftMiddle: [0.06, 0.5],
    rightMiddle: [0.94, 0.5],
    topMiddle: [0.5, 0.08],
    bottomMiddle: [0.5, 0.92],
    leftEdge: [0.06, 0.5],
    rightEdge: [0.94, 0.5],
    topEdge: [0.5, 0.08],
    bottomEdge: [0.5, 0.92]
};
/** 单轴占位符 → 相对比例 */
const AXIS_RATIO = {
    left: 0.06,
    right: 0.94,
    top: 0.08,
    bottom: 0.92,
    hcenter: 0.5,
    vcenter: 0.5,
    center: 0.5,
    xcenter: 0.5,
    ycenter: 0.5,
    leftedge: 0.06,
    rightedge: 0.94,
    topedge: 0.08,
    bottomedge: 0.92
};
function asPair(point) {
    if (typeof point === "string") {
        const preset = SWIPE_POINT_PRESETS[point.trim()];
        if (!preset) {
            const key = Object.keys(SWIPE_POINT_PRESETS).find((k) => k.toLowerCase() === point.trim().toLowerCase());
            if (key)
                return SWIPE_POINT_PRESETS[key];
            throw new Error(`swipe: 未知占位符 "${point}"`);
        }
        return preset;
    }
    if (!Array.isArray(point) || point.length < 2) {
        throw new Error("swipe: 坐标须为 [x, y] 或命名占位符");
    }
    return [point[0], point[1]];
}
function parsePercent(value) {
    const m = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*%$/);
    if (!m)
        return undefined;
    return Number(m[1]) / 100;
}
function resolveAxis(value, dim, relative) {
    if (typeof value === "number" && Number.isFinite(value)) {
        if (relative)
            return Math.round(value * dim);
        return Math.round(value);
    }
    if (typeof value !== "string") {
        throw new Error(`swipe: 无效坐标分量 ${String(value)}`);
    }
    const raw = value.trim();
    const pct = parsePercent(raw);
    if (pct !== undefined)
        return Math.round(pct * dim);
    const ratio = AXIS_RATIO[raw.toLowerCase()];
    if (ratio !== undefined)
        return Math.round(ratio * dim);
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) {
        if (relative && asNum >= 0 && asNum <= 1)
            return Math.round(asNum * dim);
        if (!relative)
            return Math.round(asNum);
        return Math.round(asNum * dim);
    }
    throw new Error(`swipe: 无法解析坐标占位符 "${raw}"`);
}
export function resolveSwipePoint(point, screen, options = {}) {
    const relative = options.relative === true;
    const [xVal, yVal] = asPair(point);
    return [
        resolveAxis(xVal, screen.width, relative),
        resolveAxis(yVal, screen.height, relative)
    ];
}
export function resolveSwipeEndpoints(from, to, screen, options = {}) {
    return {
        from: resolveSwipePoint(from, screen, options),
        to: resolveSwipePoint(to, screen, options)
    };
}
/**
 * 将滑动起终点转为像素。默认 payload 已是像素；仅当 relative:true 时按 0~1 缩放。
 */
export function normalizedSwipePoints(screen, from, to, options = {}) {
    if (options.relative === true) {
        const norm = (p) => [
            Math.round(p[0] * screen.width),
            Math.round(p[1] * screen.height)
        ];
        return { from: norm(from), to: norm(to) };
    }
    return {
        from: [Math.round(from[0]), Math.round(from[1])],
        to: [Math.round(to[0]), Math.round(to[1])]
    };
}
export function harmonySwipePixels(screen, from, to, durationMs, options = {}) {
    const px = normalizedSwipePoints(screen, from, to, options);
    return {
        ...px,
        durationMs: Math.max(50, Math.round(durationMs))
    };
}
