function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function pickBool(p: Record<string, unknown>, options: Record<string, unknown>, key: string): boolean | undefined {
  if (typeof p[key] === "boolean") {
    return p[key] as boolean;
  }
  if (typeof options[key] === "boolean") {
    return options[key] as boolean;
  }
  return undefined;
}

/**
 * 默认有头模式（浏览器窗口可见），便于本地/MCP 调试。
 * 仅当 payload.headless===true 或 ADA_PLAYWRIGHT_HEADLESS=true 时为无头。
 */
export function resolvePlaywrightHeadless(payload?: Record<string, unknown>): boolean {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const explicit = pickBool(p, options, "headless");
  if (explicit !== undefined) {
    return explicit;
  }
  const env = process.env.ADA_PLAYWRIGHT_HEADLESS?.trim().toLowerCase();
  if (env === "true" || env === "1") {
    return true;
  }
  if (env === "false" || env === "0") {
    return false;
  }
  return false;
}

/** 有头模式下是否将页面/浏览器窗口置前（默认 true） */
export function resolvePlaywrightBringToFront(payload?: Record<string, unknown>): boolean {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const explicit = pickBool(p, options, "bringToFront");
  if (explicit !== undefined) {
    return explicit;
  }
  const env = process.env.ADA_PLAYWRIGHT_BRING_TO_FRONT?.trim().toLowerCase();
  if (env === "false" || env === "0") {
    return false;
  }
  return true;
}

/**
 * 有头模式是否最大化窗口（默认 true）。
 * 无头始终 false；显式 `maximize:false` / `windowState` / `ADA_PLAYWRIGHT_MAXIMIZE=0` 可关闭。
 */
export function resolvePlaywrightMaximize(payload?: Record<string, unknown>): boolean {
  if (resolvePlaywrightHeadless(payload)) {
    return false;
  }
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const explicit = pickBool(p, options, "maximize");
  if (explicit !== undefined) {
    return explicit;
  }
  const state = String(p.windowState ?? options.windowState ?? "")
    .trim()
    .toLowerCase();
  if (state === "maximized" || state === "maximize") {
    return true;
  }
  if (state === "normal" || state === "minimized" || state === "fullscreen") {
    return false;
  }
  const env = process.env.ADA_PLAYWRIGHT_MAXIMIZE?.trim().toLowerCase();
  if (env === "false" || env === "0" || env === "off") {
    return false;
  }
  return true;
}

/**
 * 最大化时补齐 launch/context 默认：`viewport:null`（跟真实窗口）+ `--start-maximized`。
 * 调用方已显式设置 viewport / args 时不覆盖。
 */
export function applyPlaywrightMaximizeDefaults(payload?: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...asRecord(payload) };
  if (!resolvePlaywrightMaximize(merged)) {
    return merged;
  }
  const contextOptions = { ...asRecord(merged.contextOptions) };
  if (!Object.prototype.hasOwnProperty.call(contextOptions, "viewport")) {
    contextOptions.viewport = null;
  }
  const launchOptions = { ...asRecord(merged.launchOptions) };
  const args = Array.isArray(launchOptions.args)
    ? (launchOptions.args as unknown[]).map(String)
    : [];
  if (!args.some((a) => /start-maximized/i.test(a))) {
    launchOptions.args = [...args, "--start-maximized"];
  }
  merged.contextOptions = contextOptions;
  merged.launchOptions = launchOptions;
  return merged;
}

/** 只读：当前环境解析出的 Web 启动默认（不改行为，供 health/sessions 观测）。 */
export function resolvePlaywrightEffectiveDefaults(payload?: Record<string, unknown>): {
  headless: boolean;
  maximize: boolean;
  bringToFront: boolean;
  viewportMode: "window" | "playwright-default";
  profile: "local-headed" | "ci-headless" | "headed-no-maximize";
} {
  const headless = resolvePlaywrightHeadless(payload);
  const maximize = resolvePlaywrightMaximize(payload);
  const bringToFront = resolvePlaywrightBringToFront(payload);
  return {
    headless,
    maximize,
    bringToFront,
    viewportMode: !headless && maximize ? "window" : "playwright-default",
    profile: headless ? "ci-headless" : maximize ? "local-headed" : "headed-no-maximize"
  };
}
