import type { CommandEnvelope, CommandResult, InvokePayload } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import { normalizeInvokePayload, serializeRpcResult } from "@ada/driver-rpc";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

type HarmonyDriverLike = {
  disconnect(): Promise<void>;
  getDisplaySize(): Promise<{ x?: number; y?: number; width?: number; height?: number }>;
  click(x: number, y: number): Promise<void>;
  swipe(startX: number, startY: number, endX: number, endY: number, speed?: number): Promise<void>;
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
  text?: string;
  timeoutMs?: number;
  screenshotPath?: string;
  expectedText?: string;
  appId?: string;
  bundleId?: string;
  abilityId?: string;
  probe?: boolean;
  custom?: {
    action?: string;
    method?: string;
    path?: string;
    body?: Record<string, unknown>;
    command?: string;
    timeoutMs?: number;
  };
  locator?: {
    text?: string;
    id?: string;
    key?: string;
    type?: string;
    xpath?: string;
    byExpression?: string;
  };
  capabilities?: {
    "appium:udid"?: string;
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
    String(caps.deviceSn ?? caps["appium:udid"] ?? caps.udid ?? process.env.ADA_HARMONY_DEVICE_SN ?? "").trim() || undefined;
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
  const driver = await mod.UiDriver.connect(resolveConnectOpts(payload));
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

async function resolveElement(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<unknown> {
  const locator = payload.locator ?? {};
  const timeoutMs = numberOr(payload.timeoutMs, 15_000);
  if (locator.xpath) {
    return await driver.findComponentByXpath(locator.xpath, timeoutMs);
  }
  const mod = await loadHarmonyModule();
  const BY = mod.BY;
  if (locator.byExpression && mod.byExpression) {
    const expr = mod.byExpression(locator.byExpression);
    return driver.findComponent(expr, timeoutMs);
  }
  if (locator.text) {
    return driver.findComponent(BY.text(locator.text), timeoutMs);
  }
  if (locator.id) {
    return driver.findComponent(BY.id(locator.id), timeoutMs);
  }
  if (locator.key) {
    return driver.findComponent(BY.key(locator.key), timeoutMs);
  }
  if (locator.type) {
    return driver.findComponent(BY.type(locator.type), timeoutMs);
  }
  return null;
}

async function clickWithPayload(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<void> {
  const point = asPoint2(payload.point);
  if (point) {
    const p = await normalizeAbsPoint(point, driver);
    await driver.click(p.x, p.y);
    return;
  }
  const element = await resolveElement(driver, payload);
  if (element && typeof (element as { click?: () => Promise<void> }).click === "function") {
    await (element as { click: () => Promise<void> }).click();
    return;
  }
  throw new Error("click requires payload.point or payload.locator");
}

async function typeWithPayload(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<void> {
  const text = String(payload.text ?? "");
  if (!text) {
    throw new Error("type requires payload.text");
  }
  const element = await resolveElement(driver, payload);
  if (element && typeof (element as { inputText?: (text: string) => Promise<void> }).inputText === "function") {
    await (element as { inputText: (value: string) => Promise<void> }).inputText(text);
    return;
  }
  const point = asPoint2(payload.point);
  if (point) {
    const p = await normalizeAbsPoint(point, driver);
    await driver.inputText({ x: p.x, y: p.y }, text);
    return;
  }
  throw new Error("type requires payload.locator or payload.point");
}

async function swipeWithPayload(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<void> {
  const from = asPoint2(payload.from);
  const to = asPoint2(payload.to);
  if (!from || !to) {
    throw new Error("swipe requires payload.from and payload.to");
  }
  const p1 = await normalizeAbsPoint(from, driver);
  const p2 = await normalizeAbsPoint(to, driver);
  await driver.swipe(p1.x, p1.y, p2.x, p2.y, numberOr(payload.speed, 6000));
}

async function screenshotWithPayload(command: CommandEnvelope, driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<string> {
  const filePath = payload.screenshotPath
    ? path.resolve(payload.screenshotPath)
    : path.join(process.cwd(), "artifacts", `${command.requestId}-harmony.png`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return await driver.screenCap(filePath);
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
  const action = String(payload.action ?? payload.custom?.action ?? "").toLowerCase();
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
    const value = await driver.shell(cmd, numberOr(payload.custom?.timeoutMs, 30_000));
    return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", action, value } };
  }
  if (action === "hdc") {
    const cmd = String(payload.custom?.command ?? "");
    if (!cmd) return failResult(command, "HARMONY_CUSTOM_HDC_MISSING_COMMAND", "custom hdc requires payload.custom.command");
    const value = await driver.hdc(cmd, numberOr(payload.custom?.timeoutMs, 30_000));
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
      "assertVisible",
      "screenshot",
      "wait",
      "getText",
      "assertText",
      "back",
      "home",
      "launchApp",
      "terminateApp",
      "custom",
      "invoke"
    ],
    semanticCommands: [
      "tap",
      "click",
      "type",
      "swipe",
      "assertVisible",
      "screenshot",
      "wait",
      "getText",
      "assertText",
      "back",
      "home",
      "launchApp",
      "terminateApp",
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
        await clickWithPayload(driver, payload);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "click" } };
      }
      if (command.command === "type") {
        await typeWithPayload(driver, payload);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "type" } };
      }
      if (command.command === "swipe") {
        await swipeWithPayload(driver, payload);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "swipe" } };
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
      if (command.command === "home") {
        await driver.pressHome();
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "home" } };
      }
      if (command.command === "launchApp") {
        const bundleName = String(payload.appId ?? payload.bundleId ?? "");
        if (!bundleName) {
          return failResult(command, "HARMONY_LAUNCH_APP_MISSING_BUNDLE", "launchApp requires payload.appId or payload.bundleId");
        }
        await driver.startApp(bundleName, payload.abilityId);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "launchApp", bundleName } };
      }
      if (command.command === "terminateApp") {
        const bundleName = String(payload.appId ?? payload.bundleId ?? "");
        if (!bundleName) {
          return failResult(command, "HARMONY_TERMINATE_APP_MISSING_BUNDLE", "terminateApp requires payload.appId or payload.bundleId");
        }
        await driver.stopApp(bundleName);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "terminateApp", bundleName } };
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
        const element = await resolveElement(driver, payload);
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

  async dispose() {
    const all = Array.from(sessions.values());
    sessions.clear();
    await Promise.allSettled(all.map((item) => item.driver.disconnect().catch(() => undefined)));
  }
};

export default harmonyPlugin;
