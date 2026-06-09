/**
 * ADA 流利 API：借鉴 Playwright / Selenium 的读法，底层仍是 ada() 语义命令。
 *
 * Web  → 像 Playwright：page.goto、find().fill、page.back、keyboard.press
 * 移动 → 像 Selenium + 移动语义：swipe、launchApp、find().fill/clear、recipe
 */
import path from "node:path";
import { ada, adaClose, adaRecipe, mustOk, setKeepAlive, wait } from "./ada.mjs";
import { dismissMobilePopups, dismissWebPopups } from "./popups.mjs";
import { readDevice } from "./read-device.mjs";
import { androidKillAllApps, harmonyKillAllAppsAda, iosKillAllAppsAda } from "./mobile-kill-all-apps.mjs";
import {
  SWIPE_DURATION_MS,
  mobileSwipePayload,
  parseSwipeOptions,
  parsePinchOptions
} from "./swipe-duration.mjs";
import { resolveSwipeEndpoints } from "./swipe-coords.mjs";
import { resolvePinchGesture } from "./pinch-coords.mjs";
import { createBack, createGoto } from "./mobile-phone-api.mjs";
import { fillSearchPayloadFromArg } from "./fill-search-options.mjs";
import { createDeviceAdminApi } from "./mobile-device-api.mjs";
import { resolveOpenSecond } from "./open-transport.mjs";
import { createSessionClose, createTargetExit } from "./session-lifecycle.mjs";

// —— 定位（Playwright 风格命名）——
export const by = {
  id: (name) => ({ css: `#${name}` }),
  css: (selector) => ({ css: selector }),
  xpath: (expr) => ({ xpath: expr }),
  text: (t) => ({ text: t }),
  role: (r) => ({ role: r }),
  testId: (id) => ({ testId: id }),
  /** 近似 getByPlaceholder */
  placeholder: (t) => ({ css: `[placeholder*="${t}"]` })
};

function mergeOpts(options, extra = {}) {
  return { ...options, ...extra };
}

/** 操作级 auto-wait 默认超时（毫秒），可通过 open(browser/device({ timeoutMs })) 覆盖 */
export const DEFAULT_ACTION_WAIT_MS = 20_000;

export { SWIPE_DURATION_MS };

/** Web 浏览器 type（device({ type }) 与 browser({ type }) 等价） */
const WEB_BROWSER_TYPES = new Set([
  "chrome",
  "chromium",
  "msedge",
  "microsoft-edge",
  "edge",
  "firefox",
  "webkit"
]);

/** @param {string} type */
export function isWebBrowserType(type) {
  return WEB_BROWSER_TYPES.has(String(type ?? "").toLowerCase());
}

/** `timeoutMs` / `actionWaitMs` 同义，写入 payload.waitTimeoutMs */
function resolveActionWaitMs(opts = {}) {
  const ms = opts.timeoutMs ?? opts.actionWaitMs;
  return typeof ms === "number" && Number.isFinite(ms) ? ms : DEFAULT_ACTION_WAIT_MS;
}

/** 执行时传入的界面匹配词（字符串或数组） */
function labelList(hints) {
  if (hints == null) return undefined;
  return typeof hints === "string" ? [hints] : [...hints];
}

function fillSearchExtra(hintsOrOpts) {
  return fillSearchPayloadFromArg(hintsOrOpts);
}

function normalizeLocator(spec, platform) {
  if (typeof spec !== "string") return spec;
  return platform === "web" ? by.css(spec) : { text: spec };
}

/**
 * 解析会话 ID（可省略；空字符串视为未指定）
 * - `platform(opts)` 仅配置对象
 * - `platform(sessionId, opts)` 显式会话名
 * - 配置里也可写 `sessionId`
 */
export function resolveSession(platform, sessionIdOrBase, baseMaybe) {
  const auto = () => `${platform}-${Date.now()}`;
  let sessionId;
  let base;

  if (baseMaybe !== undefined) {
    base = { ...(baseMaybe ?? {}) };
    if (typeof sessionIdOrBase === "string" && sessionIdOrBase.trim()) {
      sessionId = sessionIdOrBase.trim();
    } else {
      const fromOpts = base.sessionId;
      delete base.sessionId;
      sessionId = typeof fromOpts === "string" && fromOpts.trim() ? fromOpts.trim() : auto();
    }
  } else if (sessionIdOrBase != null && typeof sessionIdOrBase === "object") {
    base = { ...sessionIdOrBase };
    const fromOpts = base.sessionId;
    delete base.sessionId;
    sessionId = typeof fromOpts === "string" && fromOpts.trim() ? fromOpts.trim() : auto();
  } else {
    base = {};
    sessionId =
      typeof sessionIdOrBase === "string" && sessionIdOrBase.trim() ? sessionIdOrBase.trim() : auto();
  }

  return { sessionId, base };
}

/** Web / 移动：定位句柄（find / locator 共用） */
function makeFindHandle(platform, sessionId, base, run) {
  const query = async (command, extra) => {
    try {
      const r = await run(command, extra);
      return { success: true, data: r?.result?.data ?? r?.data ?? r };
    } catch {
      return { success: false };
    }
  };

  return (spec) => {
    const locator = normalizeLocator(spec, platform);
    return {
      click: () => run("click", { locator }),
      fill: (text) => run("type", { locator, text }),
      /** 清空输入框：Web Playwright clear；鸿蒙 uiDump+退格；Android 点元素+退格；iOS 置空 */
      clear: async () => {
        if (platform === "web") {
          await run("type", { locator, inputOp: "clear", webInputOp: "clear" });
          return;
        }
        if (platform === "harmony") {
          await run("type", { locator, inputOp: "clear", harmonyInputOp: "clear" });
          return;
        }
        if (platform === "android") {
          await run("type", { locator, inputOp: "clear", androidInputOp: "clear" });
          return;
        }
        if (platform === "ios") {
          await run("type", { locator, inputOp: "clear", iosInputOp: "clear" });
          return;
        }
        throw new Error(`clear() 当前不支持平台 "${platform}"`);
      },
      press: (key) => run("press", { locator, key }),
      exists: async () => (await query("assertVisible", { locator })).success,
      text: async () => {
        const r = await query("getText", { locator });
        if (!r.success) throw new Error("getText failed");
        return r.data?.text ?? "";
      }
    };
  };
}

/**
 * Web 会话（Playwright 风格）
 * @example
 * const page = web({ channel: "chrome" }); // sessionId 可省略，自动生成
 * await page.goto("https://www.jd.com");
 * await page.find(by.id("key")).fill("ABC");
 * await page.keyboard.press("Enter");
 * await page.screenshot("out/s1.png");
 * await page.close();
 */
/**
 * @param {string} sessionId
 * @param {object} base
 * @param {{ run: Function, close: Function, dismissPopups: Function }} deps
 */
export function buildWebDevice(sessionId, base, deps) {
  const { run, close: sessionClose, dismissPopups } = deps;
  const find = makeFindHandle("web", sessionId, base, run);
  const { exit, close } = createSessionClose(
    "web",
    createTargetExit("web", base, { sessionClose }),
    sessionClose
  );

  return {
    options: base,
    sessionId,
    goto: (url, opts) =>
      run("navigate", { url, ...(opts && typeof opts === "object" ? opts : {}) }),
    back: createBack(run),
    find,
    keyboard: { press: (key) => run("press", { key }) },
    screenshot: (filePath, opts) =>
      run("screenshot", {
        screenshotPath: path.resolve(filePath),
        fullPage: opts?.fullPage ?? false
      }),
    newTab: (url) => run("newTab", { url }),
    switchTab: (tabIndex = 0) => run("switchTab", { tabIndex }),
    closeTab: () => run("closeTab"),
    wait: (timeoutMs = 500) => run("wait", { timeoutMs }),
    dismissPopups,
    exit,
    close
  };
}

export function web(sessionIdOrOptions, options) {
  const { sessionId, base } = resolveSession("web", sessionIdOrOptions, options);
  const run = async (command, extra) => {
    const r = await ada("web", sessionId, command, mergeOpts(base, extra));
    mustOk(r, command);
    return r;
  };
  return buildWebDevice(sessionId, base, {
    run,
    close: () => adaClose("web", sessionId, base),
    dismissPopups: (dismissArg, attemptsArg) =>
      dismissWebPopups(sessionId, base, dismissArg, attemptsArg)
  });
}

function deviceIdFromCfg(platform, cfg) {
  return cfg.deviceId ?? cfg.device_id;
}

function mergeDeviceProbe(cfg, probe) {
  return {
    ...probe,
    ...cfg,
    capabilities: { ...probe.capabilities, ...(cfg.capabilities || {}) },
    screenWidth: cfg.screenWidth ?? probe.screenWidth,
    screenHeight: cfg.screenHeight ?? probe.screenHeight
  };
}

/** open(device) 内自动 adb/hdc 探测；`real: false` 或 `probeDevice: false` 可跳过 */
async function enrichDeviceConfig(platform, cfg) {
  if (cfg.probeDevice === false || cfg.real === false) return cfg;
  // iOS 无本地 adb/hdc 探测；MCP 或 WDA 驱动侧解析 udid/屏幕
  if (platform === "ios") return cfg;
  const probe = await readDevice({ type: platform, deviceId: deviceIdFromCfg(platform, cfg) });
  return mergeDeviceProbe(cfg, probe);
}

/**
 * 打开会话（Web 或移动设备）
 * @param {string|object} target `browser({...})` / `device({...})`，或网址（兼容旧写法）
 * @param {object} [browserOpts] 仅当 target 为网址时：browser 配置
 * @example const page = await open(browser({ sessionId: "jd-web-1", type: "chrome" })); await page.goto(url)
 * @example const page = await open(device({ sessionId: "jd-web-1", type: "chrome" })); await page.goto(url)  // Web 与 browser 等价
 * @example await open(device({ type: "harmony", sessionId: "jd-harmony", timeoutMs: 30000 }))
 * @example await open("https://www.jd.com", browser({ type: "chrome" }))  // 兼容
 *
 * 超时：`browser` / `device` 上传 `timeoutMs`（或 `actionWaitMs`），控制 click/输入等 auto-wait，默认 20000ms。
 *
 * MCP 第二参（三选一）：
 *   `open(device({...}), { connect: "mcp" })` 或 `"mcp"` — 自动 connectMcp；`close()` 仅关会话，脚本末尾 `exit()` 释放 MCP 客户端
 *   `open(device({...}), mcp)` / `{ mcp }` — 传入已有 connectMcp() 返回值（高级用法）
 */
export async function open(target, second) {
  const { useMcp, mcpSecond } = resolveOpenSecond(second);

  if (typeof target === "object" && target?._openKind === "device") {
    const { _openKind, platform, probeDevice, ...cfg } = target;
    if (isWebBrowserType(platform)) {
      return open(browser({ type: platform, ...cfg }), second);
    }
    const enriched = await enrichDeviceConfig(platform, cfg);
    if (useMcp) {
      const { ensureMcpClient } = await import("./ada-mcp.mjs");
      const { openDeviceViaMcp, attachMcpLifecycle } = await import("./ada-mcp-adapters.mjs");
      const mcp = await ensureMcpClient(mcpSecond);
      const phone = openDeviceViaMcp(mcp.client, platform, enriched);
      return attachMcpLifecycle(phone, mcp);
    }
    if (platform === "android") return android(enriched);
    if (platform === "harmony") return harmony(enriched);
    if (platform === "ios") return ios(enriched);
    throw new Error(`open(device): 不支持的 type "${platform}"`);
  }
  if (typeof target === "object" && target?._openKind === "browser") {
    const { _openKind, ...cfg } = target;
    if (useMcp) {
      const { ensureMcpClient } = await import("./ada-mcp.mjs");
      const { openWebViaMcp, attachMcpLifecycle } = await import("./ada-mcp-adapters.mjs");
      const mcp = await ensureMcpClient(mcpSecond);
      const page = openWebViaMcp(mcp.client, cfg);
      return attachMcpLifecycle(page, mcp);
    }
    return web(cfg);
  }
  if (typeof target === "string") {
    if (useMcp) {
      const { ensureMcpClient } = await import("./ada-mcp.mjs");
      const { openWebViaMcp, attachMcpLifecycle } = await import("./ada-mcp-adapters.mjs");
      const mcp = await ensureMcpClient(mcpSecond);
      const page = attachMcpLifecycle(openWebViaMcp(mcp.client, mcpSecond), mcp);
      await page.goto(target);
      return page;
    }
    const page = web(second && typeof second === "object" ? second : {});
    await page.goto(target);
    return page;
  }
  throw new Error("open: 请传入 browser({...})、device({...}) 或网址");
}

/**
 * Web 浏览器会话选项（传给 open / web）
 * @param {object} [opts]
 * @param {string} [opts.type="chrome"] 浏览器类型：chrome | chromium | msedge 等（映射驱动 channel）
 * @param {boolean|number} [opts.cdp] CDP 模式：true 用默认端口，数字指定端口
 * @param {string} [opts.profile] 本地用户数据目录（userDataDir）
 * @param {number} [opts.timeoutMs] 操作 auto-wait 超时（毫秒），同 actionWaitMs，默认 20000
 * @param {number} [opts.actionWaitMs] 同 timeoutMs
 * @param {boolean} [opts.keepAlive] 为 true 时脚本结束不自动 quit（会话留给后续复用）
 * @example
 * browser({ type: "chrome" })
 * browser({ type: "chrome", timeoutMs: 30000 })
 * browser({ type: "chrome", profile: "./chrome-profile" })
 * browser({ type: "chrome", cdp: 9222 })
 */
export function browser(opts = {}) {
  const { type = "chrome", cdp, profile, timeoutMs, actionWaitMs, sessionId, keepAlive, ...rest } = opts;
  if (keepAlive === true) setKeepAlive(true);
  const out = { channel: type, waitTimeoutMs: resolveActionWaitMs({ timeoutMs, actionWaitMs }), ...rest };
  if (sessionId) out.sessionId = sessionId;

  if (profile) {
    out.userDataDir = path.resolve(profile);
  }

  if (cdp !== undefined && cdp !== false && cdp !== null) {
    out.cdpAutoLaunch = true;
    out.cdpPort =
      typeof cdp === "number"
        ? cdp
        : Number(process.env.ADA_PLAYWRIGHT_CDP_PORT ?? 9222);
  }

  return { _openKind: "browser", ...out };
}

/**
 * 移动设备会话选项（传给 open(device(...))，写法与 browser 一致）
 * @param {object} [opts]
 * @param {"android"|"harmony"|"ios"|"chrome"|"chromium"|"msedge"|"firefox"|"webkit"} [opts.type="harmony"] 平台；Web 浏览器 type 与 `browser({ type })` 等价
 * @param {string} [opts.deviceId] 设备 ID（`device_id` 同义；Android→udid，鸿蒙→deviceSn）
 * @param {string} [opts.device_id] 同 deviceId
 * @param {string} [opts.sessionId] 会话名（可省略，自动生成）
 * @param {boolean} [opts.real] 默认真机；仅 Mock 演示时写 `real: false`
 * @param {string} [opts.appId] 可选；启动 App 请用 `phone.goto(appId)`，结束 App 请用 `phone.exit(appId)`
 * @param {string} [opts.abilityId] 可选；随 `goto` 第二参传入，不必写在 device 上
 * @param {number} [opts.timeoutMs] 操作 auto-wait 超时（毫秒），同 actionWaitMs，默认 20000
 * @param {number} [opts.actionWaitMs] 同 timeoutMs
 * @param {boolean} [opts.probeDevice] 默认 open 时自动探测设备；设为 false 可关闭
 * @param {string[]} [opts.excludePackages] killAllApps 不结束的包名列表
 * @example await open(device({ type: "harmony", sessionId: "jd-harmony" }))
 * @example await open(device({ type: "android", sessionId: "jd-android", device_id: "SN" }))  // 多台设备
 */
export function device(opts = {}) {
  const {
    type = "harmony",
    deviceId: deviceIdOpt,
    device_id,
    sessionId,
    real,
    appId,
    abilityId,
    timeoutMs,
    actionWaitMs,
    keepAlive,
    durationMs: _durationMs,
    swipePreset: _swipePreset,
    swipeSpeed: _swipeSpeed,
    ...rest
  } = opts;
  if (isWebBrowserType(type)) {
    return browser(opts);
  }
  if (keepAlive === true) setKeepAlive(true);
  const deviceId = deviceIdOpt ?? device_id;

  const platform = type;
  const out = {
    _openKind: "device",
    platform,
    waitTimeoutMs: resolveActionWaitMs({ timeoutMs, actionWaitMs }),
    ...rest
  };
  if (sessionId) out.sessionId = sessionId;
  if (real !== undefined) out.real = real;
  if (appId != null) out.appId = appId;
  if (abilityId != null) out.abilityId = abilityId;

  if (deviceId) {
    const caps = { ...(out.capabilities || {}) };
    if (platform === "android" || platform === "ios") caps.udid = deviceId;
    else caps.deviceSn = deviceId;
    out.capabilities = caps;
  }

  return out;
}

// —— 移动（Selenium 动作名 + ADA recipe）——

function screenFromCfg(cfg, screen) {
  return (
    screen ?? {
      width: cfg.screenWidth ?? 1080,
      height: cfg.screenHeight ?? 2400
    }
  );
}

/**
 * 统一滑动：默认像素坐标；`{ relative: true }` 时数值按 0~1；支持占位符（如 "leftMiddle"、"6%"、"left"）。
 */
function createSwipe(run, cfg, screen) {
  return async (from, to, durationOrOpts) => {
    const { times, gapMs, durationMs, fling, relative } = parseSwipeOptions(durationOrOpts, cfg);
    const scr = screenFromCfg(cfg, screen);
    const resolved = resolveSwipeEndpoints(from, to, scr, { relative });
    const base = {
      from: resolved.from,
      to: resolved.to,
      screenWidth: scr.width,
      screenHeight: scr.height
    };
    for (let i = 0; i < times; i++) {
      await run("swipe", mobileSwipePayload(cfg, { ...base, durationMs, fling }));
      if (i < times - 1) await wait(gapMs);
    }
  };
}

/**
 * 双指捏合/放大：默认像素；`{ relative: true }` 时坐标与 distance 按屏比例；需 `pinchIn`。
 */
/** @param {string} platform @param {string} sessionId @param {object} cfg */
function createRunData(platform, sessionId, cfg) {
  return async (command, extra = {}) => {
    const r = await ada(platform, sessionId, command, { ...cfg, ...extra });
    mustOk(r, command);
    return r.data ?? {};
  };
}

function createPinch(run, cfg, screen) {
  return async (finger1, finger2, distance, opts = {}) => {
    if (typeof distance !== "number" || !Number.isFinite(distance)) {
      throw new Error("pinch: distance 须为数字（每指沿径向位移，像素或比例）");
    }
    const { times, gapMs, durationMs, pinchIn, relative } = parsePinchOptions(
      { distance, ...opts },
      cfg
    );
    const scr = screenFromCfg(cfg, screen);
    const ends = resolvePinchGesture(finger1, finger2, distance, scr, { pinchIn, relative });
    const base = {
      finger1: ends.finger1Start,
      finger2: ends.finger2Start,
      finger1End: ends.finger1End,
      finger2End: ends.finger2End,
      pinchIn,
      screenWidth: scr.width,
      screenHeight: scr.height,
      durationMs
    };
    for (let i = 0; i < times; i++) {
      await run("pinch", base);
      if (i < times - 1) await wait(gapMs);
    }
  };
}

/**
 * Android 设备（Selenium 风格方法名）
 * @example
 * const phone = android("jd", { capabilities: { udid: "xxx" }, screenWidth: 1080, screenHeight: 2400 });
 * await phone.wake();
 * await phone.swipe([540, 1800], [540, 400], "fast");
 * await phone.swipe([0.06, 0.5], [0.94, 0.5], { relative: true, durationMs: 1200 });
 * await phone.goto("com.jingdong.app.mall");
 * await phone.fillSearch("关键词", ["搜索"]);
 * await phone.back();
 * await phone.goto("首页");
 * await phone.exit();
 * await phone.close();
 */
/**
 * @param {string} sessionId
 * @param {object} cfg
 * @param {{ width: number, height: number }} screen
 * @param {{ run: Function, recipe: Function, close: Function, dismissPopups: Function, killAllApps: Function, wake?: Function }} deps
 */
export function buildAndroidDevice(sessionId, cfg, screen, deps) {
  const { run, recipe, close: sessionClose, dismissPopups, killAllApps, wake } = deps;
  const find = makeFindHandle("android", sessionId, cfg, run);
  const { exit, close } = createSessionClose(
    "android",
    createTargetExit("android", cfg, { run, sessionClose }),
    sessionClose
  );

  const runData = createRunData("android", sessionId, cfg);
  return {
    base: cfg,
    sessionId,
    screen,
    find,
    wake,
    killAllApps,
    swipe: createSwipe(run, cfg, screen),
    pinch: createPinch(run, cfg, screen),
    back: createBack(run),
    goto: createGoto("android", find, run),
    dismissPopups,
    fillSearch: (text, hintsOrOpts) => recipe("fill_search", text, fillSearchExtra(hintsOrOpts)),
    screenshot: (filePath, opts) =>
      run("screenshot", {
        screenshotPath: path.resolve(filePath),
        fullPage: opts?.fullPage ?? false
      }),
    pressHome: () => run("pressHome"),
    exit,
    close,
    ...createDeviceAdminApi("android", runData)
  };
}

export function android(sessionIdOrBase, base) {
  const { sessionId, base: cfg } = resolveSession("android", sessionIdOrBase, base);
  const screen = { width: cfg.screenWidth ?? 1080, height: cfg.screenHeight ?? 2400 };
  const run = async (command, extra) => {
    const r = await ada("android", sessionId, command, { ...cfg, ...extra });
    mustOk(r, command);
    return r;
  };
  const recipe = async (action, text, extra = {}) =>
    mustOk(await adaRecipe("android", sessionId, action, { ...cfg, ...extra }, text ?? ""), action);

  return buildAndroidDevice(sessionId, cfg, screen, {
    run,
    recipe,
    close: () => adaClose("android", sessionId, cfg),
    dismissPopups: (dismissArg, attemptsArg) =>
      dismissMobilePopups("android", sessionId, cfg, screen, dismissArg, attemptsArg),
    killAllApps: async (opts = {}) => {
      const { spawn } = await import("node:child_process");
      const udid = cfg.capabilities?.udid ?? "";
      const adb = (args) =>
        new Promise((resolve) => {
          const c = spawn("adb", [...(udid ? ["-s", udid] : []), "shell", ...args]);
          c.on("close", () => resolve());
        });
      return androidKillAllApps(adb, screen, { ...cfg, ...opts });
    },
    wake: async () => {
      const { spawn } = await import("node:child_process");
      const udid = cfg.capabilities?.udid ?? "";
      const adb = (args) =>
        new Promise((resolve, reject) => {
          const c = spawn("adb", [...(udid ? ["-s", udid] : []), "shell", ...args]);
          c.on("close", (code) => (code === 0 ? resolve() : reject(new Error("wake failed"))));
        });
      await adb(["input", "keyevent", "KEYCODE_WAKEUP"]);
    }
  });
}

/**
 * 鸿蒙设备（坐标用 0~1，与驱动一致）
 */
/**
 * @param {string} sessionId
 * @param {object} cfg
 * @param {{ run: Function, close: Function, dismissPopups: Function, killAllApps: Function, wake?: Function }} deps
 */
export function buildHarmonyDevice(sessionId, cfg, deps) {
  const { run, recipe, close: sessionClose, dismissPopups, killAllApps, wake } = deps;
  const find = makeFindHandle("harmony", sessionId, cfg, run);
  const { exit, close } = createSessionClose(
    "harmony",
    createTargetExit("harmony", cfg, { run, sessionClose }),
    sessionClose
  );

  const screen = {
    width: cfg.screenWidth ?? 1080,
    height: cfg.screenHeight ?? 2400
  };

  const runData = createRunData("harmony", sessionId, cfg);
  return {
    sessionId,
    base: cfg,
    screen,
    find,
    suspend: () => run("custom", { custom: { action: "shell", command: "power-shell suspend" } }),
    wake:
      wake ??
      (() => run("custom", { custom: { action: "shell", command: "power-shell wakeup" } })),
    killAllApps,
    swipe: createSwipe(run, cfg, screen),
    pinch: createPinch(run, cfg, screen),
    back: createBack(run),
    goto: createGoto("harmony", find, run),
    dismissPopups,
    fillSearch: recipe ? (text, hintsOrOpts) => recipe("fill_search", text, fillSearchExtra(hintsOrOpts)) : undefined,
    /** 向当前焦点输入（点击输入框后使用，无需 locator） */
    type: (text) => run("type", { text }),
    screenshot: (filePath, opts) =>
      run("screenshot", {
        screenshotPath: path.resolve(filePath),
        fullPage: opts?.fullPage ?? false
      }),
    pressHome: () => run("pressHome"),
    exit,
    close,
    ...createDeviceAdminApi("harmony", runData)
  };
}

export function harmony(sessionIdOrBase, base) {
  const { sessionId, base: cfg } = resolveSession("harmony", sessionIdOrBase, base);
  const run = async (command, extra) => {
    const r = await ada("harmony", sessionId, command, { ...cfg, ...extra });
    mustOk(r, command);
    return r;
  };
  const recipe = async (action, text, extra = {}) =>
    mustOk(await adaRecipe("harmony", sessionId, action, { ...cfg, ...extra }, text ?? ""), action);

  return buildHarmonyDevice(sessionId, cfg, {
    run,
    recipe,
    close: () => adaClose("harmony", sessionId, cfg),
    dismissPopups: (dismissArg, attemptsArg) =>
      dismissMobilePopups(
        "harmony",
        sessionId,
        cfg,
        { width: cfg.screenWidth ?? 1080, height: cfg.screenHeight ?? 2400 },
        dismissArg,
        attemptsArg
      ),
    killAllApps: (opts = {}) => harmonyKillAllAppsAda("harmony", sessionId, cfg, opts)
  });
}

export function buildIosDevice(sessionId, cfg, screen, deps) {
  const { run, recipe, close: sessionClose, dismissPopups, killAllApps, wake } = deps;
  const find = makeFindHandle("ios", sessionId, cfg, run);
  const { exit, close } = createSessionClose(
    "ios",
    createTargetExit("ios", cfg, { run, sessionClose }),
    sessionClose
  );

  const runData = createRunData("ios", sessionId, cfg);
  return {
    base: cfg,
    sessionId,
    screen,
    find,
    wake,
    killAllApps,
    swipe: createSwipe(run, cfg, screen),
    pinch: createPinch(run, cfg, screen),
    back: createBack(run),
    goto: createGoto("ios", find, run),
    dismissPopups,
    fillSearch: (text, hintsOrOpts) => recipe("fill_search", text, fillSearchExtra(hintsOrOpts)),
    screenshot: (filePath, opts) =>
      run("screenshot", {
        screenshotPath: path.resolve(filePath),
        fullPage: opts?.fullPage ?? false
      }),
    pressHome: () => run("pressHome"),
    exit,
    close,
    ...createDeviceAdminApi("ios", runData)
  };
}

export function ios(sessionIdOrBase, base) {
  const { sessionId, base: cfg } = resolveSession("ios", sessionIdOrBase, base);
  const screen = { width: cfg.screenWidth ?? 390, height: cfg.screenHeight ?? 844 };
  const run = async (command, extra) => {
    const r = await ada("ios", sessionId, command, { ...cfg, ...extra });
    mustOk(r, command);
    return r;
  };
  const recipe = async (action, text, extra = {}) =>
    mustOk(await adaRecipe("ios", sessionId, action, { ...cfg, ...extra }, text ?? ""), action);

  return buildIosDevice(sessionId, cfg, screen, {
    run,
    recipe,
    close: () => adaClose("ios", sessionId, cfg),
    dismissPopups: (dismissArg, attemptsArg) =>
      dismissMobilePopups("ios", sessionId, cfg, screen, dismissArg, attemptsArg),
    killAllApps: (opts = {}) => iosKillAllAppsAda("ios", sessionId, cfg, opts),
    wake: async () => {
      await run("deviceAdmin", { action: "wake" });
    }
  });
}
