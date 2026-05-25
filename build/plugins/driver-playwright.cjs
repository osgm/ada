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

// plugins/driver-playwright/src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);

// packages/driver-rpc/src/index.ts
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
function pickPayloadString(payload, options, key, aliases = [], envKey) {
  const keys = [key, ...aliases];
  for (const k of keys) {
    const top = getString(payload[k]);
    if (top) {
      return top;
    }
    const nested = getString(options[k]);
    if (nested) {
      return nested;
    }
  }
  if (envKey && typeof process.env[envKey] === "string" && process.env[envKey].length > 0) {
    return process.env[envKey];
  }
  return "";
}
function resolveLocalBrowserFields(payload) {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  return {
    cdpEndpoint: pickPayloadString(p, options, "cdpEndpoint", ["browserURL", "cdpUrl"], "ADA_PLAYWRIGHT_CDP_ENDPOINT"),
    executablePath: pickPayloadString(
      p,
      options,
      "executablePath",
      ["browserPath", "browserExecutable"],
      "ADA_PLAYWRIGHT_EXECUTABLE_PATH"
    ),
    channel: pickPayloadString(p, options, "channel", [], "ADA_PLAYWRIGHT_CHANNEL"),
    userDataDir: pickPayloadString(p, options, "userDataDir", [], "ADA_PLAYWRIGHT_USER_DATA_DIR")
  };
}
function buildSessionKey(payload) {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const local = resolveLocalBrowserFields(p);
  const browser = getString(p.browser) ?? getString(options.browser) ?? "chromium";
  const headless = typeof p.headless === "boolean" ? p.headless : typeof options.headless === "boolean" ? options.headless : "env";
  const storageStatePath = getString(p.storageStatePath) ?? getString(options.storageStatePath) ?? "";
  const storageState = p.storageState ?? options.storageState;
  const storageKey = storageStatePath || (storageState !== void 0 ? JSON.stringify(storageState) : "");
  return `${browser}|${headless}|${local.cdpEndpoint}|${local.executablePath}|${local.channel}|${local.userDataDir}|${storageKey}`;
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
function mergeOptionsIntoPayload(payload) {
  const p = { ...asRecord(payload) };
  const options = asRecord(p.options);
  for (const key of [
    "browser",
    "headless",
    "userDataDir",
    "storageStatePath",
    "storageState",
    "launchOptions",
    "contextOptions",
    "cdpEndpoint",
    "browserURL",
    "cdpUrl",
    "executablePath",
    "browserPath",
    "browserExecutable",
    "channel",
    "engine",
    "browserName",
    "browserBinary",
    "profile",
    "seleniumServerUrl"
  ]) {
    if (p[key] === void 0 && options[key] !== void 0) {
      p[key] = options[key];
    }
  }
  return p;
}

// plugins/driver-playwright/src/index.ts
var import_node_module = require("node:module");
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var sessions = /* @__PURE__ */ new Map();
var localRequire = (0, import_node_module.createRequire)(typeof __filename === "string" ? __filename : process.cwd());
var SEMANTIC_COMMANDS = [
  "click",
  "type",
  "assertVisible",
  "screenshot",
  "navigate",
  "hover",
  "press",
  "select",
  "scroll",
  "forward",
  "newTab",
  "switchTab",
  "uploadFile",
  "dragDrop",
  "wait",
  "assertText",
  "getText",
  "back",
  "reload",
  "closeTab",
  "custom"
];
async function loadPlaywrightModule() {
  const cwd = process.cwd();
  const candidates = [
    import_node_path.default.join(cwd, "..", "package.json"),
    import_node_path.default.join(cwd, "package.json"),
    typeof __filename === "string" ? __filename : void 0
  ].filter((x) => Boolean(x));
  for (const base of candidates) {
    try {
      const req = (0, import_node_module.createRequire)(base);
      return req("playwright");
    } catch {
    }
  }
  try {
    return localRequire("playwright");
  } catch {
  }
  return await new Function('return import("playwright")')();
}
function asRecord2(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function locatorFromPayload(page, payload) {
  const locatorObj = asRecord2(payload?.locator);
  if (Object.keys(locatorObj).length === 0) {
    return void 0;
  }
  const testId = getString(locatorObj.testId);
  if (testId) {
    return page.getByTestId(testId);
  }
  const text = getString(locatorObj.text);
  if (text) {
    return page.getByText(text);
  }
  const role = getString(locatorObj.role);
  if (role) {
    return page.getByRole(role);
  }
  const css = getString(locatorObj.css);
  if (css) {
    return page.locator(css);
  }
  const xpath = getString(locatorObj.xpath);
  if (xpath) {
    return page.locator(xpath);
  }
  return void 0;
}
function parseHeadless(payload) {
  const merged = mergeOptionsIntoPayload(payload);
  if (typeof merged.headless === "boolean") {
    return merged.headless;
  }
  return process.env.ADA_PLAYWRIGHT_HEADLESS !== "false";
}
function parseBrowserKind(payload) {
  const merged = mergeOptionsIntoPayload(payload);
  const raw = (getString(merged.browser) ?? process.env.ADA_PLAYWRIGHT_BROWSER ?? "chromium").toLowerCase();
  if (raw === "firefox" || raw === "webkit") {
    return raw;
  }
  return "chromium";
}
async function resolveStorageState(payload) {
  const merged = mergeOptionsIntoPayload(payload);
  const pathStr = getString(merged.storageStatePath);
  if (pathStr) {
    const raw = await import_promises.default.readFile(pathStr, "utf8");
    return JSON.parse(raw);
  }
  if (merged.storageState !== void 0) {
    return merged.storageState;
  }
  return void 0;
}
async function closePlaywrightSession(pw) {
  if (pw.connectedOverCdp) {
    await pw.browser?.close().catch(() => void 0);
    return;
  }
  await pw.context.close().catch(() => void 0);
  if (!pw.persistent && pw.browser) {
    await pw.browser.close().catch(() => void 0);
  }
}
function applyLocalLaunchOverrides(baseLaunch, local, browserKind) {
  if (local.executablePath) {
    baseLaunch.executablePath = local.executablePath;
  }
  if (local.channel && browserKind === "chromium") {
    baseLaunch.channel = local.channel;
  }
}
async function createPlaywrightSession(playwrightModule, payload) {
  const merged = mergeOptionsIntoPayload(payload);
  const local = resolveLocalBrowserFields(merged);
  const browserKind = parseBrowserKind(merged);
  const headless = parseHeadless(merged);
  const launchOptions = asRecord2(merged.launchOptions);
  const contextOptions = { ...asRecord2(merged.contextOptions) };
  const storageState = await resolveStorageState(merged);
  if (storageState !== void 0) {
    contextOptions.storageState = storageState;
  }
  const sessionKey = buildSessionKey(merged);
  const localBrowser = {
    cdpEndpoint: local.cdpEndpoint || void 0,
    executablePath: local.executablePath || void 0,
    channel: local.channel || void 0,
    userDataDir: local.userDataDir || void 0
  };
  if (local.cdpEndpoint) {
    const chromium = playwrightModule.chromium;
    if (!chromium?.connectOverCDP) {
      throw new Error("connectOverCDP requires playwright chromium (set browser=chromium or use Chrome CDP URL)");
    }
    const connectOptions = asRecord2(merged.connectOptions);
    const browser2 = await chromium.connectOverCDP(local.cdpEndpoint, connectOptions);
    const contexts = browser2.contexts();
    const context2 = contexts[0] ?? await browser2.newContext(contextOptions);
    const pages = context2.pages();
    const page2 = pages[0] ?? await context2.newPage();
    return {
      browser: browser2,
      context: context2,
      page: page2,
      headless,
      browserKind: "chromium",
      persistent: false,
      connectedOverCdp: true,
      sessionKey,
      playwrightModule,
      localBrowser: { ...localBrowser, cdpEndpoint: local.cdpEndpoint }
    };
  }
  const userDataDir = local.userDataDir;
  const launcher = playwrightModule[browserKind];
  const baseLaunch = { headless, ...launchOptions };
  applyLocalLaunchOverrides(baseLaunch, local, browserKind);
  if (userDataDir) {
    if (!launcher?.launchPersistentContext) {
      throw new Error(`launchPersistentContext not available for ${browserKind}`);
    }
    const context2 = await launcher.launchPersistentContext(userDataDir, {
      ...baseLaunch,
      ...contextOptions
    });
    const pages = context2.pages();
    const page2 = pages[0] ?? await context2.newPage();
    return {
      browser: typeof context2.browser === "function" ? context2.browser() : null,
      context: context2,
      page: page2,
      headless,
      browserKind,
      persistent: true,
      connectedOverCdp: false,
      sessionKey,
      playwrightModule,
      localBrowser
    };
  }
  if (!launcher?.launch) {
    throw new Error(`playwright browser not available: ${browserKind}`);
  }
  const browser = await launcher.launch(baseLaunch);
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    headless,
    browserKind,
    persistent: false,
    connectedOverCdp: false,
    sessionKey,
    playwrightModule,
    localBrowser
  };
}
async function ensurePlaywrightSession(session, payload) {
  const merged = mergeOptionsIntoPayload(payload);
  const sessionKey = buildSessionKey(merged);
  const existed = sessions.get(session.id);
  if (existed && existed.sessionKey === sessionKey) {
    return existed;
  }
  if (existed) {
    await closePlaywrightSession(existed);
    sessions.delete(session.id);
  }
  const playwrightModule = await loadPlaywrightModule();
  const pwSession = await createPlaywrightSession(playwrightModule, merged);
  sessions.set(session.id, pwSession);
  return pwSession;
}
function resolvePlaywrightTarget(pw, invoke) {
  const target = (invoke.target ?? "page").toLowerCase();
  if (target === "page") {
    return pw.page;
  }
  if (target === "context") {
    return pw.context;
  }
  if (target === "browser") {
    if (!pw.browser) {
      throw new Error("browser handle not available (persistent context may expose null browser)");
    }
    return pw.browser;
  }
  if (target === "playwright") {
    return pw.playwrightModule;
  }
  if (target === "locator") {
    const locator = locatorFromPayload(pw.page, { locator: invoke.locator });
    if (!locator) {
      throw new Error("invoke target=locator requires payload.locator");
    }
    return locator;
  }
  throw new Error(`unsupported invoke target: ${target}`);
}
async function executePlaywrightInvoke(command, pw, payload) {
  const invoke = normalizeInvokePayload(payload, "method");
  if (!invoke?.method) {
    return {
      requestId: command.requestId,
      success: false,
      errorCode: "INVOKE_INVALID_PAYLOAD",
      errorMessage: "invoke requires payload.method (and optional target, args)"
    };
  }
  const target = resolvePlaywrightTarget(pw, invoke);
  const fn = target[invoke.method];
  if (typeof fn !== "function") {
    return {
      requestId: command.requestId,
      success: false,
      errorCode: "INVOKE_METHOD_NOT_FOUND",
      errorMessage: `Method not found: ${invoke.target ?? "page"}.${invoke.method}`
    };
  }
  const args = Array.isArray(invoke.args) ? invoke.args : [];
  const result = await fn.apply(target, args);
  if (invoke.target === "context" && invoke.method === "newPage" && result) {
    pw.page = result;
  }
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "playwright",
      command: "invoke",
      mode: "real",
      rpcMode: "method",
      target: invoke.target ?? "page",
      method: invoke.method,
      value: serializeRpcResult(result),
      browser: pw.browserKind,
      headless: pw.headless,
      connectedOverCdp: pw.connectedOverCdp,
      localBrowser: pw.localBrowser
    }
  };
}
async function runMock(command, reason) {
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "playwright",
      command: command.command,
      mode: "mock",
      reason: reason ?? "fallback",
      message: "Mock web command executed"
    }
  };
}
function failResult(command, code, message) {
  return {
    requestId: command.requestId,
    success: false,
    errorCode: code,
    errorMessage: message
  };
}
function getNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function getStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string");
}
var playwrightPlugin = {
  manifest: {
    id: "driver-playwright",
    version: "0.1.0",
    engine: "playwright",
    platforms: ["web"],
    capabilities: [...SEMANTIC_COMMANDS, "invoke"],
    semanticCommands: [...SEMANTIC_COMMANDS],
    invoke: {
      modes: ["method"],
      targets: ["page", "context", "browser", "playwright", "locator"]
    }
  },
  async init() {
  },
  async createSession(platform) {
    return { id: `pw-${Date.now()}`, platform };
  },
  async execute(session, command) {
    const cmd = command.command;
    const payload = command.payload;
    const forceMock = Boolean(payload?.mock);
    if (forceMock) {
      return runMock(command, "payload.mock=true");
    }
    if (cmd === "invoke") {
      try {
        const pw = await ensurePlaywrightSession(session, payload);
        return await executePlaywrightInvoke(command, pw, payload);
      } catch (error) {
        return failResult(command, "INVOKE_FAILED", error instanceof Error ? error.message : String(error));
      }
    }
    try {
      const pw = await ensurePlaywrightSession(session, payload);
      const page = pw.page;
      const url = getString(payload?.url);
      const locator = locatorFromPayload(page, payload);
      if (cmd === "navigate") {
        if (!url) {
          return runMock(command, "missing url");
        }
        await page.goto(url);
      } else if (command.command === "click") {
        if (!locator) {
          return runMock(command, "missing locator");
        }
        await locator.click();
      } else if (command.command === "hover") {
        if (!locator) {
          return runMock(command, "missing locator");
        }
        await locator.hover();
      } else if (command.command === "type") {
        if (!locator) {
          return runMock(command, "missing locator");
        }
        const text = getString(payload?.text) ?? "";
        await locator.fill(text);
      } else if (command.command === "press") {
        const key = getString(payload?.key);
        if (!key) {
          return runMock(command, "missing key");
        }
        if (locator) {
          await locator.press(key);
        } else {
          await page.keyboard.press(key);
        }
      } else if (command.command === "select") {
        if (!locator) {
          return runMock(command, "missing locator");
        }
        const value = getString(payload?.value);
        const label = getString(payload?.label);
        const index = getNumber(payload?.index);
        if (value) {
          await locator.selectOption({ value });
        } else if (label) {
          await locator.selectOption({ label });
        } else if (typeof index === "number") {
          await locator.selectOption({ index });
        } else {
          return runMock(command, "missing value/label/index");
        }
      } else if (command.command === "scroll") {
        const deltaX = getNumber(payload?.deltaX) ?? 0;
        const deltaY = getNumber(payload?.deltaY) ?? 500;
        if (locator) {
          await locator.scrollIntoViewIfNeeded();
        }
        await page.mouse.wheel(deltaX, deltaY);
      } else if (command.command === "forward") {
        await page.goForward().catch(() => null);
      } else if (command.command === "newTab") {
        const newPage = await pw.context.newPage();
        pw.page = newPage;
        if (url) {
          await newPage.goto(url);
        }
      } else if (command.command === "switchTab") {
        const pages = pw.context.pages();
        const tabIndex = getNumber(payload?.tabIndex) ?? 0;
        const safeIndex = Math.max(0, Math.min(pages.length - 1, tabIndex));
        const selected = pages[safeIndex];
        if (!selected) {
          return failResult(command, "TAB_NOT_FOUND", `No tab found at index ${tabIndex}`);
        }
        pw.page = selected;
        await selected.bringToFront();
      } else if (command.command === "uploadFile") {
        if (!locator) {
          return runMock(command, "missing locator");
        }
        const filePath = getString(payload?.filePath);
        const filePaths = getStringArray(payload?.filePaths);
        const targetPaths = filePaths.length > 0 ? filePaths : filePath ? [filePath] : [];
        if (targetPaths.length === 0) {
          return runMock(command, "missing filePath/filePaths");
        }
        await locator.setInputFiles(targetPaths);
      } else if (command.command === "dragDrop") {
        const sourceLocatorObj = asRecord2(payload?.sourceLocator ?? payload?.fromLocator);
        const targetLocatorObj = asRecord2(payload?.targetLocator ?? payload?.toLocator);
        const source = Object.keys(sourceLocatorObj).length > 0 ? locatorFromPayload(page, { locator: sourceLocatorObj }) : locator;
        const target = Object.keys(targetLocatorObj).length > 0 ? locatorFromPayload(page, { locator: targetLocatorObj }) : void 0;
        if (!source || !target) {
          return runMock(command, "missing source/target locator");
        }
        await source.dragTo(target);
      } else if (command.command === "wait") {
        const timeoutMs = getNumber(payload?.timeoutMs) ?? 300;
        await page.waitForTimeout(timeoutMs);
      } else if (command.command === "back") {
        await page.goBack().catch(() => null);
      } else if (command.command === "reload") {
        await page.reload();
      } else if (command.command === "closeTab") {
        await page.close();
        pw.page = await pw.context.newPage();
      } else if (command.command === "assertVisible") {
        if (!locator) {
          return runMock(command, "missing locator");
        }
        const visible = await locator.isVisible();
        if (!visible) {
          return failResult(command, "ASSERT_NOT_VISIBLE", "Target element is not visible.");
        }
      } else if (command.command === "assertText") {
        if (!locator) {
          return runMock(command, "missing locator");
        }
        const expected = getString(payload?.expectedText);
        if (!expected) {
          return runMock(command, "missing expectedText");
        }
        const actual = await locator.textContent() ?? "";
        if (!actual.includes(expected)) {
          return failResult(command, "ASSERT_TEXT_MISMATCH", `Expected text to include "${expected}", got "${actual}"`);
        }
      } else if (command.command === "getText") {
        if (!locator) {
          return runMock(command, "missing locator");
        }
        const text = await locator.textContent() ?? "";
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "playwright", command: command.command, mode: "real", text, headless: pw.headless, browser: pw.browserKind }
        };
      } else if (command.command === "screenshot") {
        const dir = import_node_path.default.join(process.cwd(), "artifacts");
        await import_promises.default.mkdir(dir, { recursive: true });
        const target = import_node_path.default.join(dir, `${command.requestId}.png`);
        const fullPage = typeof payload?.fullPage === "boolean" ? payload.fullPage : true;
        await page.screenshot({ path: target, fullPage });
        return {
          requestId: command.requestId,
          success: true,
          data: {
            driver: "playwright",
            command: command.command,
            screenshot: target,
            fullPage,
            headless: pw.headless,
            browser: pw.browserKind
          }
        };
      } else if (command.command === "custom") {
        const action = getString(payload?.action)?.toLowerCase();
        if (action === "invoke" || payload?.method && !action) {
          return executePlaywrightInvoke(command, pw, payload);
        }
        if (action === "evaluate") {
          const script = getString(payload?.script);
          if (!script) {
            return runMock(command, "missing script");
          }
          const value = await page.evaluate(script);
          return {
            requestId: command.requestId,
            success: true,
            data: {
              driver: "playwright",
              command: command.command,
              mode: "real",
              action: "evaluate",
              value: serializeRpcResult(value),
              headless: pw.headless,
              browser: pw.browserKind
            }
          };
        }
        return runMock(command, "unsupported custom action; use action=evaluate|invoke or command=invoke");
      } else {
        return runMock(command, "unsupported command");
      }
      return {
        requestId: command.requestId,
        success: true,
        data: {
          driver: "playwright",
          command: command.command,
          mode: "real",
          headless: pw.headless,
          browser: pw.browserKind,
          connectedOverCdp: pw.connectedOverCdp,
          localBrowser: pw.localBrowser
        }
      };
    } catch (error) {
      if (cmd === "custom") {
        return failResult(command, "COMMAND_FAILED", error instanceof Error ? error.message : String(error));
      }
      return runMock(command, error instanceof Error ? error.message : String(error));
    }
  },
  async destroySession(session) {
    const existed = sessions.get(session.id);
    if (!existed) {
      return;
    }
    await closePlaywrightSession(existed);
    sessions.delete(session.id);
  },
  async dispose() {
    for (const [, pw] of sessions) {
      await closePlaywrightSession(pw);
    }
    sessions.clear();
  }
};
var index_default = playwrightPlugin;
