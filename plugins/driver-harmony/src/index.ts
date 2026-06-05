import type { CommandEnvelope, CommandResult, InvokePayload } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import {
  normalizeInvokePayload,
  normalizedSwipePoints,
  normalizeMobileCustomAction,
  parseUiHeuristicsFromPayload,
  raceCommandTimeout,
  resolveCommandTimeoutMs,
  resolveLocatorTimeoutMs,
  resolveSubOperationTimeoutMs,
  platformRecipeErrorCode,
  runMobileCustomAction,
  buildOptionalUiMissResult,
  harmonySwipePixels,
  isOptionalUiPayload,
  withSuppressedHypiumProbeLogs,
  resolveSwipeDurationMs,
  readPinchEndsFromPayload,
  serializeRpcResult,
  findUiNode
} from "@ada/driver-rpc";
import { buildHarmonyRecipeContext } from "./recipe-context.js";
import { executeHarmonyPinch, type HypiumPinchTypes } from "./harmony-pinch.js";
import { pasteTextViaHostClipboard, shellInputTextAt } from "./harmony-paste-text.js";
import { executeHarmonyDeviceAdmin } from "./device-admin.js";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

type HarmonyDriverLike = {
  disconnect(): Promise<void>;
  getDisplaySize(): Promise<{ x?: number; y?: number; width?: number; height?: number }>;
  click(x: number, y: number): Promise<void>;
  swipe(startX: number, startY: number, endX: number, endY: number, speed?: number): Promise<void>;
  injectMultiPointerAction?(matrix: unknown, speed?: number): Promise<void>;
  fling?(startX: number, startY: number, endX: number, endY: number, steps?: number, speed?: number): Promise<void>;
  inputText(point: { x: number; y: number }, text: string): Promise<void>;
  pressBack(): Promise<void>;
  pressHome(): Promise<void>;
  screenCap(filePath: string): Promise<string>;
  shell(cmd: string, timeout?: number): Promise<string>;
  hdc(cmd: string, timeout?: number): Promise<string>;
  startApp(bundleName: string, abilityName?: string, extraOptions?: string): Promise<void>;
  stopApp(bundleName: string, extraOptions?: string): Promise<void>;
  getInstalledApps?(extraOptions?: string): Promise<string[]>;
  findComponent(by: unknown, timeout?: number): unknown;
  findComponentByXpath(by: string, timeout?: number): Promise<unknown>;
};

type HarmonyByFactory = {
  text(v: string): unknown;
  id(v: string): unknown;
  key(v: string): unknown;
  type(v: string): unknown;
};

type HarmonyModuleLike = {
  UiDriver: {
    connect(opts: Record<string, unknown>): Promise<HarmonyDriverLike>;
  };
  BY: HarmonyByFactory;
  byExpression?: (expression: string) => unknown;
};

interface HarmonySessionState {
  driver: HarmonyDriverLike;
  signature: string;
  connectedAt: number;
}

const sessions = new Map<string, HarmonySessionState>();
let harmonyModulePromise: Promise<HarmonyModuleLike> | null = null;
const localRequire = createRequire(typeof __filename === "string" ? __filename : process.cwd());

interface HarmonyPayload {
  real?: boolean;
  mock?: boolean;
  action?: string;
  point?: [number, number];
  from?: [number, number];
  to?: [number, number];
  speed?: number;
  durationMs?: number;
  swipePreset?: string;
  swipeSpeed?: string;
  text?: string;
  timeoutMs?: number;
  screenshotPath?: string;
  expectedText?: string;
  appId?: string;
  bundleId?: string;
  abilityId?: string;
  ability?: string;
  fling?: boolean;
  pinchIn?: boolean;
  probe?: boolean;
  custom?: {
    action?: string;
    method?: string;
    path?: string;
    body?: Record<string, unknown>;
    command?: string;
    timeoutMs?: number;
    text?: string;
    maxBack?: number;
  };
  screenWidth?: number;
  screenHeight?: number;
  locatorTimeoutMs?: number;
  commandTimeoutMs?: number;
  uiHeuristics?: Record<string, unknown>;
  /** clear：仅清空搜索框（避免脚本侧退格落在输入法上） */
  inputOp?: "clear" | "fill";
  harmonyInputOp?: "clear" | "fill";
  optional?: boolean;
  bestEffort?: boolean;
  locator?: {
    text?: string;
    id?: string;
    key?: string;
    type?: string;
    xpath?: string;
    byExpression?: string;
  };
  capabilities?: {
    "ada:udid"?: string;
    udid?: string;
    deviceSn?: string;
    hdcHost?: string;
    hdcPort?: number;
  };
}

function failResult(command: CommandEnvelope, code: string, message: string): CommandResult {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}

function ensureReal(payload: HarmonyPayload): boolean {
  if (payload.mock === true) {
    return false;
  }
  if (payload.real === false) {
    return false;
  }
  return true;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asPoint2(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return [x, y];
}

async function loadHarmonyModule(): Promise<HarmonyModuleLike> {
  if (!harmonyModulePromise) {
    harmonyModulePromise = (async () => {
      try {
        return localRequire("hypium-driver") as HarmonyModuleLike;
      } catch {
        return (await new Function('return import("hypium-driver")')()) as HarmonyModuleLike;
      }
    })();
  }
  return harmonyModulePromise;
}

function resolveConnectOpts(payload: HarmonyPayload): Record<string, unknown> {
  const caps = payload.capabilities ?? {};
  const deviceSn =
    String(caps.deviceSn ?? caps["ada:udid"] ?? caps.udid ?? process.env.ADA_HARMONY_DEVICE_SN ?? "").trim() || undefined;
  const hdcHost = String(caps.hdcHost ?? process.env.ADA_HARMONY_HDC_HOST ?? "").trim() || undefined;
  const hdcPortRaw = caps.hdcPort ?? process.env.ADA_HARMONY_HDC_PORT;
  const hdcPort = typeof hdcPortRaw === "number" ? hdcPortRaw : Number(hdcPortRaw);
  return {
    deviceSn,
    udid: deviceSn,
    hdcHost,
    hdcPort: Number.isFinite(hdcPort) && hdcPort > 0 ? hdcPort : undefined
  };
}

function buildSignature(payload: HarmonyPayload): string {
  return JSON.stringify(resolveConnectOpts(payload));
}

function resolveConnectTimeoutMs(payload: HarmonyPayload): number {
  const fromPayload = typeof payload.commandTimeoutMs === "number" ? payload.commandTimeoutMs : undefined;
  const cmd = fromPayload && fromPayload > 0 ? fromPayload : resolveCommandTimeoutMs(payload as Record<string, unknown>);
  const env = Number(process.env.ADA_HARMONY_CONNECT_TIMEOUT_MS ?? "45000");
  const envCap = Number.isFinite(env) && env > 0 ? env : 45_000;
  return Math.min(cmd, envCap, resolveSubOperationTimeoutMs(cmd, 45_000, 0.6));
}

function opTimeoutMs(payload: HarmonyPayload, fallbackMs: number): number {
  const cmd = resolveCommandTimeoutMs(payload as Record<string, unknown>);
  return resolveSubOperationTimeoutMs(cmd, fallbackMs, 0.85);
}

async function getOrCreateDriver(session: DriverSession, payload: HarmonyPayload): Promise<HarmonyDriverLike> {
  const signature = buildSignature(payload);
  const existed = sessions.get(session.id);
  if (existed && existed.signature === signature) {
    return existed.driver;
  }
  if (existed) {
    await existed.driver.disconnect().catch(() => undefined);
  }
  const mod = await loadHarmonyModule();
  const connectMs = resolveConnectTimeoutMs(payload);
  const driver = await raceCommandTimeout(mod.UiDriver.connect(resolveConnectOpts(payload)), connectMs, "harmony.connect");
  sessions.set(session.id, { driver, signature, connectedAt: Date.now() });
  return driver;
}

async function resolveDisplay(driver: HarmonyDriverLike): Promise<{ width: number; height: number }> {
  try {
    const size = await driver.getDisplaySize();
    const width = numberOr((size as { width?: number }).width ?? (size as { x?: number }).x, 0);
    const height = numberOr((size as { height?: number }).height ?? (size as { y?: number }).y, 0);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  } catch {
    // ignore
  }
  return { width: 1080, height: 1920 };
}

async function normalizeAbsPoint(point: [number, number], driver: HarmonyDriverLike): Promise<{ x: number; y: number }> {
  const [rawX, rawY] = point;
  if (rawX >= 0 && rawX <= 1 && rawY >= 0 && rawY <= 1) {
    const size = await resolveDisplay(driver);
    return {
      x: Math.round(rawX * size.width),
      y: Math.round(rawY * size.height)
    };
  }
  return { x: Math.round(rawX), y: Math.round(rawY) };
}

async function findHarmonyComponent(
  driver: HarmonyDriverLike,
  finder: () => Promise<unknown> | unknown,
  _optional: boolean
): Promise<unknown> {
  return withSuppressedHypiumProbeLogs(async () => {
    try {
      const value = await finder();
      return value ?? null;
    } catch {
      return null;
    }
  });
}

async function resolveElement(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<unknown> {
  const locator = payload.locator ?? {};
  const optional = isOptionalUiPayload(payload as Record<string, unknown>);
  const timeoutMs = resolveLocatorTimeoutMs(payload as Record<string, unknown>, {
    defaultMs: optional ? 600 : 4_000,
    maxMs: optional ? 1_200 : 8_000
  });
  if (locator.xpath) {
    return await findHarmonyComponent(
      driver,
      () => driver.findComponentByXpath(locator.xpath!, timeoutMs),
      optional
    );
  }
  const mod = await loadHarmonyModule();
  const BY = mod.BY;
  if (locator.byExpression && mod.byExpression) {
    const expr = mod.byExpression(locator.byExpression);
    return await findHarmonyComponent(driver, () => driver.findComponent(expr, timeoutMs), optional);
  }
  if (locator.text) {
    const text = String(locator.text).trim();
    if (isSearchLabel(text)) {
      return null;
    }
    return await findHarmonyComponent(driver, () => driver.findComponent(BY.text(text), timeoutMs), optional);
  }
  if (locator.id) {
    return await findHarmonyComponent(driver, () => driver.findComponent(BY.id(locator.id!), timeoutMs), optional);
  }
  if (locator.key) {
    return await findHarmonyComponent(driver, () => driver.findComponent(BY.key(locator.key!), timeoutMs), optional);
  }
  if (locator.type) {
    return await findHarmonyComponent(driver, () => driver.findComponent(BY.type(locator.type!), timeoutMs), optional);
  }
  return null;
}

function shellQuote(text: string): string {
  if (!/[\s"'\\]/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function hasLocator(payload: HarmonyPayload): boolean {
  const loc = payload.locator ?? {};
  return Boolean(loc.text || loc.id || loc.key || loc.type || loc.xpath || loc.byExpression);
}

async function resolveElementCenter(element: unknown): Promise<{ x: number; y: number } | null> {
  const el = element as {
    getBounds?: () => Promise<Record<string, unknown>>;
  };
  if (typeof el.getBounds !== "function") return null;
  try {
    const b = await el.getBounds();
    const left = Number(b.left ?? b.x);
    const top = Number(b.top ?? b.y);
    const w = Number(b.width);
    const h = Number(b.height);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return {
      x: Math.round(left + (Number.isFinite(w) ? w / 2 : 0)),
      y: Math.round(top + (Number.isFinite(h) ? h / 2 : 0))
    };
  } catch {
    return null;
  }
}

function isSearchLabel(label: string): boolean {
  return /搜索|请输入|输入|search/i.test(label.trim());
}

/** 键盘唤起后焦点常在底部输入法，仅采纳屏幕上半区的 focused 节点 */
const KEYBOARD_FOCUS_MAX_Y_RATIO = 0.38;

async function resolveSearchInputPoint(
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<[number, number] | null> {
  const screen = await resolveDisplay(driver);
  const ctx = buildHarmonyRecipeContext(
    driver,
    payload,
    screen,
    parseUiHeuristicsFromPayload(payload)
  );
  const nodes = await ctx.dumpUi();
  const pick = findUiNode(nodes, {
    role: "searchInput",
    screen,
    platform: "harmony",
    heuristics: ctx.heuristics
  });
  return pick?.point ?? null;
}

/** 点击搜索框坐标后退格（焦点回到输入框而非输入法） */
async function clearSearchFieldViaUiDump(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<boolean> {
  const pt = await resolveSearchInputPoint(driver, payload);
  if (pt) {
    await driver.click(pt[0], pt[1]);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  for (let i = 0; i < 16; i++) {
    try {
      await driver.shell("uitest uiInput keyEvent 2055", 4000);
    } catch {
      /* ignore */
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return true;
}

async function isSearchLabelVisibleViaUiDump(
  driver: HarmonyDriverLike,
  payload: HarmonyPayload,
  label: string
): Promise<boolean> {
  const screen = await resolveDisplay(driver);
  const ctx = buildHarmonyRecipeContext(
    driver,
    payload,
    screen,
    parseUiHeuristicsFromPayload(payload)
  );
  const nodes = await ctx.dumpUi();
  const heuristics = ctx.heuristics;
  if (
    findUiNode(nodes, { role: "searchInput", screen, platform: "harmony", heuristics }) ||
    findUiNode(nodes, { role: "searchEntry", screen, platform: "harmony", heuristics })
  ) {
    return true;
  }
  return nodes.some(
    (n) => (n.text && n.text.includes(label)) || (n.desc && n.desc.includes(label))
  );
}

async function tryElementInputText(
  element: unknown,
  text: string,
  opts?: { skipClick?: boolean }
): Promise<boolean> {
  const el = element as {
    click?: () => Promise<void>;
    inputText?: (value: string, mode?: { paste?: boolean; addition?: boolean }) => Promise<void>;
  };
  if (typeof el.inputText !== "function") return false;
  return withSuppressedHypiumProbeLogs(async () => {
    try {
      if (!opts?.skipClick && typeof el.click === "function") {
        await el.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await el.inputText!(text, { paste: true });
      return true;
    } catch {
      return false;
    }
  });
}

async function typeAtPoint(
  driver: HarmonyDriverLike,
  x: number,
  y: number,
  text: string,
  opts?: { skipClick?: boolean }
): Promise<void> {
  if (!opts?.skipClick) {
    await driver.click(x, y);
    await new Promise((resolve) => setTimeout(resolve, 600));
  } else {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  // 键盘弹出后「当前焦点」多在输入法：优先按搜索 框坐标注入，勿用 uitest uiInput text（会打进键盘）
  if (await shellInputTextAt((cmd, timeout) => driver.shell(cmd, timeout), x, y, text)) return;

  const mod = await loadHarmonyModule();
  const BY = mod.BY;
  for (const typeName of ["TextInput", "TextField"]) {
    const el = await findHarmonyComponent(
      driver,
      () => driver.findComponent(BY.type(typeName), 1200),
      true
    );
    if (el && (await tryElementInputText(el, text, { skipClick: true }))) return;
  }
  try {
    await driver.inputText({ x, y }, text);
    return;
  } catch {
    // fall through
  }
  if (await pasteTextViaHostClipboard((cmd, timeout) => driver.shell(cmd, timeout), text)) return;
  try {
    await driver.shell(`uitest uiInput text ${shellQuote(text)}`, 8000);
    return;
  } catch {
    // fall through
  }
  await driver.shell(`uitest uiInput inputText ${x} ${y} ${shellQuote(text)}`, 8000);
}

/** 当前焦点 / 搜索输入：仅 uiDump 定位，不做全屏盲扫 */
async function typeViaUiDump(
  driver: HarmonyDriverLike,
  payload: HarmonyPayload,
  text: string,
  opts?: { inputOnly?: boolean }
): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const screen = await resolveDisplay(driver);
  const ctx = buildHarmonyRecipeContext(
    driver,
    payload,
    screen,
    parseUiHeuristicsFromPayload(payload)
  );
  const nodes = await ctx.dumpUi();
  const topMaxY = screen.height * KEYBOARD_FOCUS_MAX_Y_RATIO;
  const focusedInput = nodes
    .filter((n) => n.focused && n.point[1] < topMaxY)
    .sort((a, b) => (b.bounds?.w ?? 0) - (a.bounds?.w ?? 0))[0];
  if (focusedInput) {
    await typeAtPoint(driver, focusedInput.point[0], focusedInput.point[1], text, { skipClick: true });
    return true;
  }
  const pick =
    findUiNode(nodes, {
      role: "searchInput",
      screen,
      platform: "harmony",
      heuristics: ctx.heuristics
    }) ??
    (opts?.inputOnly
      ? null
      : findUiNode(nodes, {
          role: "searchEntry",
          screen,
          platform: "harmony",
          heuristics: ctx.heuristics
        }));
  if (!pick?.point) return false;
  await typeAtPoint(driver, pick.point[0], pick.point[1], text, {
    skipClick: pick.kind === "input"
  });
  return true;
}

/** 搜索页：uiDump 坐标 inputText → TextInput paste */
async function typeIntoHarmonyTextField(
  driver: HarmonyDriverLike,
  text: string,
  payload: HarmonyPayload
): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const pt = await resolveSearchInputPoint(driver, payload);
  if (pt && (await shellInputTextAt((cmd, t) => driver.shell(cmd, t), pt[0], pt[1], text))) return true;

  const mod = await loadHarmonyModule();
  const BY = mod.BY;
  for (const typeName of ["TextInput", "TextField"]) {
    const el = await findHarmonyComponent(
      driver,
      () => driver.findComponent(BY.type(typeName), 1200),
      true
    );
    if (el && (await tryElementInputText(el, text, { skipClick: true }))) return true;
  }
  if (pt) {
    await typeAtPoint(driver, pt[0], pt[1], text, { skipClick: true });
    return true;
  }
  return false;
}

async function clickViaUiDump(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<boolean> {
  const screen = await resolveDisplay(driver);
  const ctx = buildHarmonyRecipeContext(
    driver,
    payload,
    screen,
    parseUiHeuristicsFromPayload(payload)
  );
  const nodes = await ctx.dumpUi();
  const label = payload.locator?.text?.trim();
  const heuristics = ctx.heuristics;
  if (label && isSearchLabel(label)) {
    const input = findUiNode(nodes, {
      role: "searchInput",
      screen,
      platform: "harmony",
      heuristics
    });
    if (input?.point) {
      await driver.click(input.point[0], input.point[1]);
      return true;
    }
    const entry = findUiNode(nodes, {
      role: "searchEntry",
      screen,
      platform: "harmony",
      heuristics
    });
    if (entry?.point) {
      await driver.click(entry.point[0], entry.point[1]);
      return true;
    }
  }
  if (label) {
    const match = nodes.find(
      (n) => (n.text && n.text.includes(label)) || (n.desc && n.desc.includes(label))
    );
    if (match?.point) {
      await driver.click(match.point[0], match.point[1]);
      return true;
    }
  }
  return false;
}

async function clickWithPayload(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<void> {
  return withSuppressedHypiumProbeLogs(async () => {
    const point = asPoint2(payload.point);
    if (point) {
      const p = await normalizeAbsPoint(point, driver);
      await driver.click(p.x, p.y);
      return;
    }

    const label = payload.locator?.text?.trim();
    const optional = isOptionalUiPayload(payload as Record<string, unknown>);

    if (label && isSearchLabel(label) && (await clickViaUiDump(driver, payload))) {
      return;
    }

    const element = await resolveElement(driver, payload);

    if (element && typeof (element as { click?: () => Promise<void> }).click === "function") {
      try {
        await (element as { click: () => Promise<void> }).click();
        return;
      } catch {
        /* fall through */
      }
    }

    const center = element ? await resolveElementCenter(element) : null;
    if (center) {
      await driver.click(center.x, center.y);
      return;
    }

    if (label && isSearchLabel(label) && (await clickViaUiDump(driver, payload))) {
      return;
    }

    if (label) {
      throw new Error(
        optional ? `optional click: ${label} not clickable` : `click failed for locator text="${label}"`
      );
    }
    throw new Error("click requires payload.point or payload.locator");
  });
}

async function typeWithPayload(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<void> {
  if (payload.inputOp === "clear" || payload.harmonyInputOp === "clear") {
    await clearSearchFieldViaUiDump(driver, payload);
    return;
  }

  const text = String(payload.text ?? "");
  if (!text) {
    throw new Error("type requires payload.text");
  }
  const point = asPoint2(payload.point);
  if (point) {
    const p = await normalizeAbsPoint(point, driver);
    await typeAtPoint(driver, p.x, p.y, text);
    return;
  }
  if (!hasLocator(payload)) {
    if (await typeIntoHarmonyTextField(driver, text, payload)) return;
    if (await typeViaUiDump(driver, payload, text, { inputOnly: true })) return;
    throw new Error("type failed: no focused input field");
  }

  const label = payload.locator?.text?.trim();

  // 搜索类 locator：uiDump 坐标 inputText（键盘唤起时仍写入搜索框）
  if (label && isSearchLabel(label)) {
    if (await typeIntoHarmonyTextField(driver, text, payload)) return;
    if (await typeViaUiDump(driver, payload, text, { inputOnly: true })) return;
    throw new Error(`type failed for locator text="${label}"`);
  }

  const element = await resolveElement(driver, payload);

  if (element && (await tryElementInputText(element, text))) return;

  const center = element ? await resolveElementCenter(element) : null;
  if (center) {
    await typeAtPoint(driver, center.x, center.y, text);
    return;
  }

  if (await pasteTextViaHostClipboard((cmd, timeout) => driver.shell(cmd, timeout), text)) return;

  throw new Error(
    label ? `type failed for locator text="${label}"` : "type failed: could not locate input field"
  );
}

async function swipeWithPayload(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<void> {
  const from = asPoint2(payload.from);
  const to = asPoint2(payload.to);
  if (!from || !to) {
    throw new Error("swipe requires payload.from and payload.to");
  }
  const screen = await resolveDisplay(driver);
  const relative = (payload as Record<string, unknown>).relative === true;
  const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, {
    envDefaultMs: Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS),
    fallbackMs: 300
  });
  const px = harmonySwipePixels(
    screen,
    from as [number, number],
    to as [number, number],
    durationMs,
    { relative }
  );
  const swipeWork =
    typeof driver.fling === "function" && (payload.fling === true || process.env.ADA_HARMONY_SWIPE_FLING === "1")
      ? driver.fling(px.from[0], px.from[1], px.to[0], px.to[1], 1, px.durationMs)
      : driver.swipe(px.from[0], px.from[1], px.to[0], px.to[1], px.durationMs);
  await raceCommandTimeout(swipeWork, opTimeoutMs(payload, Math.max(5_000, px.durationMs + 3_000)), "harmony.swipe");
}

async function pinchWithPayload(
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<{ mode: import("./harmony-pinch.js").HarmonyPinchMode }> {
  const ends = readPinchEndsFromPayload(payload as Record<string, unknown>);
  if (!ends) {
    throw new Error("pinch requires finger1, finger2, finger1End, finger2End");
  }
  const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, {
    envDefaultMs: Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS),
    fallbackMs: 400
  });
  const mod = await loadHarmonyModule();
  const types = mod as HarmonyModuleLike & HypiumPinchTypes;
  return raceCommandTimeout(
    executeHarmonyPinch(driver, ends, durationMs, types),
    opTimeoutMs(payload, Math.max(8_000, durationMs + 5_000)),
    "harmony.pinch"
  );
}

async function screenshotWithPayload(command: CommandEnvelope, driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<string> {
  const filePath = payload.screenshotPath
    ? path.resolve(payload.screenshotPath)
    : path.join(process.cwd(), "artifacts", `${command.requestId}-harmony.png`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return await raceCommandTimeout(driver.screenCap(filePath), opTimeoutMs(payload, 25_000), "harmony.screenCap");
}

async function getTextFromPayload(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<string> {
  const element = await resolveElement(driver, payload);
  if (!element || typeof (element as { getText?: () => Promise<string> }).getText !== "function") {
    throw new Error("getText/assertText requires payload.locator");
  }
  return await (element as { getText: () => Promise<string> }).getText();
}

async function invokeWithPayload(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<unknown> {
  const invoke = normalizeInvokePayload(payload as unknown as Record<string, unknown>, "method") as InvokePayload | null;
  if (!invoke?.method) {
    throw new Error("invoke requires payload.method");
  }
  const target = invoke.target === "session" ? driver : (driver as unknown as Record<string, unknown>);
  const methodName = String(invoke.method ?? "");
  const fn = (target as Record<string, unknown>)[methodName];
  if (typeof fn !== "function") {
    throw new Error(`harmony invoke method not found: ${methodName}`);
  }
  const args = Array.isArray(invoke.args) ? invoke.args : [];
  const value = await (fn as (...p: unknown[]) => Promise<unknown>)(...args);
  return serializeRpcResult(value);
}

async function executeCustom(command: CommandEnvelope, driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<CommandResult> {
  const rawAction = String(payload.action ?? payload.custom?.action ?? payload.custom?.method ?? "");
  const action = normalizeMobileCustomAction(rawAction, payload.custom?.method);

  if (["dump_ui", "tap_search", "fill_search", "smart_wait"].includes(action)) {
    const screen = await resolveDisplay(driver);
    const ctx = buildHarmonyRecipeContext(driver, payload, screen, parseUiHeuristicsFromPayload(payload));
    const outcome = await runMobileCustomAction(action, ctx, {
      text: String(payload.text ?? payload.custom?.text ?? ""),
      maxBack: typeof payload.custom?.maxBack === "number" ? payload.custom.maxBack : 3,
      payload: payload as unknown as Record<string, unknown>
    });
    if (outcome.handled) {
      const ok = outcome.recipe?.ok !== false;
      return {
        requestId: command.requestId,
        success: ok,
        ...(ok
          ? {
              data: {
                driver: "harmony",
                mode: "real",
                command: "custom",
                action,
                value: outcome.value,
                recipe: outcome.recipe
              }
            }
          : {
              errorCode:
                outcome.errorCode ??
                outcome.recipe?.errorCode ??
                platformRecipeErrorCode("harmony", action as "tap_search"),
              errorMessage: outcome.recipe?.detail ?? "recipe failed"
            })
      };
    }
  }

  if (action === "listapps") {
    if (typeof driver.getInstalledApps !== "function") {
      return failResult(command, "HARMONY_CUSTOM_LIST_APPS_UNSUPPORTED", "hypium-driver does not expose getInstalledApps()");
    }
    const value = await driver.getInstalledApps("");
    return {
      requestId: command.requestId,
      success: true,
      data: { driver: "harmony", mode: "real", command: "custom", action, value, source: "driver.getInstalledApps" }
    };
  }
  if (action === "shell") {
    const cmd = String(payload.custom?.command ?? "");
    if (!cmd) return failResult(command, "HARMONY_CUSTOM_SHELL_MISSING_COMMAND", "custom shell requires payload.custom.command");
    const value = await raceCommandTimeout(
      driver.shell(cmd, numberOr(payload.custom?.timeoutMs, 12_000)),
      opTimeoutMs(payload, 12_000),
      "harmony.shell"
    );
    return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", action, value } };
  }
  if (action === "hdc") {
    const cmd = String(payload.custom?.command ?? "");
    if (!cmd) return failResult(command, "HARMONY_CUSTOM_HDC_MISSING_COMMAND", "custom hdc requires payload.custom.command");
    const value = await raceCommandTimeout(
      driver.hdc(cmd, numberOr(payload.custom?.timeoutMs, 12_000)),
      opTimeoutMs(payload, 12_000),
      "harmony.hdc"
    );
    return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", action, value } };
  }
  return failResult(command, "HARMONY_CUSTOM_UNSUPPORTED", `Unsupported custom action: ${action || "empty"}`);
}

const harmonyPlugin: DriverPlugin = {
  manifest: {
    id: "driver-harmony",
    version: "0.1.0",
    engine: "harmony",
    platforms: ["harmony"],
    capabilities: [
      "tap",
      "click",
      "type",
      "swipe",
      "pinch",
      "deviceAdmin",
      "assertVisible",
      "screenshot",
      "wait",
      "getText",
      "assertText",
      "back",
      "pressHome",
      "home",
      "launchApp",
      "exitApp",
      "recipe",
      "custom",
      "invoke"
    ],
    semanticCommands: [
      "tap",
      "click",
      "type",
      "swipe",
      "pinch",
      "deviceAdmin",
      "assertVisible",
      "screenshot",
      "wait",
      "getText",
      "assertText",
      "back",
      "pressHome",
      "home",
      "launchApp",
      "exitApp",
      "recipe",
      "custom"
    ],
    invoke: {
      modes: ["method"],
      targets: ["session"]
    }
  },

  async init() {
    await loadHarmonyModule();
  },

  async createSession(platform): Promise<DriverSession> {
    return { id: `harmony-${Date.now()}`, platform };
  },

  async execute(session: DriverSession, command: CommandEnvelope): Promise<CommandResult> {
    const payload = (command.payload ?? {}) as HarmonyPayload;

    if (payload.probe === true) {
      try {
        const driver = await getOrCreateDriver(session, payload);
        const size = await resolveDisplay(driver);
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "harmony", platform: "harmony", probe: "ok", display: size }
        };
      } catch (error) {
        return failResult(command, "HARMONY_PROBE_FAILED", error instanceof Error ? error.message : String(error));
      }
    }

    if (command.command === "invoke") {
      const invoke = normalizeInvokePayload(payload as unknown as Record<string, unknown>, "method") as InvokePayload | null;
      if (!invoke?.method) {
        return failResult(command, "INVOKE_INVALID_PAYLOAD", "invoke requires payload.method");
      }
    }

    if (!ensureReal(payload)) {
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "harmony", platform: "harmony", command: command.command, mode: "mock", message: "Mock harmony command executed" }
      };
    }

    try {
      const driver = await getOrCreateDriver(session, payload);

      if (command.command === "click") {
        if (isOptionalUiPayload(payload as Record<string, unknown>)) {
          return withSuppressedHypiumProbeLogs(async () => {
            try {
              const point = asPoint2(payload.point);
              if (!point) {
                const element = await resolveElement(driver, payload);
                if (!element) {
                  const label = payload.locator?.text ?? payload.locator?.id ?? "locator";
                  return buildOptionalUiMissResult(command, `optional click: ${label} not found`, {
                    driver: "harmony",
                    mode: "real",
                    locator: payload.locator
                  });
                }
              }
              await clickWithPayload(driver, payload);
            } catch (error) {
              const label =
                payload.locator?.text ?? payload.locator?.id ?? payload.point ?? "locator";
              return buildOptionalUiMissResult(
                command,
                `optional click: ${label} failed: ${error instanceof Error ? error.message : String(error)}`,
                {
                  driver: "harmony",
                  mode: "real",
                  locator: payload.locator,
                  point: payload.point
                }
              );
            }
            return {
              requestId: command.requestId,
              success: true,
              data: { driver: "harmony", mode: "real", command: "click" }
            };
          });
        }
        try {
          await clickWithPayload(driver, payload);
        } catch (error) {
          return failResult(
            command,
            "HARMONY_CLICK_FAILED",
            error instanceof Error ? error.message : String(error)
          );
        }
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "click" } };
      }
      if (command.command === "type") {
        try {
          await typeWithPayload(driver, payload);
        } catch (error) {
          return failResult(
            command,
            "HARMONY_TYPE_FAILED",
            error instanceof Error ? error.message : String(error)
          );
        }
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "type" } };
      }
      if (command.command === "swipe") {
        await swipeWithPayload(driver, payload);
        const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, {
          envDefaultMs: Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS),
          fallbackMs: 300
        });
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "harmony", mode: "real", command: "swipe", durationMs, from: payload.from, to: payload.to }
        };
      }
      if (command.command === "deviceAdmin") {
        return executeHarmonyDeviceAdmin(command, driver, payload as Record<string, unknown>);
      }
      if (command.command === "pinch") {
        const { mode: pinchMode } = await pinchWithPayload(driver, payload);
        const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, {
          envDefaultMs: Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS),
          fallbackMs: 400
        });
        return {
          requestId: command.requestId,
          success: true,
          data: {
            driver: "harmony",
            mode: "real",
            command: "pinch",
            durationMs,
            pinchIn: payload.pinchIn,
            pinchMode
          }
        };
      }
      if (command.command === "screenshot") {
        const screenshot = await screenshotWithPayload(command, driver, payload);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "screenshot", screenshot } };
      }
      if (command.command === "wait") {
        const timeoutMs = numberOr(payload.timeoutMs, 300);
        await new Promise((resolve) => setTimeout(resolve, timeoutMs));
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "wait", timeoutMs } };
      }
      if (command.command === "back") {
        await driver.pressBack();
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "back" } };
      }
      if (command.command === "pressHome" || command.command === "home") {
        await driver.pressHome();
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "harmony", mode: "real", command: "pressHome" }
        };
      }
      if (command.command === "launchApp") {
        const bundleName = String(payload.appId ?? payload.bundleId ?? "");
        if (!bundleName) {
          return failResult(command, "HARMONY_LAUNCH_APP_MISSING_BUNDLE", "launchApp requires payload.appId or payload.bundleId");
        }
        const abilityId = String(payload.abilityId ?? payload.ability ?? "").trim() || "EntryAbility";
        await raceCommandTimeout(
          driver.startApp(bundleName, abilityId),
          opTimeoutMs(payload, 60_000),
          "harmony.startApp"
        );
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "harmony", mode: "real", command: "launchApp", bundleName, abilityId }
        };
      }
      if (command.command === "exitApp") {
        const bundleName = String(payload.appId ?? payload.bundleId ?? "");
        if (!bundleName) {
          return failResult(command, "HARMONY_EXIT_APP_MISSING_BUNDLE", "exitApp requires payload.appId or payload.bundleId");
        }
        await raceCommandTimeout(driver.stopApp(bundleName), opTimeoutMs(payload, 20_000), "harmony.stopApp");
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "exitApp", bundleName } };
      }
      if (command.command === "getText") {
        const text = await getTextFromPayload(driver, payload);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "getText", text } };
      }
      if (command.command === "assertText") {
        const text = await getTextFromPayload(driver, payload);
        const expected = String(payload.expectedText ?? payload.text ?? "");
        if (!expected) {
          return failResult(command, "HARMONY_ASSERT_TEXT_MISSING_EXPECTED", "assertText requires payload.expectedText or payload.text");
        }
        if (!text.includes(expected)) {
          return failResult(command, "HARMONY_ASSERT_TEXT_FAILED", `Expected text "${expected}" not found in "${text}"`);
        }
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "assertText", text, expected } };
      }
      if (command.command === "assertVisible") {
        const label = payload.locator?.text?.trim();
        if (label && isSearchLabel(label)) {
          const visible = await isSearchLabelVisibleViaUiDump(driver, payload, label);
          if (!visible) {
            return failResult(command, "HARMONY_ASSERT_VISIBLE_FAILED", `Element not found: text="${label}"`);
          }
          return {
            requestId: command.requestId,
            success: true,
            data: { driver: "harmony", mode: "real", command: "assertVisible", via: "uiDump" }
          };
        }
        const element = await withSuppressedHypiumProbeLogs(() => resolveElement(driver, payload));
        if (!element) {
          return failResult(command, "HARMONY_ASSERT_VISIBLE_FAILED", "Element not found");
        }
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "assertVisible" } };
      }
      if (command.command === "custom") {
        return await executeCustom(command, driver, payload);
      }
      if (command.command === "invoke") {
        const value = await invokeWithPayload(driver, payload);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "invoke", value } };
      }

      return failResult(command, "HARMONY_REAL_UNSUPPORTED_COMMAND", `Real mode does not support command: ${command.command}`);
    } catch (error) {
      return failResult(command, "HARMONY_EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
    }
  },

  async destroySession(session: DriverSession) {
    const state = sessions.get(session.id);
    if (!state) return;
    sessions.delete(session.id);
    await Promise.race([
      state.driver.disconnect(),
      new Promise<void>((resolve) => setTimeout(resolve, 8_000))
    ]).catch(() => undefined);
  },

  async dispose() {
    const all = Array.from(sessions.values());
    sessions.clear();
    await Promise.allSettled(
      all.map((item) =>
        Promise.race([
          item.driver.disconnect(),
          new Promise<void>((resolve) => setTimeout(resolve, 8_000))
        ]).catch(() => undefined)
      )
    );
  },

  forceDispose() {
    const all = Array.from(sessions.values());
    sessions.clear();
    for (const item of all) {
      void item.driver.disconnect().catch(() => undefined);
    }
  }
};

export default harmonyPlugin;
