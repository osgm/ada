"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../plugins/driver-harmony/src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);

// ../../packages/driver-rpc/src/index.ts
var PLAYWRIGHT_OBJECT_TYPES = /* @__PURE__ */ new Set([
  "Page",
  "Frame",
  "Locator",
  "BrowserContext",
  "Browser",
  "Response",
  "CDPSession",
  "ElementHandle",
  "JSHandle",
  "Worker",
  "Request",
  "Route",
  "WebSocket"
]);
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function getString(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function normalizeInvokePayload(raw, defaultMode) {
  const payload = asRecord(raw);
  const legacyCustom = asRecord(payload.custom);
  const httpBlock = asRecord(payload.http);
  const httpMethod = getString(httpBlock.method) ?? getString(legacyCustom.method);
  const httpPath = getString(httpBlock.path) ?? getString(legacyCustom.path);
  const hasHttp = Boolean(httpMethod && httpPath);
  const method = getString(payload.method);
  const target = getString(payload.target);
  const hasMethod = Boolean(method);
  let mode = getString(payload.mode);
  if (mode !== "method" && mode !== "http") {
    mode = hasHttp ? "http" : hasMethod ? "method" : defaultMode;
  }
  if (mode === "http" && !hasHttp && hasMethod) {
    mode = "method";
  }
  if (mode === "method" && !hasMethod && hasHttp) {
    mode = "http";
  }
  if (mode === "http") {
    if (!httpMethod || !httpPath) {
      return null;
    }
    return {
      mode: "http",
      http: {
        method: httpMethod,
        path: httpPath,
        body: httpBlock.body ?? legacyCustom.body
      },
      options: asRecord(payload.options)
    };
  }
  if (!method) {
    return null;
  }
  return {
    mode: "method",
    target: target ?? "page",
    method,
    args: Array.isArray(payload.args) ? payload.args : [],
    locator: asRecord(payload.locator),
    options: asRecord(payload.options)
  };
}
function serializeRpcResult(value, depth = 0) {
  if (depth > 10) {
    return "[MaxDepth]";
  }
  if (value === void 0) {
    return { __undefined: true };
  }
  if (value === null || typeof value !== "function") {
    if (value === null || typeof value !== "object") {
      return value;
    }
  } else {
    return { __type: "Function", hint: "Functions are not serializable over invoke RPC" };
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return { __type: "Buffer", encoding: "base64", data: value.toString("base64") };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeRpcResult(item, depth + 1));
  }
  const ctor = value.constructor?.name;
  if (ctor && PLAYWRIGHT_OBJECT_TYPES.has(ctor)) {
    return { __type: ctor, hint: "Live Playwright object; chain further invoke calls on page/context" };
  }
  if (value instanceof Map) {
    const out = {};
    for (const [k, v] of value.entries()) {
      out[String(k)] = serializeRpcResult(v, depth + 1);
    }
    return out;
  }
  try {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function") {
        continue;
      }
      out[k] = serializeRpcResult(v, depth + 1);
    }
    return out;
  } catch {
    return String(value);
  }
}

// ../../plugins/driver-harmony/src/index.ts
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_module = require("node:module");
var sessions = /* @__PURE__ */ new Map();
var harmonyModulePromise = null;
var localRequire = (0, import_node_module.createRequire)(typeof __filename === "string" ? __filename : process.cwd());
function failResult(command, code, message) {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}
function ensureReal(payload) {
  if (payload.mock === true) {
    return false;
  }
  if (payload.real === false) {
    return false;
  }
  return true;
}
function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function asPoint2(value) {
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
async function loadHarmonyModule() {
  if (!harmonyModulePromise) {
    harmonyModulePromise = (async () => {
      try {
        return localRequire("hypium-driver");
      } catch {
        return await new Function('return import("hypium-driver")')();
      }
    })();
  }
  return harmonyModulePromise;
}
function resolveConnectOpts(payload) {
  const caps = payload.capabilities ?? {};
  const deviceSn = String(caps.deviceSn ?? caps["appium:udid"] ?? caps.udid ?? process.env.ADA_HARMONY_DEVICE_SN ?? "").trim() || void 0;
  const hdcHost = String(caps.hdcHost ?? process.env.ADA_HARMONY_HDC_HOST ?? "").trim() || void 0;
  const hdcPortRaw = caps.hdcPort ?? process.env.ADA_HARMONY_HDC_PORT;
  const hdcPort = typeof hdcPortRaw === "number" ? hdcPortRaw : Number(hdcPortRaw);
  return {
    deviceSn,
    udid: deviceSn,
    hdcHost,
    hdcPort: Number.isFinite(hdcPort) && hdcPort > 0 ? hdcPort : void 0
  };
}
function buildSignature(payload) {
  return JSON.stringify(resolveConnectOpts(payload));
}
async function getOrCreateDriver(session, payload) {
  const signature = buildSignature(payload);
  const existed = sessions.get(session.id);
  if (existed && existed.signature === signature) {
    return existed.driver;
  }
  if (existed) {
    await existed.driver.disconnect().catch(() => void 0);
  }
  const mod = await loadHarmonyModule();
  const driver = await mod.UiDriver.connect(resolveConnectOpts(payload));
  sessions.set(session.id, { driver, signature, connectedAt: Date.now() });
  return driver;
}
async function resolveDisplay(driver) {
  try {
    const size = await driver.getDisplaySize();
    const width = numberOr(size.width ?? size.x, 0);
    const height = numberOr(size.height ?? size.y, 0);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  } catch {
  }
  return { width: 1080, height: 1920 };
}
async function normalizeAbsPoint(point, driver) {
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
async function resolveElement(driver, payload) {
  const locator = payload.locator ?? {};
  const timeoutMs = numberOr(payload.timeoutMs, 15e3);
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
async function clickWithPayload(driver, payload) {
  const point = asPoint2(payload.point);
  if (point) {
    const p = await normalizeAbsPoint(point, driver);
    await driver.click(p.x, p.y);
    return;
  }
  const element = await resolveElement(driver, payload);
  if (element && typeof element.click === "function") {
    await element.click();
    return;
  }
  throw new Error("click requires payload.point or payload.locator");
}
async function typeWithPayload(driver, payload) {
  const text = String(payload.text ?? "");
  if (!text) {
    throw new Error("type requires payload.text");
  }
  const element = await resolveElement(driver, payload);
  if (element && typeof element.inputText === "function") {
    await element.inputText(text);
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
async function swipeWithPayload(driver, payload) {
  const from = asPoint2(payload.from);
  const to = asPoint2(payload.to);
  if (!from || !to) {
    throw new Error("swipe requires payload.from and payload.to");
  }
  const p1 = await normalizeAbsPoint(from, driver);
  const p2 = await normalizeAbsPoint(to, driver);
  await driver.swipe(p1.x, p1.y, p2.x, p2.y, numberOr(payload.speed, 6e3));
}
async function screenshotWithPayload(command, driver, payload) {
  const filePath = payload.screenshotPath ? import_node_path.default.resolve(payload.screenshotPath) : import_node_path.default.join(process.cwd(), "artifacts", `${command.requestId}-harmony.png`);
  await import_promises.default.mkdir(import_node_path.default.dirname(filePath), { recursive: true });
  return await driver.screenCap(filePath);
}
async function getTextFromPayload(driver, payload) {
  const element = await resolveElement(driver, payload);
  if (!element || typeof element.getText !== "function") {
    throw new Error("getText/assertText requires payload.locator");
  }
  return await element.getText();
}
async function invokeWithPayload(driver, payload) {
  const invoke = normalizeInvokePayload(payload, "method");
  if (!invoke?.method) {
    throw new Error("invoke requires payload.method");
  }
  const target = invoke.target === "session" ? driver : driver;
  const methodName = String(invoke.method ?? "");
  const fn = target[methodName];
  if (typeof fn !== "function") {
    throw new Error(`harmony invoke method not found: ${methodName}`);
  }
  const args = Array.isArray(invoke.args) ? invoke.args : [];
  const value = await fn(...args);
  return serializeRpcResult(value);
}
async function executeCustom(command, driver, payload) {
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
    const value = await driver.shell(cmd, numberOr(payload.custom?.timeoutMs, 3e4));
    return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", action, value } };
  }
  if (action === "hdc") {
    const cmd = String(payload.custom?.command ?? "");
    if (!cmd) return failResult(command, "HARMONY_CUSTOM_HDC_MISSING_COMMAND", "custom hdc requires payload.custom.command");
    const value = await driver.hdc(cmd, numberOr(payload.custom?.timeoutMs, 3e4));
    return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", action, value } };
  }
  return failResult(command, "HARMONY_CUSTOM_UNSUPPORTED", `Unsupported custom action: ${action || "empty"}`);
}
var harmonyPlugin = {
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
  async createSession(platform) {
    return { id: `harmony-${Date.now()}`, platform };
  },
  async execute(session, command) {
    const payload = command.payload ?? {};
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
    await Promise.allSettled(all.map((item) => item.driver.disconnect().catch(() => void 0)));
  }
};
var index_default = harmonyPlugin;
