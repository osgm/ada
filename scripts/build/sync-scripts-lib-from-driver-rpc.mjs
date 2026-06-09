/**
 * Transpile standalone @ada/driver-rpc helpers into scripts/lib (examples / ada-fluent).
 * Python copies (swipe_coords.py etc.) must be updated manually when presets change.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transpileTsModule } from "./lib/transpile-ts-module.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** ada-fluent 专用：driver-rpc 不含，sync 后追加到 swipe-duration.mjs */
const SWIPE_DURATION_ADA_FLUENT_FOOTER = `
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
`;

const modules = [
  {
    src: "packages/driver-rpc/src/swipe-coords.ts",
    dest: "scripts/lib/swipe-coords.mjs",
    note: "滑动坐标解析（与 packages/driver-rpc/src/swipe-coords.ts 同步）"
  },
  {
    src: "packages/driver-rpc/src/swipe-duration.ts",
    dest: "scripts/lib/swipe-duration.mjs",
    note: "与 @ada/driver-rpc swipe-duration 保持同步"
  },
  {
    src: "packages/driver-rpc/src/fill-search-options.ts",
    dest: "scripts/lib/fill-search-options.mjs",
    note: "fillSearch 选项解析 — 与 packages/driver-rpc/src/fill-search-options.ts 同步"
  }
];

async function main() {
  for (const mod of modules) {
    const srcPath = path.join(root, mod.src);
    const destPath = path.join(root, mod.dest);
    const source = await fs.readFile(srcPath, "utf8");
    const body = transpileTsModule(source, path.basename(mod.src));
    const header = `/** ${mod.note} — run: npm run sync:scripts-lib */\n\n`;
    const footer = mod.dest.endsWith("swipe-duration.mjs") ? SWIPE_DURATION_ADA_FLUENT_FOOTER : "";
    await fs.writeFile(destPath, header + body + footer + "\n", "utf8");
    console.log(`[sync-scripts-lib] ${mod.dest}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
