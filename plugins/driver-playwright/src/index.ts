import type { CommandEnvelope, CommandResult, InvokePayload } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import {
  buildSessionKey,
  getString,
  mergeOptionsIntoPayload,
  normalizeInvokePayload,
  resolveLocalBrowserFields,
  serializeRpcResult
} from "@ada/driver-rpc";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

type PlaywrightBrowserKind = "chromium" | "firefox" | "webkit";

interface PlaywrightSession {
  browser: any | null;
  context: any;
  page: any;
  headless: boolean;
  browserKind: PlaywrightBrowserKind;
  persistent: boolean;
  connectedOverCdp: boolean;
  sessionKey: string;
  playwrightModule: any;
  localBrowser?: {
    cdpEndpoint?: string;
    executablePath?: string;
    channel?: string;
    userDataDir?: string;
  };
}

const sessions = new Map<string, PlaywrightSession>();
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
  "uploadFile",
  "dragDrop",
  "wait",
  "assertText",
  "getText",
  "back",
  "reload",
  "closeTab",
  "custom"
] as const;

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
    // fall through
  }

  return await new Function('return import("playwright")')();
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function locatorFromPayload(page: any, payload?: Record<string, unknown>): any {
  const locatorObj = asRecord(payload?.locator);
  if (Object.keys(locatorObj).length === 0) {
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
  const merged = mergeOptionsIntoPayload(payload);
  if (typeof merged.headless === "boolean") {
    return merged.headless;
  }
  return process.env.ADA_PLAYWRIGHT_HEADLESS !== "false";
}

function parseBrowserKind(payload?: Record<string, unknown>): PlaywrightBrowserKind {
  const merged = mergeOptionsIntoPayload(payload);
  const raw = (getString(merged.browser) ?? process.env.ADA_PLAYWRIGHT_BROWSER ?? "chromium").toLowerCase();
  if (raw === "firefox" || raw === "webkit") {
    return raw;
  }
  return "chromium";
}

async function resolveStorageState(payload?: Record<string, unknown>): Promise<unknown | undefined> {
  const merged = mergeOptionsIntoPayload(payload);
  const pathStr = getString(merged.storageStatePath);
  if (pathStr) {
    const raw = await fs.readFile(pathStr, "utf8");
    return JSON.parse(raw) as unknown;
  }
  if (merged.storageState !== undefined) {
    return merged.storageState;
  }
  return undefined;
}

async function closePlaywrightSession(pw: PlaywrightSession): Promise<void> {
  if (pw.connectedOverCdp) {
    await pw.browser?.close().catch(() => undefined);
    return;
  }
  await pw.context.close().catch(() => undefined);
  if (!pw.persistent && pw.browser) {
    await pw.browser.close().catch(() => undefined);
  }
}

function applyLocalLaunchOverrides(
  baseLaunch: Record<string, unknown>,
  local: ReturnType<typeof resolveLocalBrowserFields>,
  browserKind: PlaywrightBrowserKind
): void {
  if (local.executablePath) {
    baseLaunch.executablePath = local.executablePath;
  }
  if (local.channel && browserKind === "chromium") {
    baseLaunch.channel = local.channel;
  }
}

async function createPlaywrightSession(
  playwrightModule: any,
  payload?: Record<string, unknown>
): Promise<PlaywrightSession> {
  const merged = mergeOptionsIntoPayload(payload);
  const local = resolveLocalBrowserFields(merged);
  const browserKind = parseBrowserKind(merged);
  const headless = parseHeadless(merged);
  const launchOptions = asRecord(merged.launchOptions);
  const contextOptions = { ...asRecord(merged.contextOptions) };
  const storageState = await resolveStorageState(merged);
  if (storageState !== undefined) {
    contextOptions.storageState = storageState;
  }

  const sessionKey = buildSessionKey(merged);
  const localBrowser = {
    cdpEndpoint: local.cdpEndpoint || undefined,
    executablePath: local.executablePath || undefined,
    channel: local.channel || undefined,
    userDataDir: local.userDataDir || undefined
  };

  if (local.cdpEndpoint) {
    const chromium = playwrightModule.chromium;
    if (!chromium?.connectOverCDP) {
      throw new Error("connectOverCDP requires playwright chromium (set browser=chromium or use Chrome CDP URL)");
    }
    const connectOptions = asRecord(merged.connectOptions);
    const browser = await chromium.connectOverCDP(local.cdpEndpoint, connectOptions);
    const contexts = browser.contexts();
    const context = contexts[0] ?? (await browser.newContext(contextOptions));
    const pages = context.pages();
    const page = pages[0] ?? (await context.newPage());
    return {
      browser,
      context,
      page,
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
  const baseLaunch: Record<string, unknown> = { headless, ...launchOptions };
  applyLocalLaunchOverrides(baseLaunch, local, browserKind);

  if (userDataDir) {
    if (!launcher?.launchPersistentContext) {
      throw new Error(`launchPersistentContext not available for ${browserKind}`);
    }
    const context = await launcher.launchPersistentContext(userDataDir, {
      ...baseLaunch,
      ...contextOptions
    });
    const pages = context.pages();
    const page = pages[0] ?? (await context.newPage());
    return {
      browser: typeof context.browser === "function" ? context.browser() : null,
      context,
      page,
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

async function ensurePlaywrightSession(session: DriverSession, payload?: Record<string, unknown>): Promise<PlaywrightSession> {
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

function resolvePlaywrightTarget(pw: PlaywrightSession, invoke: InvokePayload): any {
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

async function executePlaywrightInvoke(
  command: CommandEnvelope,
  pw: PlaywrightSession,
  payload?: Record<string, unknown>
): Promise<CommandResult> {
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

function failResult(command: CommandEnvelope, code: string, message: string): CommandResult {
  return {
    requestId: command.requestId,
    success: false,
    errorCode: code,
    errorMessage: message
  };
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

const playwrightPlugin: DriverPlugin = {
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

  async init() {},

  async createSession(platform): Promise<DriverSession> {
    return { id: `pw-${Date.now()}`, platform };
  },

  async execute(session: DriverSession, command: CommandEnvelope): Promise<CommandResult> {
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
          return failResult(command, "INVALID_PAYLOAD", "navigate requires url");
        }
        await page.goto(url);
      } else if (command.command === "click") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        await locator.click();
      } else if (command.command === "hover") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        await locator.hover();
      } else if (command.command === "type") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const text = getString(payload?.text) ?? "";
        await locator.fill(text);
      } else if (command.command === "press") {
        const key = getString(payload?.key);
        if (!key) {
          return failResult(command, "INVALID_PAYLOAD", "press requires key");
        }
        if (locator) {
          await locator.press(key);
        } else {
          await page.keyboard.press(key);
        }
      } else if (command.command === "select") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
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
          return failResult(command, "INVALID_PAYLOAD", "select requires value, label, or index");
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
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const filePath = getString(payload?.filePath);
        const filePaths = getStringArray(payload?.filePaths);
        const targetPaths = filePaths.length > 0 ? filePaths : filePath ? [filePath] : [];
        if (targetPaths.length === 0) {
          return failResult(command, "INVALID_PAYLOAD", "uploadFile requires filePath or filePaths");
        }
        await locator.setInputFiles(targetPaths);
      } else if (command.command === "dragDrop") {
        const sourceLocatorObj = asRecord(payload?.sourceLocator ?? payload?.fromLocator);
        const targetLocatorObj = asRecord(payload?.targetLocator ?? payload?.toLocator);
        const source = Object.keys(sourceLocatorObj).length > 0 ? locatorFromPayload(page, { locator: sourceLocatorObj }) : locator;
        const target =
          Object.keys(targetLocatorObj).length > 0 ? locatorFromPayload(page, { locator: targetLocatorObj }) : undefined;
        if (!source || !target) {
          return failResult(command, "LOCATOR_NOT_FOUND", "dragDrop requires source and target locator");
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
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const visible = await locator.isVisible();
        if (!visible) {
          return failResult(command, "ASSERT_NOT_VISIBLE", "Target element is not visible.");
        }
      } else if (command.command === "assertText") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const expected = getString(payload?.expectedText);
        if (!expected) {
          return failResult(command, "INVALID_PAYLOAD", "assertText requires expectedText");
        }
        const actual = (await locator.textContent()) ?? "";
        if (!actual.includes(expected)) {
          return failResult(command, "ASSERT_TEXT_MISMATCH", `Expected text to include "${expected}", got "${actual}"`);
        }
      } else if (command.command === "getText") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const text = (await locator.textContent()) ?? "";
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "playwright", command: command.command, mode: "real", text, headless: pw.headless, browser: pw.browserKind }
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
        if (action === "invoke" || (payload?.method && !action)) {
          return executePlaywrightInvoke(command, pw, payload);
        }
        if (action === "evaluate") {
          const script = getString(payload?.script);
          if (!script) {
            return failResult(command, "INVALID_PAYLOAD", "evaluate requires script");
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
        return failResult(
          command,
          "UNSUPPORTED_COMMAND",
          "unsupported custom action; use action=evaluate|invoke or command=invoke"
        );
      } else {
        return failResult(command, "UNSUPPORTED_COMMAND", `unsupported command: ${cmd}`);
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
      return failResult(command, "COMMAND_FAILED", error instanceof Error ? error.message : String(error));
    }
  },

  async destroySession(session: DriverSession) {
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

export default playwrightPlugin;
