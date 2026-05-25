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

// ../../plugins/driver-selenium/src/index.ts
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
function resolveSeleniumBrowserFields(payload) {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const browserName = getString(p.browserName) ?? getString(options.browserName) ?? getString(p.browser) ?? getString(options.browser) ?? process.env.ADA_SELENIUM_BROWSER ?? "firefox";
  return {
    browserName: browserName.toLowerCase(),
    browserBinary: pickPayloadString(
      p,
      options,
      "browserBinary",
      ["executablePath", "browserPath", "browserExecutable"],
      "ADA_SELENIUM_BROWSER_BINARY"
    ),
    profile: pickPayloadString(p, options, "profile", ["userDataDir"], "ADA_SELENIUM_PROFILE"),
    seleniumServerUrl: pickPayloadString(
      p,
      options,
      "seleniumServerUrl",
      ["serverUrl", "gridUrl"],
      "ADA_SELENIUM_SERVER_URL"
    )
  };
}
function buildSeleniumSessionKey(payload) {
  const p = asRecord(payload);
  const fields = resolveSeleniumBrowserFields(p);
  const headless = typeof p.headless === "boolean" ? p.headless : typeof asRecord(p.options).headless === "boolean" ? asRecord(p.options).headless : "env";
  const caps = p.capabilities ?? asRecord(p.options).capabilities;
  const capsKey = caps !== void 0 ? JSON.stringify(caps) : "";
  return `selenium|${fields.browserName}|${headless}|${fields.browserBinary}|${fields.profile}|${fields.seleniumServerUrl}|${capsKey}`;
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
    "seleniumServerUrl",
    "geckodriverVersion",
    "chromedriverVersion"
  ]) {
    if (p[key] === void 0 && options[key] !== void 0) {
      p[key] = options[key];
    }
  }
  return p;
}

// ../../packages/native-drivers/src/index.ts
var import_node_child_process = require("node:child_process");
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var DEFAULT_NATIVE_DRIVERS_DIR = "dirver";
async function fileExists(filePath) {
  try {
    await import_promises.default.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function dirExists(dirPath) {
  try {
    const stat = await import_promises.default.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
async function resolveWorkspaceRoot(cwd = process.cwd()) {
  let current = import_node_path.default.resolve(cwd);
  for (let i = 0; i < 8; i += 1) {
    const pkg = import_node_path.default.join(current, "package.json");
    if (await fileExists(pkg)) {
      try {
        const raw = await import_promises.default.readFile(pkg, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.workspaces) {
          return current;
        }
      } catch {
      }
    }
    const parent = import_node_path.default.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return import_node_path.default.resolve(cwd);
}
async function resolveNativeDriversDir(workspaceRoot) {
  const root = workspaceRoot ? import_node_path.default.resolve(workspaceRoot) : await resolveWorkspaceRoot();
  const fromEnv = process.env.ADA_DRIVERS_DIR?.trim();
  if (fromEnv) {
    return import_node_path.default.isAbsolute(fromEnv) ? fromEnv : import_node_path.default.join(root, fromEnv);
  }
  for (const name of [DEFAULT_NATIVE_DRIVERS_DIR, "driver", "drivers"]) {
    const candidate = import_node_path.default.join(root, name);
    if (await dirExists(candidate)) {
      return candidate;
    }
  }
  return import_node_path.default.join(root, DEFAULT_NATIVE_DRIVERS_DIR);
}
function geckodriverExeName() {
  return process.platform === "win32" ? "geckodriver.exe" : "geckodriver";
}
function chromedriverExeName(version) {
  const suffix = process.platform === "win32" ? ".exe" : "";
  if (version && version !== "latest") {
    const major = version.replace(/^v/i, "").split(".")[0];
    return `chromedriver${major}${suffix}`;
  }
  return `chromedriver${suffix}`;
}
async function listExecutablesInDir(driversDir) {
  if (!await dirExists(driversDir)) {
    return [];
  }
  const entries = await import_promises.default.readdir(driversDir, { withFileTypes: true });
  const files = [];
  for (const ent of entries) {
    if (ent.isFile()) {
      files.push(ent.name);
    }
  }
  return files;
}
async function listLocalChromedriverVersions(driversDir) {
  const files = await listExecutablesInDir(driversDir);
  const versions = /* @__PURE__ */ new Set();
  for (const name of files) {
    const m = /^chromedriver(\d{2,4})(?:\.exe)?$/i.exec(name);
    if (m) {
      versions.add(m[1]);
    }
  }
  return Array.from(versions).sort((a, b) => Number(b) - Number(a));
}
async function listLocalGeckodriverCandidates(driversDir) {
  const files = await listExecutablesInDir(driversDir);
  return files.filter((n) => /^geckodriver/i.test(n) && (n.endsWith(".exe") || !n.includes(".")));
}
async function findGeckodriverInDir(driversDir, version) {
  if (!await dirExists(driversDir)) {
    return void 0;
  }
  const names = await listLocalGeckodriverCandidates(driversDir);
  const prefer = geckodriverExeName();
  if (names.includes(prefer)) {
    return import_node_path.default.join(driversDir, prefer);
  }
  if (version) {
    const tagged = names.find((n) => n.includes(version.replace(/^v/, "")));
    if (tagged) {
      return import_node_path.default.join(driversDir, tagged);
    }
  }
  if (names.length > 0) {
    return import_node_path.default.join(driversDir, names[0]);
  }
  return void 0;
}
async function findChromedriverInDir(driversDir, version) {
  if (!await dirExists(driversDir)) {
    return void 0;
  }
  const wantMajor = version && version !== "latest" ? version.replace(/^v/i, "").split(".")[0] : void 0;
  if (wantMajor) {
    const named = import_node_path.default.join(driversDir, chromedriverExeName(wantMajor));
    if (await fileExists(named)) {
      return { path: named, version: wantMajor };
    }
  }
  const generic = import_node_path.default.join(driversDir, chromedriverExeName());
  if (await fileExists(generic)) {
    return { path: generic, version: wantMajor ?? "generic" };
  }
  const locals = await listLocalChromedriverVersions(driversDir);
  if (locals.length > 0) {
    const pick = wantMajor && locals.includes(wantMajor) ? wantMajor : locals[0];
    return { path: import_node_path.default.join(driversDir, chromedriverExeName(pick)), version: pick };
  }
  return void 0;
}
async function resolveGeckodriverPath(options) {
  const fromEnv = process.env.ADA_GECKODRIVER_PATH?.trim();
  if (fromEnv && await fileExists(fromEnv)) {
    return fromEnv;
  }
  const driversDir = options?.driversDir ?? await resolveNativeDriversDir(options?.workspaceRoot);
  const local = await findGeckodriverInDir(driversDir, options?.version);
  if (local && await fileExists(local)) {
    return local;
  }
  if (await commandOnPath("geckodriver")) {
    return "geckodriver";
  }
  return void 0;
}
async function resolveChromedriverPath(options) {
  const fromEnv = process.env.ADA_CHROMEDRIVER_PATH?.trim();
  if (fromEnv && await fileExists(fromEnv)) {
    return { path: fromEnv, version: options?.version ?? "env" };
  }
  const driversDir = options?.driversDir ?? await resolveNativeDriversDir(options?.workspaceRoot);
  const local = await findChromedriverInDir(driversDir, options?.version);
  if (local && await fileExists(local.path)) {
    return local;
  }
  if (await commandOnPath("chromedriver")) {
    return { path: "chromedriver", version: options?.version ?? "path" };
  }
  return void 0;
}
async function commandOnPath(command) {
  return new Promise((resolve) => {
    const checker = process.platform === "win32" ? "where" : "which";
    const child = (0, import_node_child_process.spawn)(checker, [command], {
      stdio: "ignore",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

// ../../plugins/driver-selenium/src/index.ts
var import_node_module = require("node:module");
var import_promises2 = __toESM(require("node:fs/promises"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
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
  "wait",
  "assertText",
  "getText",
  "back",
  "reload",
  "closeTab",
  "invoke"
];
function getNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
async function loadSeleniumModule() {
  try {
    return localRequire("selenium-webdriver");
  } catch {
    return await new Function('return import("selenium-webdriver")')();
  }
}
function failResult(command, code, message) {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}
function runMock(command, reason) {
  const fields = resolveSeleniumBrowserFields(command.payload);
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "selenium",
      command: command.command,
      mode: "mock",
      reason: reason ?? "mock",
      browserName: fields.browserName,
      engine: "selenium"
    }
  };
}
function wantsMock(payload) {
  const merged = mergeOptionsIntoPayload(payload);
  if (merged.mock === true) {
    return true;
  }
  if (merged.real === true) {
    return false;
  }
  return process.env.ADA_SELENIUM_MOCK === "true";
}
async function buildDriver(payload) {
  const merged = mergeOptionsIntoPayload(payload);
  const fields = resolveSeleniumBrowserFields(merged);
  const sw = await loadSeleniumModule();
  const { Builder, Browser } = sw;
  if (fields.seleniumServerUrl) {
    const caps = merged.capabilities ?? {
      browserName: fields.browserName
    };
    return await new Builder().usingServer(fields.seleniumServerUrl).withCapabilities(caps).build();
  }
  const browserName = fields.browserName;
  const driverVersion = getString(merged.geckodriverVersion) ?? getString(merged.chromedriverVersion) ?? getString(asRecord(merged.options).geckodriverVersion) ?? getString(asRecord(merged.options).chromedriverVersion);
  if (browserName === "firefox") {
    const firefox = await import("selenium-webdriver/firefox.js");
    const options = new firefox.Options();
    if (fields.browserBinary) {
      options.setBinary(fields.browserBinary);
    }
    if (fields.profile) {
      options.addArguments("-profile", fields.profile);
    }
    if (merged.headless === true) {
      options.addArguments("-headless");
    }
    const builder = new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options);
    const geckoPath = await resolveGeckodriverPath({ version: driverVersion });
    if (geckoPath && geckoPath !== "geckodriver") {
      builder.setFirefoxService(new firefox.ServiceBuilder(geckoPath));
    }
    return await builder.build();
  }
  if (browserName === "chrome" || browserName === "chromium") {
    const chrome = await import("selenium-webdriver/chrome.js");
    const options = new chrome.Options();
    if (fields.browserBinary) {
      options.setBinary(fields.browserBinary);
    }
    if (fields.profile) {
      options.addArguments(`--user-data-dir=${fields.profile}`);
    }
    if (merged.headless === true) {
      options.addArguments("--headless=new");
    }
    const builder = new Builder().forBrowser(Browser.CHROME).setChromeOptions(options);
    const chromeDriver = await resolveChromedriverPath({ version: driverVersion });
    if (chromeDriver?.path && chromeDriver.path !== "chromedriver") {
      builder.setChromeService(new chrome.ServiceBuilder(chromeDriver.path));
    }
    return await builder.build();
  }
  if (browserName === "microsoftedge" || browserName === "edge") {
    const edge = await import("selenium-webdriver/edge.js");
    const options = new edge.Options();
    if (fields.browserBinary) {
      options.setBinary(fields.browserBinary);
    }
    if (merged.headless === true) {
      options.addArguments("--headless=new");
    }
    return await new Builder().forBrowser(Browser.EDGE).setEdgeOptions(options).build();
  }
  throw new Error(`Unsupported browserName for selenium: ${browserName}`);
}
async function getOrCreateDriver(sessionId, payload) {
  const merged = mergeOptionsIntoPayload({ ...payload, engine: "selenium" });
  const sessionKey = buildSeleniumSessionKey(merged);
  const fields = resolveSeleniumBrowserFields(merged);
  const mock = wantsMock(merged);
  const existed = sessions.get(sessionId);
  if (existed && existed.sessionKey === sessionKey) {
    return existed;
  }
  if (existed?.driver) {
    await existed.driver.quit().catch(() => void 0);
    sessions.delete(sessionId);
  }
  const state = {
    driver: mock ? null : await buildDriver(merged),
    sessionKey,
    browserName: fields.browserName,
    mock
  };
  sessions.set(sessionId, state);
  return state;
}
async function findElement(driver, payload) {
  const sw = await loadSeleniumModule();
  const { By, until } = sw;
  const locator = asRecord(payload?.locator);
  const timeoutMs = typeof payload?.timeoutMs === "number" ? payload.timeoutMs : 15e3;
  const id = getString(locator.id) ?? getString(locator.accessibilityId);
  if (id) {
    return await driver.wait(until.elementLocated(By.id(id)), timeoutMs);
  }
  const css = getString(locator.css);
  if (css) {
    return await driver.wait(until.elementLocated(By.css(css)), timeoutMs);
  }
  const xpath = getString(locator.xpath);
  if (xpath) {
    return await driver.wait(until.elementLocated(By.xpath(xpath)), timeoutMs);
  }
  const text = getString(locator.text);
  if (text) {
    return await driver.wait(until.elementLocated(By.xpath(`//*[contains(text(),'${text.replace(/'/g, "")}')]`)), timeoutMs);
  }
  return null;
}
async function runInvoke(command, state) {
  const invoke = normalizeInvokePayload(command.payload, "method");
  if (!invoke) {
    return failResult(command, "INVOKE_INVALID_PAYLOAD", "invoke requires method or http block");
  }
  if (invoke.mode === "http") {
    const serverUrl = resolveSeleniumBrowserFields(command.payload).seleniumServerUrl;
    if (!serverUrl) {
      return failResult(
        command,
        "INVOKE_HTTP_REQUIRES_GRID",
        "Selenium invoke http mode requires seleniumServerUrl (remote Grid)"
      );
    }
    const http = invoke.http;
    const sessionId = await state.driver?.getSession().then((s) => s.getId());
    if (!sessionId) {
      return failResult(command, "SESSION_MISSING", "no active selenium session");
    }
    const base = serverUrl.replace(/\/$/, "");
    const path3 = http.path.startsWith("/") ? http.path : `/${http.path}`;
    const url = `${base}/session/${sessionId}${path3.replace(":sessionId", sessionId)}`;
    const res = await fetch(url, {
      method: http.method.toUpperCase(),
      headers: { "Content-Type": "application/json" },
      body: http.body !== void 0 ? JSON.stringify(http.body) : void 0
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return failResult(command, "INVOKE_HTTP_FAILED", JSON.stringify(raw));
    }
    return {
      requestId: command.requestId,
      success: true,
      data: {
        driver: "selenium",
        mode: "real",
        invokeMode: "http",
        status: res.status,
        value: serializeRpcResult(raw.value ?? raw)
      }
    };
  }
  const driver = state.driver;
  if (!driver) {
    return runMock(command, "invoke without driver");
  }
  const target = invoke.target ?? "driver";
  const method = invoke.method ?? "";
  const args = invoke.args ?? [];
  if (target === "element") {
    const el = await findElement(driver, command.payload);
    if (!el) {
      return failResult(command, "LOCATOR_NOT_FOUND", "element locator required for target=element");
    }
    const fn = el[method];
    if (typeof fn !== "function") {
      return failResult(command, "INVOKE_METHOD_UNSUPPORTED", `element.${method}`);
    }
    const value2 = await fn.apply(el, args);
    return {
      requestId: command.requestId,
      success: true,
      data: { driver: "selenium", mode: "real", invokeMode: "method", target, method, value: serializeRpcResult(value2) }
    };
  }
  const driverFn = driver[method];
  if (typeof driverFn !== "function") {
    return failResult(command, "INVOKE_METHOD_UNSUPPORTED", `driver.${method}`);
  }
  const value = await driverFn.apply(driver, args);
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "selenium", mode: "real", invokeMode: "method", target, method, value: serializeRpcResult(value) }
  };
}
var seleniumPlugin = {
  manifest: {
    id: "@ada/driver-selenium",
    version: "0.1.0",
    platforms: ["web"],
    capabilities: [...SEMANTIC_COMMANDS],
    engine: "selenium",
    semanticCommands: [...SEMANTIC_COMMANDS],
    invoke: { modes: ["method", "http"], targets: ["driver", "element"] }
  },
  async init() {
    return;
  },
  async createSession() {
    const id = `selenium-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, platform: "web" };
  },
  async execute(session, command) {
    const payload = mergeOptionsIntoPayload({ ...command.payload, engine: "selenium" });
    const cmd = command.command;
    if (cmd === "invoke") {
      const invokeCheck = normalizeInvokePayload(command.payload, "method");
      if (!invokeCheck) {
        return failResult(command, "INVOKE_INVALID_PAYLOAD", "invoke requires method or http block");
      }
      if (wantsMock(payload)) {
        return runMock(command);
      }
      let state2;
      try {
        state2 = await getOrCreateDriver(session.id, payload);
      } catch (error) {
        return failResult(
          command,
          "DRIVER_START_FAILED",
          error instanceof Error ? error.message : String(error)
        );
      }
      try {
        return await runInvoke(command, state2);
      } catch (error) {
        return failResult(command, "INVOKE_FAILED", error instanceof Error ? error.message : String(error));
      }
    }
    if (wantsMock(payload)) {
      return runMock(command);
    }
    let state;
    try {
      state = await getOrCreateDriver(session.id, payload);
    } catch (error) {
      return failResult(
        command,
        "DRIVER_START_FAILED",
        error instanceof Error ? error.message : String(error)
      );
    }
    const driver = state.driver;
    if (!driver) {
      return runMock(command);
    }
    try {
      if (cmd === "navigate") {
        const url = getString(payload.url);
        if (!url) {
          return failResult(command, "INVALID_PAYLOAD", "navigate requires url");
        }
        await driver.get(url);
      } else if (cmd === "click") {
        const el = await findElement(driver, payload);
        if (!el) {
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        await el.click();
      } else if (cmd === "type") {
        const el = await findElement(driver, payload);
        const text = getString(payload.text);
        if (!el || !text) {
          return failResult(command, "INVALID_PAYLOAD", "type requires locator and text");
        }
        await el.clear();
        await el.sendKeys(text);
      } else if (cmd === "screenshot") {
        const screenshotPath = getString(payload.screenshotPath) ?? import_node_path2.default.join(process.cwd(), "artifacts", `selenium-${Date.now()}.png`);
        await import_promises2.default.mkdir(import_node_path2.default.dirname(screenshotPath), { recursive: true });
        const image = await driver.takeScreenshot();
        await import_promises2.default.writeFile(screenshotPath, image, "base64");
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "selenium", command: cmd, mode: "real", screenshotPath }
        };
      } else if (cmd === "wait") {
        const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 3e3;
        await driver.sleep(timeoutMs);
      } else if (cmd === "back") {
        await driver.navigate().back();
      } else if (cmd === "reload") {
        await driver.navigate().refresh();
      } else if (cmd === "forward") {
        await driver.navigate().forward();
      } else if (cmd === "newTab") {
        const sw = await loadSeleniumModule();
        await driver.switchTo().newWindow(sw.WindowType.TAB);
        const url = getString(payload.url);
        if (url) {
          await driver.get(url);
        }
      } else if (cmd === "switchTab") {
        const handles = await driver.getAllWindowHandles();
        const tabIndex = getNumber(payload.tabIndex) ?? 0;
        if (handles.length === 0) {
          return failResult(command, "TAB_NOT_FOUND", "no window handles");
        }
        const safeIndex = Math.max(0, Math.min(handles.length - 1, tabIndex));
        await driver.switchTo().window(handles[safeIndex]);
      } else if (cmd === "closeTab") {
        await driver.close();
        const handles = await driver.getAllWindowHandles();
        if (handles.length > 0) {
          await driver.switchTo().window(handles[handles.length - 1]);
        }
      } else if (cmd === "hover") {
        const el = await findElement(driver, payload);
        if (!el) {
          return failResult(command, "LOCATOR_NOT_FOUND", "hover requires locator");
        }
        const sw = await loadSeleniumModule();
        await sw.driver.actions({ bridge: true }).move({ origin: el }).perform();
      } else if (cmd === "press") {
        const key = getString(payload.key) ?? "Enter";
        const el = await findElement(driver, payload);
        const sw = await loadSeleniumModule();
        const keys = sw.Key ?? (await import("selenium-webdriver")).Key;
        const keyConst = keys[key] ?? key;
        if (el) {
          await el.sendKeys(keyConst);
        } else {
          await driver.actions().sendKeys(keyConst).perform();
        }
      } else if (cmd === "select") {
        const el = await findElement(driver, payload);
        const value = getString(payload.value) ?? getString(payload.text);
        if (!el || !value) {
          return failResult(command, "INVALID_PAYLOAD", "select requires locator and value");
        }
        const { Select } = await import("selenium-webdriver/lib/select.js");
        const select = new Select(el);
        await select.selectByVisibleText(value);
      } else if (cmd === "scroll") {
        const deltaX = getNumber(payload.deltaX) ?? 0;
        const deltaY = getNumber(payload.deltaY) ?? 400;
        await driver.executeScript(`window.scrollBy(${deltaX}, ${deltaY});`);
      } else if (cmd === "getText") {
        const el = await findElement(driver, payload);
        if (!el) {
          return failResult(command, "LOCATOR_NOT_FOUND", "getText requires locator");
        }
        const text = await el.getText();
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "selenium", command: cmd, mode: "real", text }
        };
      } else if (cmd === "assertVisible") {
        const el = await findElement(driver, payload);
        if (!el) {
          return failResult(command, "ASSERT_FAILED", "element not visible");
        }
        const displayed = await el.isDisplayed();
        if (!displayed) {
          return failResult(command, "ASSERT_FAILED", "element not displayed");
        }
      } else if (cmd === "assertText") {
        const el = await findElement(driver, payload);
        const expected = getString(payload.expectedText) ?? getString(payload.text);
        if (!el || !expected) {
          return failResult(command, "INVALID_PAYLOAD", "assertText requires locator and expectedText");
        }
        const actual = await el.getText();
        if (!actual.includes(expected)) {
          return failResult(command, "ASSERT_FAILED", `expected text "${expected}", got "${actual}"`);
        }
      } else {
        return runMock(command, `unsupported command: ${cmd}`);
      }
      return {
        requestId: command.requestId,
        success: true,
        data: {
          driver: "selenium",
          command: cmd,
          mode: "real",
          browserName: state.browserName,
          engine: "selenium"
        }
      };
    } catch (error) {
      return failResult(command, "COMMAND_FAILED", error instanceof Error ? error.message : String(error));
    }
  },
  async destroySession(session) {
    const state = sessions.get(session.id);
    if (!state?.driver) {
      sessions.delete(session.id);
      return;
    }
    await state.driver.quit().catch(() => void 0);
    sessions.delete(session.id);
  },
  async dispose() {
    for (const [, state] of sessions) {
      if (state.driver) {
        await state.driver.quit().catch(() => void 0);
      }
    }
    sessions.clear();
  }
};
var index_default = seleniumPlugin;
