import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

interface PlaywrightSession {
  browser: any;
  context: any;
  page: any;
  headless: boolean;
}

const sessions = new Map<string, PlaywrightSession>();
const localRequire = createRequire(typeof __filename === "string" ? __filename : process.cwd());

async function loadPlaywrightModule(): Promise<any> {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "..", "package.json"),
    path.join(cwd, "package.json"),
    typeof __filename === "string" ? __filename : undefined
  ].filter((x): x is string => Boolean(x));

  for (const base of candidates) {
    try {
      const req = createRequire(base);
      return req("playwright");
    } catch {
      // try next
    }
  }

  try {
    return localRequire("playwright");
  } catch {
    // fall through to dynamic import
  }

  return await new Function('return import("playwright")')();
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function locatorFromPayload(page: any, payload?: Record<string, unknown>): any {
  if (!payload) {
    return undefined;
  }
  const locatorObj = payload.locator as Record<string, unknown> | undefined;
  if (!locatorObj) {
    return undefined;
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
    return page.getByRole(role as any);
  }
  const css = getString(locatorObj.css);
  if (css) {
    return page.locator(css);
  }
  const xpath = getString(locatorObj.xpath);
  if (xpath) {
    return page.locator(xpath);
  }
  return undefined;
}

function parseHeadless(payload?: Record<string, unknown>): boolean {
  if (typeof payload?.headless === "boolean") {
    return payload.headless;
  }
  return process.env.ADA_PLAYWRIGHT_HEADLESS !== "false";
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

async function ensurePlaywrightSession(session: DriverSession, payload?: Record<string, unknown>): Promise<PlaywrightSession> {
  const expectedHeadless = parseHeadless(payload);
  const existed = sessions.get(session.id);
  if (existed) {
    if (existed.headless === expectedHeadless) {
      return existed;
    }
    await existed.context.close().catch(() => undefined);
    await existed.browser.close().catch(() => undefined);
    sessions.delete(session.id);
  }

  const playwrightModule = (await loadPlaywrightModule()) as any;
  const chromium = playwrightModule.chromium;
  const browser = await chromium.launch({ headless: expectedHeadless });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pwSession: PlaywrightSession = { browser, context, page, headless: expectedHeadless };
  sessions.set(session.id, pwSession);
  return pwSession;
}

async function runMock(command: CommandEnvelope, reason?: string): Promise<CommandResult> {
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

const playwrightPlugin: DriverPlugin = {
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

  async init() {},

  async createSession(platform): Promise<DriverSession> {
    return { id: `pw-${Date.now()}`, platform };
  },

  async execute(session: DriverSession, command: CommandEnvelope): Promise<CommandResult> {
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
        const sourceLocatorObj = (payload?.sourceLocator ?? payload?.fromLocator) as Record<string, unknown> | undefined;
        const targetLocatorObj = (payload?.targetLocator ?? payload?.toLocator) as Record<string, unknown> | undefined;
        const source = sourceLocatorObj ? locatorFromPayload(page, { locator: sourceLocatorObj }) : locator;
        const target = targetLocatorObj ? locatorFromPayload(page, { locator: targetLocatorObj }) : undefined;
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
        const actual = (await locator.textContent()) ?? "";
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
        const text = (await locator.textContent()) ?? "";
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "playwright", command: command.command, mode: "real", text, headless: pw.headless }
        };
      } else if (command.command === "screenshot") {
        const dir = path.join(process.cwd(), "artifacts");
        await fs.mkdir(dir, { recursive: true });
        const target = path.join(dir, `${command.requestId}.png`);
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

  async destroySession(session: DriverSession) {
    const existed = sessions.get(session.id);
    if (!existed) {
      return;
    }
    await existed.context.close().catch(() => undefined);
    await existed.browser.close().catch(() => undefined);
    sessions.delete(session.id);
  },

  async dispose() {
    for (const [id, session] of sessions) {
      await session.context.close().catch(() => undefined);
      await session.browser.close().catch(() => undefined);
      sessions.delete(id);
    }
  }
};

export default playwrightPlugin;
