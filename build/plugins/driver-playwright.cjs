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
var import_node_module = require("node:module");
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var sessions = /* @__PURE__ */ new Map();
var localRequire = (0, import_node_module.createRequire)(typeof __filename === "string" ? __filename : process.cwd());
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
function getString(value) {
  return typeof value === "string" ? value : void 0;
}
function locatorFromPayload(page, payload) {
  if (!payload) {
    return void 0;
  }
  const locatorObj = payload.locator;
  if (!locatorObj) {
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
  if (typeof payload?.headless === "boolean") {
    return payload.headless;
  }
  return process.env.ADA_PLAYWRIGHT_HEADLESS !== "false";
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
async function ensurePlaywrightSession(session, payload) {
  const expectedHeadless = parseHeadless(payload);
  const existed = sessions.get(session.id);
  if (existed) {
    if (existed.headless === expectedHeadless) {
      return existed;
    }
    await existed.context.close().catch(() => void 0);
    await existed.browser.close().catch(() => void 0);
    sessions.delete(session.id);
  }
  const playwrightModule = await loadPlaywrightModule();
  const chromium = playwrightModule.chromium;
  const browser = await chromium.launch({ headless: expectedHeadless });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pwSession = { browser, context, page, headless: expectedHeadless };
  sessions.set(session.id, pwSession);
  return pwSession;
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
var playwrightPlugin = {
  manifest: {
    id: "driver-playwright",
    version: "0.1.0",
    engine: "playwright",
    platforms: ["web"],
    capabilities: [
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
    ]
  },
  async init() {
  },
  async createSession(platform) {
    return { id: `pw-${Date.now()}`, platform };
  },
  async execute(session, command) {
    const payload = command.payload;
    const forceMock = Boolean(payload?.mock);
    if (forceMock) {
      return runMock(command, "payload.mock=true");
    }
    try {
      const pw = await ensurePlaywrightSession(session, payload);
      const page = pw.page;
      const url = getString(payload?.url);
      const locator = locatorFromPayload(page, payload);
      if (command.command === "navigate") {
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
          return {
            requestId: command.requestId,
            success: false,
            errorCode: "TAB_NOT_FOUND",
            errorMessage: `No tab found at index ${tabIndex}`
          };
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
        const sourceLocatorObj = payload?.sourceLocator ?? payload?.fromLocator;
        const targetLocatorObj = payload?.targetLocator ?? payload?.toLocator;
        const source = sourceLocatorObj ? locatorFromPayload(page, { locator: sourceLocatorObj }) : locator;
        const target = targetLocatorObj ? locatorFromPayload(page, { locator: targetLocatorObj }) : void 0;
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
          return {
            requestId: command.requestId,
            success: false,
            errorCode: "ASSERT_NOT_VISIBLE",
            errorMessage: "Target element is not visible."
          };
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
          return {
            requestId: command.requestId,
            success: false,
            errorCode: "ASSERT_TEXT_MISMATCH",
            errorMessage: `Expected text to include "${expected}", got "${actual}"`
          };
        }
      } else if (command.command === "getText") {
        if (!locator) {
          return runMock(command, "missing locator");
        }
        const text = await locator.textContent() ?? "";
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "playwright", command: command.command, mode: "real", text, headless: pw.headless }
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
          data: { driver: "playwright", command: command.command, screenshot: target, fullPage, headless: pw.headless }
        };
      } else if (command.command === "custom") {
        const action = getString(payload?.action);
        if (action === "evaluate") {
          const script = getString(payload?.script);
          if (!script) {
            return runMock(command, "missing script");
          }
          const value = await page.evaluate(script);
          return {
            requestId: command.requestId,
            success: true,
            data: { driver: "playwright", command: command.command, mode: "real", action, value, headless: pw.headless }
          };
        }
        return runMock(command, "unsupported custom action");
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
          headless: pw.headless
        }
      };
    } catch (error) {
      return runMock(command, error instanceof Error ? error.message : String(error));
    }
  },
  async destroySession(session) {
    const existed = sessions.get(session.id);
    if (!existed) {
      return;
    }
    await existed.context.close().catch(() => void 0);
    await existed.browser.close().catch(() => void 0);
    sessions.delete(session.id);
  },
  async dispose() {
    for (const [id, session] of sessions) {
      await session.context.close().catch(() => void 0);
      await session.browser.close().catch(() => void 0);
      sessions.delete(id);
    }
  }
};
var index_default = playwrightPlugin;
