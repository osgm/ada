import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import {
  asRecord,
  buildSeleniumSessionKey,
  getString,
  mergeOptionsIntoPayload,
  normalizeInvokePayload,
  resolveSeleniumBrowserFields,
  serializeRpcResult
} from "@ada/driver-rpc";
import { resolveChromedriverPath, resolveGeckodriverPath } from "@ada/native-drivers";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

type SeleniumWebDriver = import("selenium-webdriver").WebDriver;
type SeleniumWebElement = import("selenium-webdriver").WebElement;

interface SeleniumSessionState {
  driver: SeleniumWebDriver | null;
  sessionKey: string;
  browserName: string;
  mock: boolean;
}

const sessions = new Map<string, SeleniumSessionState>();
const localRequire = createRequire(typeof __filename === "string" ? __filename : process.cwd());

const SEMANTIC_COMMANDS = [
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
] as const;

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function loadSeleniumModule(): Promise<typeof import("selenium-webdriver")> {
  try {
    return localRequire("selenium-webdriver");
  } catch {
    return await new Function('return import("selenium-webdriver")')();
  }
}

function failResult(command: CommandEnvelope, code: string, message: string): CommandResult {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}

function runMock(command: CommandEnvelope, reason?: string): CommandResult {
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

function wantsMock(payload?: Record<string, unknown>): boolean {
  const merged = mergeOptionsIntoPayload(payload);
  return merged.mock === true;
}

async function buildDriver(payload?: Record<string, unknown>): Promise<SeleniumWebDriver> {
  const merged = mergeOptionsIntoPayload(payload);
  const fields = resolveSeleniumBrowserFields(merged);
  const sw = await loadSeleniumModule();
  const { Builder, Browser } = sw;

  if (fields.seleniumServerUrl) {
    const caps = (merged.capabilities as Record<string, unknown> | undefined) ?? {
      browserName: fields.browserName
    };
    return await new Builder().usingServer(fields.seleniumServerUrl).withCapabilities(caps).build();
  }

  const browserName = fields.browserName;
  const driverVersion =
    getString(merged.geckodriverVersion) ??
    getString(merged.chromedriverVersion) ??
    getString(asRecord(merged.options).geckodriverVersion) ??
    getString(asRecord(merged.options).chromedriverVersion);

  if (browserName === "firefox") {
    const firefox = await import("selenium-webdriver/firefox.js");
    const options = new firefox.Options();
    if (fields.browserBinary) {
      (options as unknown as { setBinary(path: string): void }).setBinary(fields.browserBinary);
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
      (options as unknown as { setBinary(path: string): void }).setBinary(fields.browserBinary);
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
      (options as unknown as { setBinary(path: string): void }).setBinary(fields.browserBinary);
    }
    if (merged.headless === true) {
      options.addArguments("--headless=new");
    }
    return await new Builder().forBrowser(Browser.EDGE).setEdgeOptions(options).build();
  }

  throw new Error(`Unsupported browserName for selenium: ${browserName}`);
}

async function getOrCreateDriver(sessionId: string, payload?: Record<string, unknown>): Promise<SeleniumSessionState> {
  const merged = mergeOptionsIntoPayload({ ...payload, engine: "selenium" });
  const sessionKey = buildSeleniumSessionKey(merged);
  const fields = resolveSeleniumBrowserFields(merged);
  const mock = wantsMock(merged);
  const existed = sessions.get(sessionId);
  if (existed && existed.sessionKey === sessionKey) {
    return existed;
  }
  if (existed?.driver) {
    await existed.driver.quit().catch(() => undefined);
    sessions.delete(sessionId);
  }
  const state: SeleniumSessionState = {
    driver: mock ? null : await buildDriver(merged),
    sessionKey,
    browserName: fields.browserName,
    mock
  };
  sessions.set(sessionId, state);
  return state;
}

async function findElement(
  driver: SeleniumWebDriver,
  payload?: Record<string, unknown>
): Promise<SeleniumWebElement | null> {
  const sw = await loadSeleniumModule();
  const { By, until } = sw;
  const locator = asRecord(payload?.locator);
  const timeoutMs = typeof payload?.timeoutMs === "number" ? payload.timeoutMs : 15000;

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

async function runInvoke(
  command: CommandEnvelope,
  state: SeleniumSessionState
): Promise<CommandResult> {
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
    const http = invoke.http!;
    const sessionId = await state.driver?.getSession().then((s: { getId(): string }) => s.getId());
    if (!sessionId) {
      return failResult(command, "SESSION_MISSING", "no active selenium session");
    }
    const base = serverUrl.replace(/\/$/, "");
    const path = http.path.startsWith("/") ? http.path : `/${http.path}`;
    const url = `${base}/session/${sessionId}${path.replace(":sessionId", sessionId)}`;
    const res = await fetch(url, {
      method: http.method.toUpperCase(),
      headers: { "Content-Type": "application/json" },
      body: http.body !== undefined ? JSON.stringify(http.body) : undefined
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
        value: serializeRpcResult((raw as { value?: unknown }).value ?? raw)
      }
    };
  }

  const driver = state.driver;
  if (!driver) {
    return failResult(command, "DRIVER_NOT_READY", "invoke requires an active selenium driver");
  }
  const target = invoke.target ?? "driver";
  const method = invoke.method ?? "";
  const args = invoke.args ?? [];

  if (target === "element") {
    const el = await findElement(driver, command.payload);
    if (!el) {
      return failResult(command, "LOCATOR_NOT_FOUND", "element locator required for target=element");
    }
    const fn = (el as unknown as Record<string, unknown>)[method];
    if (typeof fn !== "function") {
      return failResult(command, "INVOKE_METHOD_UNSUPPORTED", `element.${method}`);
    }
    const value = await (fn as (...a: unknown[]) => Promise<unknown>).apply(el, args);
    return {
      requestId: command.requestId,
      success: true,
      data: { driver: "selenium", mode: "real", invokeMode: "method", target, method, value: serializeRpcResult(value) }
    };
  }

  const driverFn = (driver as unknown as Record<string, unknown>)[method];
  if (typeof driverFn !== "function") {
    return failResult(command, "INVOKE_METHOD_UNSUPPORTED", `driver.${method}`);
  }
  const value = await (driverFn as (...a: unknown[]) => Promise<unknown>).apply(driver, args);
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "selenium", mode: "real", invokeMode: "method", target, method, value: serializeRpcResult(value) }
  };
}

const seleniumPlugin: DriverPlugin = {
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

  async execute(session: DriverSession, command: CommandEnvelope): Promise<CommandResult> {
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
      let state: SeleniumSessionState;
      try {
        state = await getOrCreateDriver(session.id, payload);
      } catch (error) {
        return failResult(
          command,
          "DRIVER_START_FAILED",
          error instanceof Error ? error.message : String(error)
        );
      }
      try {
        return await runInvoke(command, state);
      } catch (error) {
        return failResult(command, "INVOKE_FAILED", error instanceof Error ? error.message : String(error));
      }
    }

    if (wantsMock(payload)) {
      return runMock(command);
    }

    let state: SeleniumSessionState;
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
      return failResult(command, "DRIVER_NOT_READY", "selenium driver is not available");
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
        const screenshotPath =
          getString(payload.screenshotPath) ?? path.join(process.cwd(), "artifacts", `selenium-${Date.now()}.png`);
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        const image = await driver.takeScreenshot();
        await fs.writeFile(screenshotPath, image, "base64");
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "selenium", command: cmd, mode: "real", screenshotPath }
        };
      } else if (cmd === "wait") {
        const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 3000;
        await driver.sleep(timeoutMs);
      } else if (cmd === "back") {
        await driver.navigate().back();
      } else if (cmd === "reload") {
        await driver.navigate().refresh();
      } else if (cmd === "forward") {
        await driver.navigate().forward();
      } else if (cmd === "newTab") {
        await driver.switchTo().newWindow("tab");
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
        await driver.actions({ bridge: true }).move({ origin: el }).perform();
      } else if (cmd === "press") {
        const key = getString(payload.key) ?? "Enter";
        const el = await findElement(driver, payload);
        const sw = await loadSeleniumModule();
        const keys = sw.Key ?? (await import("selenium-webdriver")).Key;
        const keyConst = (keys as unknown as Record<string, string>)[key] ?? key;
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
        return failResult(command, "UNSUPPORTED_COMMAND", `unsupported command: ${cmd}`);
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

  async destroySession(session: DriverSession) {
    const state = sessions.get(session.id);
    if (!state?.driver) {
      sessions.delete(session.id);
      return;
    }
    await state.driver.quit().catch(() => undefined);
    sessions.delete(session.id);
  },

  async dispose() {
    for (const [, state] of sessions) {
      if (state.driver) {
        await state.driver.quit().catch(() => undefined);
      }
    }
    sessions.clear();
  }
};

export default seleniumPlugin;
