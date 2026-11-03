import type { CommandEnvelope, CommandResult, InvokePayload } from "@ada/contracts";
import type { DriverSession } from "@ada/plugin-sdk";
import {
  buildSessionKey,
  ensureCdpEndpointReady,
  getString,
  mergeOptionsIntoPayload,
  normalizeInvokePayload,
  parseCdpEndpoint,
  probeCdpEndpoint,
  defaultCdpPort,
  resolveCdpAutoLaunchPlan,
  resolveCdpBrowserFamily,
  resolveLocalBrowserFields,
  resolvePlaywrightBringToFront,
  resolvePlaywrightHeadless,
  serializeRpcResult,
  stopCdpSpawn,
  cleanupAllCdpSpawns,
  cleanupAllCdpSpawnsDetached,
  forceKillProcessTree,
  forceKillProcessTreeDetached,
  shouldReleaseSessionOnTimeout,
  type CdpSpawnHandle
} from "@ada/driver-rpc";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

type PlaywrightBrowserKind = "chromium" | "firefox" | "webkit";

export interface PlaywrightSession {
  browser: any | null;
  context: any;
  page: any;
  headless: boolean;
  browserKind: PlaywrightBrowserKind;
  persistent: boolean;
  connectedOverCdp: boolean;
  sessionKey: string;
  /** 启动时的 channel/headless 等，后续命令未传时沿用，避免 newTab 等触发重建浏览器 */
  launchPayload: Record<string, unknown>;
  playwrightModule: any;
  localBrowser?: {
    cdpEndpoint?: string;
    cdpAutoLaunch?: boolean;
    executablePath?: string;
    channel?: string;
    userDataDir?: string;
  };
  cdpSpawn?: CdpSpawnHandle | null;
}

const sessions = new Map<string, PlaywrightSession>();
const localRequire = createRequire(typeof __filename === "string" ? __filename : process.cwd());

export const SEMANTIC_COMMANDS = [
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
  "custom",
  "recipe"
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

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

import {
  autoWaitEnabled,
  autoWaitLocator,
  locatorFromPayload,
  resolveAutoWaitMs,
  summarizeLocator
} from "./playwright-locator.js";
import { executeClickPath, executeFillSearch, waitAfterNavigation } from "./web-interaction-recipe.js";
import { gotoPage } from "./web-navigation.js";
import { executeDismissPopups } from "./web-dismiss-popups.js";

function parseHeadless(payload?: Record<string, unknown>): boolean {
  return resolvePlaywrightHeadless(payload);
}

function shouldForceMaximize(payload?: Record<string, unknown>): boolean {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const direct = p.maximize;
  const fromOptions = options.maximize;
  if (typeof direct === "boolean") return direct;
  if (typeof fromOptions === "boolean") return fromOptions;
  const state = String(p.windowState ?? options.windowState ?? "").toLowerCase();
  return state === "maximized";
}

/**
 * CDP 默认每个 ADA session 新建 context（并发隔离）。
 * 仅当 reuseCdpContext=true（或 ADA_PLAYWRIGHT_REUSE_CDP_CONTEXT=true）时复用已有 context。
 * 复用模式下：viewport:null  alone 仍视为「无实质 options」，不 newContext。
 */
export function shouldCreateCdpContext(
  contextOptions: Record<string, unknown>,
  payload?: Record<string, unknown>
): boolean {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const reuseExplicit =
    typeof p.reuseCdpContext === "boolean"
      ? p.reuseCdpContext
      : typeof options.reuseCdpContext === "boolean"
        ? options.reuseCdpContext
        : undefined;
  const reuseEnv = process.env.ADA_PLAYWRIGHT_REUSE_CDP_CONTEXT?.trim().toLowerCase();
  const reuse =
    reuseExplicit === true ||
    (reuseExplicit !== false && (reuseEnv === "1" || reuseEnv === "true"));
  if (!reuse) {
    return true;
  }
  const keys = Object.keys(contextOptions);
  if (keys.length === 0) return false;
  if (keys.length === 1 && "viewport" in contextOptions && contextOptions.viewport === null) {
    return false;
  }
  return true;
}

async function forceMaximizeWindowIfNeeded(
  pw: PlaywrightSession,
  payload?: Record<string, unknown>
): Promise<void> {
  if (pw.headless || pw.browserKind !== "chromium" || !shouldForceMaximize(payload)) {
    return;
  }
  try {
    const cdp = await pw.context.newCDPSession(pw.page);
    const info = await cdp.send("Browser.getWindowForTarget");
    const windowId = Number((info as { windowId?: number }).windowId ?? 0);
    if (windowId > 0) {
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "maximized" } });
    }
    if (typeof cdp.detach === "function") {
      await cdp.detach().catch(() => undefined);
    }
  } catch {
    // 某些宿主或通道不支持窗口控制，忽略并继续
  }
}

export async function focusVisibleBrowser(pw: PlaywrightSession, payload?: Record<string, unknown>): Promise<void> {
  if (pw.headless || !resolvePlaywrightBringToFront(payload)) {
    return;
  }
  const bringOnce = async (): Promise<void> => {
    await pw.page.bringToFront().catch(() => undefined);
    try {
      const browser = pw.browser ?? (typeof pw.context?.browser === "function" ? pw.context.browser() : null);
      if (browser && typeof browser.bringToFront === "function") {
        await browser.bringToFront();
      }
    } catch {
      // ignore
    }
    await pw.page.evaluate(() => window.focus()).catch(() => undefined);
  };
  await bringOnce();
  // Windows：从 MCP/IDE 子进程 launch 时 SetForegroundWindow 常被拒，短延迟后再试一次
  if (process.platform === "win32") {
    await sleepMs(200);
    await bringOnce();
  }
}

function defaultCdpPortForPayload(payload?: Record<string, unknown>): number {
  return defaultCdpPort(resolveCdpBrowserFamily(payload));
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

const CLOSE_SESSION_MS = Number(process.env.ADA_PLAYWRIGHT_CLOSE_TIMEOUT_MS ?? 15_000);

/** 为 true 时跳过优雅 close，立即 detached 杀进程（与 forceDispose 配合） */
let forceShutdown = false;

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function forceKillPlaywrightProcess(pw: PlaywrightSession): Promise<void> {
  forceKillPlaywrightProcessDetached(pw);
}

export function forceKillPlaywrightProcessDetached(pw: PlaywrightSession): void {
  try {
    const browser =
      pw.browser ?? (typeof pw.context?.browser === "function" ? pw.context.browser() : null);
    const proc = browser && typeof browser.process === "function" ? browser.process() : undefined;
    if (proc?.pid) {
      forceKillProcessTreeDetached(proc.pid);
    }
  } catch {
    // ignore
  }
  if (pw.cdpSpawn?.pid) {
    forceKillProcessTreeDetached(pw.cdpSpawn.pid);
    pw.cdpSpawn = null;
  }
}

export async function closePlaywrightSessionBody(pw: PlaywrightSession): Promise<void> {
  if (pw.connectedOverCdp) {
    const connected =
      pw.browser && typeof pw.browser.isConnected === "function" ? pw.browser.isConnected() : true;
    if (!connected) {
      if (pw.cdpSpawn) {
        await stopCdpSpawn(pw.cdpSpawn);
        pw.cdpSpawn = null;
      }
      return;
    }
    await pw.browser?.close().catch(() => undefined);
    if (pw.cdpSpawn) {
      await stopCdpSpawn(pw.cdpSpawn);
      pw.cdpSpawn = null;
    }
    return;
  }
  await pw.context.close().catch(() => undefined);
  if (!pw.persistent && pw.browser) {
    await pw.browser.close().catch(() => undefined);
  }
}

/** 带超时的会话关闭；超时后强制结束浏览器进程，避免脚本卡死 */
async function closePlaywrightSession(pw: PlaywrightSession): Promise<void> {
  if (forceShutdown) {
    forceKillPlaywrightProcessDetached(pw);
    return;
  }
  try {
    await Promise.race([
      closePlaywrightSessionBody(pw),
      sleepMs(CLOSE_SESSION_MS).then(() => {
        throw new Error(`PLAYWRIGHT_CLOSE_TIMEOUT after ${CLOSE_SESSION_MS}ms`);
      })
    ]);
  } catch {
    forceKillPlaywrightProcessDetached(pw);
  }
}

export async function releasePlaywrightDriverSession(driverSessionId: string): Promise<void> {
  const pw = sessions.get(driverSessionId);
  if (!pw) {
    return;
  }
  sessions.delete(driverSessionId);
  await closePlaywrightSession(pw);
}

/**
 * 可恢复错误：保持浏览器会话，避免短 locator 未命中时反复 launch。
 * 打开页 / wait / 长时间前置条件等待超时 → 不可恢复，调用方应释放连接。
 */
export function isRecoverableInteractionError(error: unknown, command?: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (
    shouldReleaseSessionOnTimeout({
      command,
      errorMessage: message,
      errorCode: /timeout|timed out/i.test(message) ? "TIMEOUT" : undefined
    })
  ) {
    return false;
  }
  return /timeout|locator|not found|not visible|not enabled|strict mode violation|intercepts pointer events/i.test(
    message
  );
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

  const cdpPlan = resolveCdpAutoLaunchPlan(merged);
  let cdpUrl = local.cdpEndpoint ? parseCdpEndpoint(local.cdpEndpoint, defaultCdpPortForPayload(merged)).url : "";
  let cdpSpawn: CdpSpawnHandle | null = null;

  try {
  if (cdpPlan) {
    const ready = await ensureCdpEndpointReady(cdpPlan);
    cdpUrl = ready.url;
    cdpSpawn = ready.spawned;
  } else if (cdpUrl) {
    if (!(await probeCdpEndpoint(cdpUrl))) {
      throw new Error(
        `CDP endpoint not reachable at ${cdpUrl}. Set cdpAutoLaunch=true to start ${resolveCdpBrowserFamily(merged)} automatically`
      );
    }
  }

  if (cdpUrl) {
    const chromium = playwrightModule.chromium;
    if (!chromium?.connectOverCDP) {
      throw new Error("connectOverCDP requires playwright chromium module (Chrome/Edge/Firefox CDP)");
    }
    const connectOptions = asRecord(merged.connectOptions);
    const browser = await chromium.connectOverCDP(cdpUrl, connectOptions);
    const contexts = browser.contexts();
    const createNewContext = shouldCreateCdpContext(contextOptions, merged);
    // CDP 默认 newContext（并发隔离）；reuseCdpContext=true 时可复用已有 context
    const context = createNewContext
      ? await browser.newContext(contextOptions)
      : contexts[0] ?? (await browser.newContext(contextOptions));
    const pages = context.pages();
    const page = pages[0] ?? (await context.newPage());
    const cdpBrowser = cdpPlan?.browser ?? resolveCdpBrowserFamily(merged);
    const reportedKind: PlaywrightBrowserKind = cdpBrowser === "firefox" ? "firefox" : "chromium";
    return {
      browser,
      context,
      page,
      headless,
      browserKind: reportedKind,
      persistent: false,
      connectedOverCdp: true,
      sessionKey,
      launchPayload: merged,
      playwrightModule,
      cdpSpawn,
      localBrowser: {
        ...localBrowser,
        cdpEndpoint: cdpUrl,
        cdpAutoLaunch: cdpPlan?.autoLaunch ?? false
      }
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
      launchPayload: merged,
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
    launchPayload: merged,
    playwrightModule,
    localBrowser
  };
  } catch (error) {
    if (cdpSpawn) {
      await stopCdpSpawn(cdpSpawn).catch(() => undefined);
    }
    throw error;
  }
}

export function mergeWithLaunchDefaults(pw: PlaywrightSession, payload?: Record<string, unknown>): Record<string, unknown> {
  return mergeOptionsIntoPayload({ ...pw.launchPayload, ...payload });
}

export async function ensurePlaywrightSession(session: DriverSession, payload?: Record<string, unknown>): Promise<PlaywrightSession> {
  const existed = sessions.get(session.id);
  if (existed) {
    return existed;
  }
  const merged = mergeOptionsIntoPayload(payload);
  const sessionKey = buildSessionKey(merged);

  const playwrightModule = await loadPlaywrightModule();
  try {
    const pwSession = await createPlaywrightSession(playwrightModule, merged);
    sessions.set(session.id, pwSession);
    await forceMaximizeWindowIfNeeded(pwSession, merged);
    await focusVisibleBrowser(pwSession, merged);
    return pwSession;
  } catch (error) {
    sessions.delete(session.id);
    throw error;
  }
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

export async function executePlaywrightInvoke(
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

export async function runMock(command: CommandEnvelope, reason?: string): Promise<CommandResult> {
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

export function failResult(
  command: CommandEnvelope,
  code: string,
  message: string,
  data?: Record<string, unknown>
): CommandResult {
  return {
    requestId: command.requestId,
    success: false,
    errorCode: code,
    errorMessage: message,
    ...(data ? { data } : {})
  };
}

export const LOCATOR_FORMAT_HINT =
  'Use payload.locator.css, payload.selector, or locator: { kind: "css", value: "#id" } (strategy aliases kind).';

async function enrichFailureData(
  page: unknown,
  data?: Record<string, unknown>
): Promise<Record<string, unknown> | undefined> {
  if (!page || typeof page !== "object") {
    return data;
  }
  const p = page as {
    url?: () => string;
    title?: () => Promise<string>;
    evaluate?: (fn: () => unknown) => Promise<unknown>;
  };
  const base = { ...(data ?? {}) };
  try {
    if (typeof p.url === "function") {
      base.url = p.url();
    }
    if (typeof p.title === "function") {
      base.title = await p.title().catch(() => undefined);
    }
    if (typeof p.evaluate === "function") {
      const preview = await p
        .evaluate(() => {
          const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
          return text.slice(0, 800);
        })
        .catch(() => undefined);
      if (typeof preview === "string" && preview.length > 0) {
        base.pageTextPreview = preview;
      }
    }
  } catch {
    // best-effort context for LLM recovery
  }
  return Object.keys(base).length > 0 ? base : undefined;
}

export async function failWithPage(
  command: CommandEnvelope,
  page: unknown,
  code: string,
  message: string,
  data?: Record<string, unknown>
): Promise<CommandResult> {
  const enriched = await enrichFailureData(page, data);
  return failResult(command, code, message, enriched);
}

export function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isTypeClearOp(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) return false;
  return payload.inputOp === "clear" || payload.webInputOp === "clear";
}

export function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export async function destroyPlaywrightSession(session: DriverSession): Promise<void> {
  const existed = sessions.get(session.id);
  if (!existed) return;
  await closePlaywrightSession(existed);
  sessions.delete(session.id);
}

export async function disposePlaywrightRuntime(): Promise<void> {
  for (const [, pw] of sessions) {
    await closePlaywrightSession(pw);
  }
  sessions.clear();
}

export function forceDisposePlaywrightRuntime(): void {
  forceShutdown = true;
  for (const [, pw] of sessions) {
    forceKillPlaywrightProcessDetached(pw);
  }
  sessions.clear();
  cleanupAllCdpSpawnsDetached();
}

export function getPlaywrightSession(sessionId: string): PlaywrightSession | undefined {
  return sessions.get(sessionId);
}

export { executeClickPath, executeFillSearch, observeViewOnPage } from "./web-interaction-recipe.js";
export { locatorFromPayload, summarizeLocator } from "./playwright-locator.js";
