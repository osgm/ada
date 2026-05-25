import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { URL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { closeAllSessions, closeSession, listActiveSessions, runCommand, runTaskset } from "./executor.js";
import { loadAgentConfig } from "./config.js";
import { captureMcpMonitor, type MonitorOptions } from "./monitoring.js";
import { getBuiltInPlugins, getDoctorSnapshot, getHealthSnapshot, installDependencies, runStartFlow } from "@ada/agent-core";
import type { InstallScope } from "@ada/agent/dependency-installer";

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }]
  };
}

let appiumEnsureJob: Promise<void> | null = null;
let persistedHomesCache: { androidHome?: string; appiumHome?: string } | null = null;
let appiumReadyCache: { serverUrl: string; timestamp: number } | null = null;
const APPIUM_READY_CACHE_TTL_MS = 3000;

function isMobilePlatform(v: "web" | "android" | "ios" | "harmony"): boolean {
  return v === "android" || v === "ios" || v === "harmony";
}

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(1200, () => done(false));
  });
}

function parseServerEndpoint(serverUrl: string): { host: string; port: number } {
  const parsed = new URL(serverUrl);
  const host = parsed.hostname;
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  return { host, port };
}

function commandAvailable(command: string): boolean {
  if (path.isAbsolute(command)) {
    return existsSync(command);
  }
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const checked = spawnSync(checker, [command], {
    stdio: "ignore",
    shell: false
  });
  return checked.status === 0;
}

function spawnDetachedChecked(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ ok: true; pid?: number } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        cwd: process.cwd(),
        detached: true,
        stdio: "ignore",
        shell: false,
        env,
        ...(process.platform === "win32" ? ({ windowsHide: true } as const) : {})
      });
      let settled = false;
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
      child.once("spawn", () => {
        if (settled) return;
        settled = true;
        child.unref();
        resolve({ ok: true, pid: child.pid ?? undefined });
      });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}

function resolveAppiumNodeEntrypoint(): string | null {
  const candidates = [
    path.join(process.cwd(), "node_modules", "appium", "build", "lib", "main.js"),
    path.join(process.cwd(), "..", "node_modules", "appium", "build", "lib", "main.js"),
    path.join(process.cwd(), "..", "..", "node_modules", "appium", "build", "lib", "main.js")
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }
  return null;
}

function resolveNodeCommandForChild(): string {
  const isPkg = Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
  return isPkg ? "node" : process.execPath;
}

function loadPersistedHomes(): { androidHome?: string; appiumHome?: string } {
  if (persistedHomesCache) {
    return persistedHomesCache;
  }
  const candidates = [
    path.join(process.cwd(), ".ada-agent", "deps-install-state.json"),
    path.join(process.cwd(), "..", ".ada-agent", "deps-install-state.json")
  ];
  for (const file of candidates) {
    if (!existsSync(file)) {
      continue;
    }
    try {
      const raw = readFileSync(file, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const androidHome = typeof parsed.androidHome === "string" ? parsed.androidHome.trim() : "";
      const appiumHome = typeof parsed.appiumHome === "string" ? parsed.appiumHome.trim() : "";
      persistedHomesCache = {
        androidHome: androidHome || undefined,
        appiumHome: appiumHome || undefined
      };
      return persistedHomesCache;
    } catch {
      // ignore parse errors and continue fallback
    }
  }
  persistedHomesCache = {};
  return persistedHomesCache;
}

function resolveAndroidSdkRoot(): string | null {
  const persisted = loadPersistedHomes();
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const adbLookup = spawnSync(checker, ["adb"], {
    encoding: "utf8",
    shell: false
  });
  const adbPath = (adbLookup.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const adbSdkRoot = adbPath ? path.dirname(path.dirname(adbPath)) : null;

  const candidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    persisted.androidHome,
    adbSdkRoot,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk") : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local", "Android", "Sdk") : null
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  for (const sdkRoot of candidates) {
    if (persisted.androidHome && sdkRoot === persisted.androidHome && existsSync(sdkRoot)) {
      return sdkRoot;
    }
    const platformTools = path.join(sdkRoot, "platform-tools");
    if (existsSync(platformTools)) {
      return sdkRoot;
    }
  }
  return null;
}

function getAppiumExtensionsFile(homeDir: string): string {
  return path.join(homeDir, "node_modules", ".cache", "appium", "extensions.yaml");
}

function hasAppiumDriver(homeDir: string, driverName: string): boolean {
  const file = getAppiumExtensionsFile(homeDir);
  if (!existsSync(file)) {
    return false;
  }
  try {
    const text = readFileSync(file, "utf8");
    return text.toLowerCase().includes(driverName.toLowerCase());
  } catch {
    return false;
  }
}

function resolveAppiumHome(platform: "android" | "ios" | "harmony"): string | null {
  const persisted = loadPersistedHomes();
  const candidates = [
    process.env.APPIUM_HOME,
    persisted.appiumHome,
    process.cwd(),
    process.env.USERPROFILE,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, ".appium") : null
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  const uniq = Array.from(new Set(candidates));

  // 优先选择包含目标平台驱动的目录，避免命中“有 Appium 但无驱动”的 home。
  const targetDriver = platform === "android" ? "uiautomator2" : platform === "ios" ? "xcuitest" : "harmonyos";
  for (const candidate of uniq) {
    if (hasAppiumDriver(candidate, targetDriver)) {
      return candidate;
    }
  }
  // 次优：任意存在 extensions 文件的目录
  for (const candidate of uniq) {
    if (existsSync(getAppiumExtensionsFile(candidate))) {
      return candidate;
    }
  }
  // 最后兜底：使用 APPIUM 默认 home（用户目录），让行为与 appium CLI 一致
  return process.env.USERPROFILE?.trim() || null;
}

async function spawnAppium(host: string, port: number, platform: "android" | "ios" | "harmony"): Promise<{ launched: boolean; details: string }> {
  const nodeEntry = resolveAppiumNodeEntrypoint();
  const candidates: Array<{ cmd: string; args: string[] }> = [];
  if (nodeEntry) {
    candidates.push({
      cmd: resolveNodeCommandForChild(),
      args: [nodeEntry, "--address", host, "--port", String(port), "--relaxed-security"]
    });
  }
  candidates.push({
    cmd: "appium",
    args: ["--address", host, "--port", String(port), "--relaxed-security"]
  });

  const sdkRoot = resolveAndroidSdkRoot();
  const appiumHome = resolveAppiumHome(platform);
  const childEnv = { ...process.env };
  if (sdkRoot) {
    childEnv.ANDROID_SDK_ROOT = childEnv.ANDROID_SDK_ROOT || sdkRoot;
    childEnv.ANDROID_HOME = childEnv.ANDROID_HOME || sdkRoot;
  }
  if (appiumHome) {
    childEnv.APPIUM_HOME = childEnv.APPIUM_HOME || appiumHome;
  }

  const tried: string[] = [];
  for (const candidate of candidates) {
    if (!commandAvailable(candidate.cmd)) {
      tried.push(`${candidate.cmd} (missing)`);
      continue;
    }
    try {      
      // eslint-disable-next-line no-await-in-loop
      const startResult = await spawnDetachedChecked(candidate.cmd, candidate.args, childEnv);
      if (!startResult.ok) {
        tried.push(`${candidate.cmd} (${startResult.error})`);
        continue;
      }
      return {
        launched: true,
        details: `${candidate.cmd} ${candidate.args.join(" ")} pid=${startResult.pid ?? "unknown"} sdkRoot=${sdkRoot ?? "not-found"} appiumHome=${appiumHome ?? "not-found"}`
      };
    } catch (error) {
      tried.push(
        `${candidate.cmd} (${error instanceof Error ? error.message : String(error)})`
      );
    }
  }
  return {
    launched: false,
    details: tried.length > 0 ? tried.join("; ") : "no candidate command available"
  };
}

async function waitPortReady(host: string, port: number, timeoutMs = 15000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(host, port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function checkAppiumStatus(serverUrl: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const url = `${serverUrl.replace(/\/$/, "")}/status`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      return { ok: false, detail: `status http=${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const ready = data.value && typeof data.value === "object" ? asRecord(data.value).ready : undefined;
    if (ready === false) {
      return { ok: false, detail: "status ready=false" };
    }
    return { ok: true, detail: "status ok" };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function ensureAppiumServerReady(platform: "web" | "android" | "ios" | "harmony"): Promise<void> {
  if (!isMobilePlatform(platform)) {
    return;
  }
  if (process.env.ADA_AUTO_START_APPIUM === "0") {
    return;
  }
  if (appiumEnsureJob) {
    await appiumEnsureJob;
    return;
  }

  appiumEnsureJob = (async () => {
    const mobilePlatform = platform as "android" | "ios" | "harmony";
    const config = asRecord(await loadAgentConfig());
    const appium = asRecord(config.appium);
    const serverUrl = typeof appium.serverUrl === "string" && appium.serverUrl.trim()
      ? appium.serverUrl.trim()
      : "http://127.0.0.1:4723";
    if (
      appiumReadyCache &&
      appiumReadyCache.serverUrl === serverUrl &&
      Date.now() - appiumReadyCache.timestamp <= APPIUM_READY_CACHE_TTL_MS
    ) {
      return;
    }
    const { host, port } = parseServerEndpoint(serverUrl);
    console.error(`[ADA-MCP] [appium.ensure] checking ${serverUrl} for platform=${platform}`);
    if (await isPortOpen(host, port)) {
      const status = await checkAppiumStatus(serverUrl);
      console.error(`[ADA-MCP] [appium.ensure] already reachable (${status.detail})`);
      if (status.ok) {
        appiumReadyCache = { serverUrl, timestamp: Date.now() };
      }
      return;
    }
    console.error(`[ADA-MCP] [appium.ensure] not reachable, trying auto-start...`);
    const launched = await spawnAppium(host, port, mobilePlatform);
    console.error(`[ADA-MCP] [appium.ensure] launch result: ${launched.details}`);
    if (!launched.launched) {
      throw new Error(
        `Appium server not reachable at ${serverUrl}. Auto-start failed: ${launched.details}`
      );
    }
    const ready = await waitPortReady(host, port);
    if (!ready) {
      throw new Error(
        `Appium server not reachable at ${serverUrl}. Auto-start attempted but port is still closed.`
      );
    }
    const status = await checkAppiumStatus(serverUrl);
    if (!status.ok) {
      throw new Error(
        `Appium server port is open at ${serverUrl}, but health check failed: ${status.detail}`
      );
    }
    appiumReadyCache = { serverUrl, timestamp: Date.now() };
    console.error(`[ADA-MCP] [appium.ensure] server is ready at ${serverUrl} (${status.detail})`);
  })();

  try {
    await appiumEnsureJob;
  } finally {
    appiumEnsureJob = null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function invokePayloadSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      engine: {
        type: "string",
        enum: ["playwright", "selenium"],
        description: "Web automation backend (default playwright). Use selenium for system Firefox/Chrome via GeckoDriver."
      },
      browserName: {
        type: "string",
        description: "Selenium browser: firefox | chrome | MicrosoftEdge"
      },
      browserBinary: { type: "string", description: "Selenium: path to installed browser executable" },
      profile: { type: "string", description: "Selenium: Firefox profile or Chrome user-data directory" },
      seleniumServerUrl: { type: "string", description: "Selenium Grid / standalone server URL for remote sessions" },
      mode: { type: "string", enum: ["method", "http"], description: "method=Playwright in-process; http=Appium WebDriver route" },
      target: {
        type: "string",
        description: "Playwright handle: page|context|browser|playwright|locator (with payload.locator)"
      },
      method: { type: "string", description: "Playwright method name or required with http.mode" },
      args: { type: "array", items: {}, description: "JSON-serializable method arguments" },
      http: {
        type: "object",
        properties: {
          method: { type: "string" },
          path: { type: "string" },
          body: {}
        },
        required: ["method", "path"],
        description: "Appium WebDriver HTTP passthrough"
      },
      locator: { type: "object" },
      options: { type: "object", additionalProperties: true },
      custom: { type: "object", description: "Legacy Appium HTTP block (method/path/body)" },
      browser: { type: "string", enum: ["chromium", "firefox", "webkit"] },
      headless: { type: "boolean" },
      userDataDir: {
        type: "string",
        description: "Persistent profile directory (Chrome/Firefox user data path) for cookies/cache"
      },
      cdpEndpoint: {
        type: "string",
        description: "Attach to local Chromium via CDP, e.g. http://127.0.0.1:9222 (alias: browserURL, cdpUrl)"
      },
      browserURL: { type: "string", description: "Alias of cdpEndpoint" },
      executablePath: {
        type: "string",
        description: "Local browser executable, e.g. C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      },
      browserPath: { type: "string", description: "Alias of executablePath" },
      channel: {
        type: "string",
        description: "Chromium channel: chrome | msedge | chrome-beta | msedge-beta (uses installed browser)"
      },
      storageStatePath: { type: "string" },
      real: { type: "boolean" },
      serverUrl: { type: "string" },
      capabilities: { type: "object" },
      keepSession: { type: "boolean" }
    },
    additionalProperties: true
  };
}

function mergeWebEngineIntoPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...asRecord(args.payload) };
  if (args.engine !== undefined && payload.engine === undefined) {
    payload.engine = args.engine;
  }
  return payload;
}

function buildInvokeCommandPayload(args: Record<string, unknown>): Record<string, unknown> {
  const nested = asRecord(args.payload);
  const out: Record<string, unknown> = { ...nested };
  const keys = [
    "mode",
    "target",
    "method",
    "args",
    "http",
    "locator",
    "options",
    "custom",
    "browser",
    "headless",
    "userDataDir",
    "cdpEndpoint",
    "browserURL",
    "cdpUrl",
    "executablePath",
    "browserPath",
    "browserExecutable",
    "channel",
    "connectOptions",
    "storageStatePath",
    "storageState",
    "launchOptions",
    "contextOptions",
    "real",
    "serverUrl",
    "capabilities",
    "keepSession",
    "mock",
    "engine",
    "browserName",
    "browserBinary",
    "profile",
    "seleniumServerUrl"
  ];
  for (const key of keys) {
    if (args[key] !== undefined && out[key] === undefined) {
      out[key] = args[key];
    }
  }
  return out;
}

function toCommandEnvelope(input: Record<string, unknown>): CommandEnvelope {
  const payload = asRecord(input.payload);
  return {
    requestId: String(input.requestId ?? `mcp-${Date.now()}`),
    sessionId: String(input.sessionId ?? "mcp-session"),
    platform: normalizePlatform(input.platform),
    command: normalizeCommand(input.command),
    payload
  };
}

function normalizePlatform(v: unknown): "web" | "android" | "ios" | "harmony" {
  if (v === "android" || v === "ios" || v === "harmony") {
    return v;
  }
  return "web";
}

type SupportedCommand =
  | "click"
  | "type"
  | "swipe"
  | "assertVisible"
  | "screenshot"
  | "navigate"
  | "hover"
  | "press"
  | "select"
  | "scroll"
  | "forward"
  | "newTab"
  | "switchTab"
  | "uploadFile"
  | "dragDrop"
  | "wait"
  | "assertText"
  | "getText"
  | "back"
  | "reload"
  | "closeTab"
  | "home"
  | "launchApp"
  | "terminateApp"
  | "custom"
  | "invoke";

const supportedCommands = new Set<string>([
  "click",
  "type",
  "swipe",
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
  "home",
  "launchApp",
  "terminateApp",
  "custom",
  "invoke"
]);

const riskyCommandDefaults = ["custom", "invoke", "launchApp", "terminateApp"];
const riskyCommandAllowlist = new Set<string>(
  (process.env.ADA_MCP_RISKY_COMMAND_WHITELIST ?? riskyCommandDefaults.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);

function normalizeCommand(v: unknown): SupportedCommand {
  if (typeof v === "string" && supportedCommands.has(v)) {
    return v as SupportedCommand;
  }
  return "click";
}

function allowMock(args: Record<string, unknown>): boolean {
  return args.allowMock === true;
}

function ensureRiskAllowed(command: string, args: Record<string, unknown>): void {
  if (!riskyCommandAllowlist.has(command)) {
    return;
  }
  if (args.riskApproved === true) {
    return;
  }
  throw new Error(`Command ${command} is high risk, set riskApproved=true to execute`);
}

function parseInstallScope(v: unknown): InstallScope {
  if (
    v === "all" ||
    v === "playwright" ||
    v === "selenium" ||
    v === "appium" ||
    v === "drivers" ||
    v === "mobile" ||
    v === "android" ||
    v === "ios" ||
    v === "harmony"
  ) {
    return v;
  }
  return "all";
}

function parseMonitorOptions(args: Record<string, unknown>): MonitorOptions {
  const monitor = asRecord(args.monitor);
  return {
    enabled: monitor.enabled === true,
    outputDir: typeof monitor.outputDir === "string" ? monitor.outputDir : "artifacts/monitoring/mcp",
    maxWidth: typeof monitor.maxWidth === "number" ? Math.max(1, monitor.maxWidth) : 1280,
    maxHeight: typeof monitor.maxHeight === "number" ? Math.max(1, monitor.maxHeight) : 720,
    keepAspectRatio: monitor.keepAspectRatio !== false,
    onFailureOnly: monitor.onFailureOnly === true,
    groupBySession: monitor.groupBySession !== false,
    nonBlocking: monitor.nonBlocking !== false
  };
}

function runMonitorCapture(
  command: CommandEnvelope,
  result: CommandResult,
  options: MonitorOptions
): Promise<void> | void {
  const job = captureMcpMonitor(command, result, options, runCommand).then(() => undefined);
  if (options.nonBlocking) {
    job.catch(() => undefined);
    return;
  }
  return job;
}

const perfStats = new Map<string, number[]>();
const PERF_MAX_SAMPLES_PER_LABEL = 500;

function recordPerf(label: string, elapsedMs: number): void {
  const arr = perfStats.get(label) ?? [];
  arr.push(elapsedMs);
  if (arr.length > PERF_MAX_SAMPLES_PER_LABEL) {
    arr.splice(0, arr.length - PERF_MAX_SAMPLES_PER_LABEL);
  }
  perfStats.set(label, arr);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function buildPerfSummary(): Record<string, unknown> {
  const labels = Array.from(perfStats.keys()).sort();
  const items = labels.map((label) => {
    const samples = [...(perfStats.get(label) ?? [])].sort((a, b) => a - b);
    const count = samples.length;
    const total = samples.reduce((acc, n) => acc + n, 0);
    const avg = count > 0 ? total / count : 0;
    return {
      label,
      count,
      avgMs: Number(avg.toFixed(2)),
      p50Ms: percentile(samples, 50),
      p95Ms: percentile(samples, 95),
      maxMs: count > 0 ? samples[count - 1] : 0
    };
  });
  return {
    status: "ok",
    labels: items.length,
    samplesPerLabelMax: PERF_MAX_SAMPLES_PER_LABEL,
    items
  };
}

async function withTiming<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    const elapsed = Date.now() - started;
    recordPerf(label, elapsed);
    console.error(`[ADA-MCP] [perf] ${label} ${elapsed}ms`);
  }
}

async function executeWithTimeout(command: CommandEnvelope, timeoutMs?: number): Promise<CommandResult> {
  const effectiveTimeout = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 0;
  if (effectiveTimeout <= 0) {
    return runCommand(command);
  }
  return Promise.race([
    runCommand(command),
    new Promise<CommandResult>((resolve) => {
      setTimeout(() => {
        resolve({
          requestId: command.requestId,
          success: false,
          errorCode: "MCP_ACTION_TIMEOUT",
          errorMessage: `action timeout after ${effectiveTimeout}ms`
        });
      }, effectiveTimeout);
    })
  ]);
}

function toExtractResponse(input: {
  source: "web" | "mobile";
  mode: string;
  platform?: "web" | "android" | "ios" | "harmony";
  result: CommandResult;
  maxItems?: number;
}): Record<string, unknown> {
  const maxItems = typeof input.maxItems === "number" && input.maxItems > 0 ? input.maxItems : 50;
  const rawValue = (input.result.data as Record<string, unknown> | undefined)?.value;
  const textFromData = (input.result.data as Record<string, unknown> | undefined)?.text;

  let items: unknown[] = [];
  let truncated = false;
  if (Array.isArray(rawValue)) {
    truncated = rawValue.length > maxItems;
    items = rawValue.slice(0, maxItems);
  } else if (rawValue && typeof rawValue === "object") {
    items = [rawValue];
  } else if (typeof rawValue === "string") {
    items = [rawValue];
  } else if (typeof textFromData === "string") {
    items = [textFromData];
  }

  return {
    status: input.result.success ? "ok" : "failed",
    source: input.source,
    mode: input.mode,
    platform: input.platform ?? "web",
    items,
    truncated,
    meta: {
      count: items.length,
      requestId: input.result.requestId,
      success: input.result.success,
      errorCode: input.result.errorCode,
      errorMessage: input.result.errorMessage
    },
    rawResult: input.result
  };
}

function assertRealResult(result: CommandResult, context: string, allowMockMode: boolean): void {
  const mode = (result.data as Record<string, unknown> | undefined)?.mode;
  if (!allowMockMode && mode === "mock") {
    const reason = (result.data as Record<string, unknown> | undefined)?.reason ?? "unknown";
    throw new Error(`${context} fallback to mock is not allowed: ${String(reason)}`);
  }
}

async function loadTaskFile(taskFilePath: string): Promise<CommandEnvelope[]> {
  const raw = await fs.readFile(taskFilePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("task file must be JSON array");
  }
  return parsed.map((item, index) => {
    const obj = asRecord(item);
    if (!obj.requestId || !obj.sessionId) {
      throw new Error(`task[${index}] missing requestId/sessionId`);
    }
    return toCommandEnvelope(obj);
  });
}

let shuttingDown = false;
async function gracefulShutdown(reason: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    console.error(`[ADA-MCP] shutting down: ${reason}`);
    await closeAllSessions();
  } catch (error) {
    console.error("[ADA-MCP] closeAllSessions failed:", error);
  } finally {
    process.exit(0);
  }
}

function normalizeToolName(raw: unknown): string {
  return String(raw ?? "").trim();
}

function normalizeHealthScope(v: unknown): "web" | "mobile" | "all" {
  if (v === "web" || v === "mobile" || v === "all") {
    return v;
  }
  // MCP 默认偏 Web 场景，避免未使用移动能力时触发不必要检查告警
  return "web";
}

function scopedHealthSnapshot(snapshot: Record<string, unknown>, scope: "web" | "mobile" | "all"): Record<string, unknown> {
  if (scope === "all") {
    return snapshot;
  }
  const out: Record<string, unknown> = { ...snapshot, dependencyScope: scope };
  const deps = asRecord(snapshot.dependencies);
  if (scope === "web") {
    out.dependencies = {
      playwrightInstalled: deps.playwrightInstalled,
      playwrightLaunchOk: deps.playwrightLaunchOk,
      seleniumWebdriverInstalled: deps.seleniumWebdriverInstalled,
      geckodriverOk: deps.geckodriverOk,
      chromedriverOk: deps.chromedriverOk
    };
    return out;
  }
  out.dependencies = {
    appiumInstalled: deps.appiumInstalled,
    appiumCliOk: deps.appiumCliOk,
    appiumDriversOk: deps.appiumDriversOk,
    missingAppiumDrivers: deps.missingAppiumDrivers
  };
  return out;
}

function wireAdaMcpProtocolServer(mcp: Server): void {
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ada_health",
      description: "Get ADA agent health snapshot",
      inputSchema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["web", "mobile", "all"],
            description: "Dependency check scope (default: web)"
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_diagnostics",
      description: "ADA local runtime diagnostics: Node, Playwright, Appium, and related checks.",
      inputSchema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["web", "mobile", "all"],
            description: "Diagnostic scope hint (default: web)"
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_plugins",
      description: "List built-in ADA driver plugins",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_run_task_file",
      description: "Run ADA task file and return command results",
      inputSchema: {
        type: "object",
        properties: {
          file: { type: "string", description: "Task file path, relative to workspace root or absolute path." },
          allowMock: { type: "boolean", description: "Allow mock fallback results instead of strict real-only mode." },
          monitor: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              outputDir: { type: "string" },
              maxWidth: { type: "number" },
              maxHeight: { type: "number" },
              keepAspectRatio: { type: "boolean" },
              onFailureOnly: { type: "boolean" },
              groupBySession: { type: "boolean" },
              nonBlocking: { type: "boolean" }
            },
            additionalProperties: false
          }
        },
        required: ["file"],
        additionalProperties: false
      }
    },
    {
      name: "ada_execute",
      description: "Execute one ADA command envelope for web/mobile",
      inputSchema: {
        type: "object",
        properties: {
          requestId: { type: "string" },
          sessionId: { type: "string" },
          platform: { type: "string", enum: ["web", "android", "ios", "harmony"] },
          command: {
            type: "string",
            enum: [
              "click",
              "type",
              "swipe",
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
              "home",
              "launchApp",
              "terminateApp",
              "custom",
              "invoke"
            ]
          },
          payload: { type: "object" },
          allowMock: { type: "boolean", description: "Allow mock fallback results instead of strict real-only mode." },
          riskApproved: { type: "boolean", description: "Acknowledge high-risk command execution" },
          monitor: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              outputDir: { type: "string" },
              maxWidth: { type: "number" },
              maxHeight: { type: "number" },
              keepAspectRatio: { type: "boolean" },
              onFailureOnly: { type: "boolean" },
              groupBySession: { type: "boolean" },
              nonBlocking: { type: "boolean" }
            },
            additionalProperties: false
          }
        },
        required: ["platform", "command"],
        additionalProperties: false
      }
    },
    {
      name: "ada_invoke",
      description:
        "Unified driver RPC: Playwright method (web, mode=method), Selenium method/http (web, engine=selenium), Appium HTTP (mobile). Covers native APIs beyond semantic commands.",
      inputSchema: {
        type: "object",
        properties: {
          requestId: { type: "string" },
          sessionId: { type: "string" },
          platform: { type: "string", enum: ["web", "android", "ios", "harmony"] },
          mode: { type: "string", enum: ["method", "http"] },
          target: { type: "string" },
          method: { type: "string" },
          args: { type: "array", items: {} },
          http: {
            type: "object",
            properties: {
              method: { type: "string" },
              path: { type: "string" },
              body: {}
            },
            required: ["method", "path"]
          },
          payload: invokePayloadSchema(),
          allowMock: { type: "boolean" },
          riskApproved: { type: "boolean", description: "Required for invoke (high risk)" },
          monitor: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              outputDir: { type: "string" },
              maxWidth: { type: "number" },
              maxHeight: { type: "number" },
              keepAspectRatio: { type: "boolean" },
              onFailureOnly: { type: "boolean" },
              groupBySession: { type: "boolean" },
              nonBlocking: { type: "boolean" }
            },
            additionalProperties: false
          }
        },
        required: ["platform"],
        additionalProperties: false
      }
    },
    {
      name: "ada_web_action",
      description: "Convenience tool: execute web action (default engine=playwright; use engine=selenium for system browser)",
      inputSchema: {
        type: "object",
        properties: {
          engine: { type: "string", enum: ["playwright", "selenium"] },
          command: {
            type: "string",
            enum: [
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
          sessionId: { type: "string" },
          requestId: { type: "string" },
          payload: invokePayloadSchema(),
          allowMock: { type: "boolean", description: "Allow mock fallback results instead of strict real-only mode." },
          riskApproved: { type: "boolean", description: "Acknowledge high-risk command execution" },
          monitor: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              outputDir: { type: "string" },
              maxWidth: { type: "number" },
              maxHeight: { type: "number" },
              keepAspectRatio: { type: "boolean" },
              onFailureOnly: { type: "boolean" },
              groupBySession: { type: "boolean" },
              nonBlocking: { type: "boolean" }
            },
            additionalProperties: false
          }
        },
        required: ["command"],
        additionalProperties: false
      }
    },
    {
      name: "ada_mobile_action",
      description: "Convenience tool: execute mobile action via driver-appium",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["android", "ios", "harmony"] },
          command: {
            type: "string",
            enum: [
              "click",
              "type",
              "swipe",
              "assertVisible",
              "screenshot",
              "wait",
              "assertText",
              "getText",
              "back",
              "home",
              "launchApp",
              "terminateApp",
              "custom"
            ]
          },
          sessionId: { type: "string" },
          requestId: { type: "string" },
          payload: { type: "object" },
          allowMock: { type: "boolean", description: "Allow mock fallback results instead of strict real-only mode." },
          riskApproved: { type: "boolean", description: "Acknowledge high-risk command execution" },
          monitor: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              outputDir: { type: "string" },
              maxWidth: { type: "number" },
              maxHeight: { type: "number" },
              keepAspectRatio: { type: "boolean" },
              onFailureOnly: { type: "boolean" },
              groupBySession: { type: "boolean" },
              nonBlocking: { type: "boolean" }
            },
            additionalProperties: false
          }
        },
        required: ["platform", "command"],
        additionalProperties: false
      }
    },
    {
      name: "ada_config",
      description: "Read effective ADA agent configuration",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_install_deps",
      description: "Install ADA runtime dependencies (playwright/selenium/appium/drivers)",
      inputSchema: {
        type: "object",
        properties: {
          only: {
            type: "string",
            enum: ["all", "playwright", "selenium", "mobile", "android", "ios", "harmony", "appium", "drivers"],
            description: "Install scope"
          },
          force: { type: "boolean", description: "Force reinstall selected scope" },
          nativeDriversDir: {
            type: "string",
            description: "Native WebDriver directory (default dirver at workspace root)"
          },
          geckodriverVersion: {
            type: "string",
            description: "GeckoDriver version: 0.36.0 | latest | skip"
          },
          chromedriverVersion: {
            type: "string",
            description: "ChromeDriver major: 137 | 135 | match-chrome | latest | skip"
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_start_once",
      description: "Run ADA agent in start --once mode (non-watch)",
      inputSchema: {
        type: "object",
        properties: {
          localDev: { type: "boolean", description: "Skip credential requirement for local debug" },
          skipDeps: { type: "boolean", description: "Skip dependency auto-install check on start" }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_sessions",
      description: "List active in-memory driver sessions",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_close_session",
      description: "Close one active session by platform + sessionId (web: optional engine playwright|selenium)",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["web", "android", "ios", "harmony"] },
          sessionId: { type: "string" },
          engine: {
            type: "string",
            enum: ["playwright", "selenium"],
            description: "Web only: which engine session to close (default playwright)"
          },
          payload: { type: "object", description: "Optional; engine may also be set here" }
        },
        required: ["platform", "sessionId"],
        additionalProperties: false
      }
    },
    {
      name: "ada_close_all_sessions",
      description: "Close all active in-memory sessions",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_batch_actions",
      description: "Run multiple actions in one request with optional continue-on-error",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["web", "android", "ios", "harmony"] },
          sessionId: { type: "string" },
          continueOnError: { type: "boolean" },
          onFailure: { type: "string", enum: ["stop", "continue"] },
          allowMock: { type: "boolean" },
          riskApproved: { type: "boolean" },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                requestId: { type: "string" },
                command: { type: "string" },
                payload: { type: "object" },
                timeoutMs: { type: "number" },
                retry: { type: "number" }
              },
              required: ["command"],
              additionalProperties: false
            }
          }
        },
        required: ["platform", "sessionId", "actions"],
        additionalProperties: false
      }
    },
    {
      name: "ada_extract",
      description: "Extract text/list/table data from current web page",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          mode: { type: "string", enum: ["text", "list", "table"] },
          payload: { type: "object" },
          allowMock: { type: "boolean" },
          riskApproved: { type: "boolean" }
        },
        required: ["sessionId", "mode"],
        additionalProperties: false
      }
    },
    {
      name: "ada_assertions",
      description: "Run assertion helpers on web page (visible/text/url)",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          type: { type: "string", enum: ["visible", "text", "url"] },
          payload: { type: "object" },
          allowMock: { type: "boolean" },
          riskApproved: { type: "boolean" }
        },
        required: ["sessionId", "type"],
        additionalProperties: false
      }
    },
    {
      name: "ada_mobile_extract",
      description: "Extract data from mobile session (text/pageSource)",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["android", "ios", "harmony"] },
          sessionId: { type: "string" },
          type: { type: "string", enum: ["text", "pageSource"] },
          payload: { type: "object" },
          allowMock: { type: "boolean" },
          riskApproved: { type: "boolean" }
        },
        required: ["platform", "sessionId", "type"],
        additionalProperties: false
      }
    },
    {
      name: "ada_mobile_assertions",
      description: "Run assertion helpers on mobile session (visible/text)",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["android", "ios", "harmony"] },
          sessionId: { type: "string" },
          type: { type: "string", enum: ["visible", "text"] },
          payload: { type: "object" },
          allowMock: { type: "boolean" },
          riskApproved: { type: "boolean" }
        },
        required: ["platform", "sessionId", "type"],
        additionalProperties: false
      }
    },
    {
      name: "ada_risk_policy",
      description: "View or update risky command allowlist",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["view", "add", "remove", "reset"] },
          command: { type: "string" }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_perf_summary",
      description: "Get in-memory MCP performance summary (avg/p50/p95/max)",
      inputSchema: {
        type: "object",
        properties: {
          reset: { type: "boolean", description: "Clear in-memory samples after reading summary" }
        },
        additionalProperties: false
      }
    }
  ]
}));

mcp.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const tool = normalizeToolName(request.params.name);
  const args = asRecord(request.params.arguments);

  if (tool === "ada_health") {
    const scope = normalizeHealthScope(args.scope);
    return textResult(scopedHealthSnapshot((await getHealthSnapshot()) as Record<string, unknown>, scope));
  }
  if (tool === "ada_diagnostics") {
    const scope = normalizeHealthScope(args.scope);
    const report = (await getDoctorSnapshot()) as Record<string, unknown>;
    const checks = asRecord(report.checks);
    if (scope === "web") {
      return textResult({
        ...report,
        dependencyScope: "web",
        checks: {
          playwrightBrowser: checks.playwrightBrowser,
          playwrightPackage: checks.playwrightPackage,
          nodeRuntime: checks.nodeRuntime
        }
      });
    }
    if (scope === "mobile") {
      return textResult({
        ...report,
        dependencyScope: "mobile",
        checks: {
          appiumServer: checks.appiumServer,
          javaRuntime: checks.javaRuntime,
          appiumDrivers: checks.appiumDrivers,
          appiumPackage: checks.appiumPackage
        }
      });
    }
    return textResult(report);
  }
  if (tool === "ada_plugins") {
    return textResult(getBuiltInPlugins());
  }
  if (tool === "ada_config") {
    return textResult(await loadAgentConfig());
  }
  if (tool === "ada_install_deps") {
    const only = parseInstallScope(args.only);
    const force = args.force === true;
    const logs: string[] = [];
    const summary = await installDependencies(only, force, (line: string) => logs.push(line), {
      ...(typeof args.nativeDriversDir === "string" ? { nativeDriversDir: args.nativeDriversDir } : {}),
      ...(typeof args.geckodriverVersion === "string" ? { geckodriverVersion: args.geckodriverVersion } : {}),
      ...(typeof args.chromedriverVersion === "string" ? { chromedriverVersion: args.chromedriverVersion } : {})
    });
    return textResult({
      status: "ok",
      only,
      force,
      logLines: logs.length,
      logs,
      summary
    });
  }
  if (tool === "ada_start_once") {
    const localDev = args.localDev === true;
    const skipDeps = args.skipDeps !== false;
    await runStartFlow({ runOnce: true, localDev, skipDeps, runWatch: false });
    return textResult({
      status: "ok",
      mode: "once",
      localDev,
      skipDeps
    });
  }
  if (tool === "ada_sessions") {
    const sessions = listActiveSessions();
    return textResult({ count: sessions.length, sessions });
  }
  if (tool === "ada_close_session") {
    const platform = normalizePlatform(args.platform);
    const sessionId = String(args.sessionId ?? "");
    if (!sessionId) {
      throw new Error("sessionId is required");
    }
    const payload = mergeWebEngineIntoPayload(args);
    const engine =
      platform === "web" && typeof payload.engine === "string" ? (payload.engine as "playwright" | "selenium") : undefined;
    const closed = await closeSession(platform, sessionId, { engine, payload });
    return textResult({ status: "ok", closed, platform, sessionId, engine });
  }
  if (tool === "ada_close_all_sessions") {
    const closed = await closeAllSessions();
    return textResult({ status: "ok", closed });
  }
  if (tool === "ada_risk_policy") {
    const action = typeof args.action === "string" ? args.action : "view";
    const command = typeof args.command === "string" ? args.command : "";
    if (action === "add" && command) {
      riskyCommandAllowlist.add(command);
    } else if (action === "remove" && command) {
      riskyCommandAllowlist.delete(command);
    } else if (action === "reset") {
      riskyCommandAllowlist.clear();
      for (const item of riskyCommandDefaults) {
        riskyCommandAllowlist.add(item);
      }
    }
    return textResult({
      status: "ok",
      action,
      allowlist: Array.from(riskyCommandAllowlist.values()).sort()
    });
  }
  if (tool === "ada_perf_summary") {
    const summary = buildPerfSummary();
    if (args.reset === true) {
      perfStats.clear();
    }
    return textResult(summary);
  }
  if (tool === "ada_batch_actions") {
    const platform = normalizePlatform(args.platform);
    await withTiming(`ensureAppiumServerReady(${platform})`, () => ensureAppiumServerReady(platform));
    const sessionId = String(args.sessionId ?? "mcp-batch");
    const continueOnError = args.continueOnError === true;
    const onFailure = args.onFailure === "continue" || (args.onFailure !== "stop" && continueOnError) ? "continue" : "stop";
    const actions = Array.isArray(args.actions) ? args.actions : [];
    const results: Array<{ index: number; command: string; attempts: number; result: CommandResult }> = [];
    for (let i = 0; i < actions.length; i += 1) {
      const item = asRecord(actions[i]);
      const command = normalizeCommand(item.command);
      ensureRiskAllowed(command, args);
      const timeoutMs = typeof item.timeoutMs === "number" ? Math.max(0, Math.floor(item.timeoutMs)) : 0;
      const retry = typeof item.retry === "number" ? Math.max(0, Math.floor(item.retry)) : 0;
      let attempts = 0;
      let result: CommandResult = {
        requestId: String(item.requestId ?? `batch-${Date.now()}-${i}`),
        success: false,
        errorCode: "MCP_BATCH_NOT_EXECUTED",
        errorMessage: "batch action not executed"
      };
      const maxAttempts = retry + 1;
      while (attempts < maxAttempts) {
        attempts += 1;
        const isLastAction = i === actions.length - 1;
        const rawPayload = asRecord(item.payload);
        const envelope = toCommandEnvelope({
          requestId: item.requestId ?? `batch-${Date.now()}-${i}-a${attempts}`,
          sessionId,
          platform,
          command,
          payload:
            platform === "android" || platform === "ios" || platform === "harmony"
              ? { ...rawPayload, keepSession: !isLastAction }
              : rawPayload
        });
        result = await withTiming(`batch-action(${platform}:${command})`, () => executeWithTimeout(envelope, timeoutMs));
        if (result.success) {
          break;
        }
      }
      assertRealResult(result, "ada_batch_actions", allowMock(args));
      results.push({ index: i, command, attempts, result });
      if (!result.success && onFailure === "stop") {
        break;
      }
    }
    const successCount = results.filter((item) => item.result.success).length;
    const failureCount = results.length - successCount;
    const timeoutCount = results.filter((item) => item.result.errorCode === "MCP_ACTION_TIMEOUT").length;
    return textResult({
      status: "ok",
      platform,
      sessionId,
      continueOnError,
      onFailure,
      executed: results.length,
      summary: {
        total: actions.length,
        executed: results.length,
        successCount,
        failureCount,
        timeoutCount,
        stoppedOnFailure: failureCount > 0 && onFailure === "stop"
      },
      results
    });
  }
  if (tool === "ada_extract") {
    const sessionId = String(args.sessionId ?? "mcp-extract");
    const mode = typeof args.mode === "string" ? args.mode : "text";
    let script = "";
    if (mode === "list") {
      script = `(() => Array.from(document.querySelectorAll('li,a')).map(el => (el.textContent||'').trim()).filter(Boolean).slice(0,50))()`;
    } else if (mode === "table") {
      script = `(() => Array.from(document.querySelectorAll('table')).map(t => Array.from(t.querySelectorAll('tr')).map(r => Array.from(r.querySelectorAll('th,td')).map(c => (c.textContent||'').trim()))).slice(0,5))()`;
    } else {
      script = `(() => (document.body?.innerText || '').slice(0, 5000))()`;
    }
    ensureRiskAllowed("custom", args);
    const result = await runCommand(
      toCommandEnvelope({
        requestId: `extract-${Date.now()}`,
        sessionId,
        platform: "web",
        command: "custom",
        payload: { action: "evaluate", script, ...(asRecord(args.payload) || {}) }
      })
    );
    assertRealResult(result, "ada_extract", allowMock(args));
    return textResult(
      toExtractResponse({
        source: "web",
        mode,
        platform: "web",
        result,
        maxItems: Number((asRecord(args.payload).maxItems as number | undefined) ?? 50)
      })
    );
  }
  if (tool === "ada_assertions") {
    const sessionId = String(args.sessionId ?? "mcp-assert");
    const type = typeof args.type === "string" ? args.type : "visible";
    const payload = asRecord(args.payload);
    let command: SupportedCommand = "assertVisible";
    if (type === "text") {
      command = "assertText";
    } else if (type === "url") {
      ensureRiskAllowed("custom", args);
      const result = await runCommand(
        toCommandEnvelope({
          requestId: `assert-url-${Date.now()}`,
          sessionId,
          platform: "web",
          command: "custom",
          payload: {
            action: "evaluate",
            script: `(() => location.href)()`
          }
        })
      );
      assertRealResult(result, "ada_assertions", allowMock(args));
      const actual = String((result.data as Record<string, unknown> | undefined)?.value ?? "");
      const expected = String(payload.expectedUrl ?? "");
      const pass = expected.length === 0 ? actual.length > 0 : actual.includes(expected);
      return textResult({
        status: pass ? "ok" : "failed",
        type: "url",
        expectedUrl: expected,
        actualUrl: actual
      });
    }
    const result = await runCommand(
      toCommandEnvelope({
        requestId: `assert-${Date.now()}`,
        sessionId,
        platform: "web",
        command,
        payload
      })
    );
    assertRealResult(result, "ada_assertions", allowMock(args));
    return textResult({ status: result.success ? "ok" : "failed", type, result });
  }
  if (tool === "ada_mobile_extract") {
    const platform = normalizePlatform(args.platform);
    if (platform === "web") {
      throw new Error("ada_mobile_extract requires mobile platform");
    }
    await ensureAppiumServerReady(platform);
    const sessionId = String(args.sessionId ?? "mcp-mobile-extract");
    const type = typeof args.type === "string" ? args.type : "text";
    const payload = asRecord(args.payload);
    if (type === "pageSource") {
      ensureRiskAllowed("custom", args);
      const result = await runCommand(
        toCommandEnvelope({
          requestId: `mobile-page-source-${Date.now()}`,
          sessionId,
          platform,
          command: "custom",
          payload: {
            custom: {
              method: "GET",
              path: "/source"
            }
          }
        })
      );
      assertRealResult(result, "ada_mobile_extract", allowMock(args));
      return textResult(
        toExtractResponse({
          source: "mobile",
          mode: type,
          platform,
          result,
          maxItems: Number((payload.maxItems as number | undefined) ?? 50)
        })
      );
    }
    const result = await runCommand(
      toCommandEnvelope({
        requestId: `mobile-extract-${Date.now()}`,
        sessionId,
        platform,
        command: "getText",
        payload
      })
    );
    assertRealResult(result, "ada_mobile_extract", allowMock(args));
    return textResult(
      toExtractResponse({
        source: "mobile",
        mode: "text",
        platform,
        result,
        maxItems: Number((payload.maxItems as number | undefined) ?? 50)
      })
    );
  }
  if (tool === "ada_mobile_assertions") {
    const platform = normalizePlatform(args.platform);
    if (platform === "web") {
      throw new Error("ada_mobile_assertions requires mobile platform");
    }
    await ensureAppiumServerReady(platform);
    const sessionId = String(args.sessionId ?? "mcp-mobile-assert");
    const type = typeof args.type === "string" ? args.type : "visible";
    const payload = asRecord(args.payload);
    const command = type === "text" ? "assertText" : "assertVisible";
    const result = await runCommand(
      toCommandEnvelope({
        requestId: `mobile-assert-${Date.now()}`,
        sessionId,
        platform,
        command,
        payload
      })
    );
    assertRealResult(result, "ada_mobile_assertions", allowMock(args));
    return textResult({ status: result.success ? "ok" : "failed", platform, type, result });
  }
  if (tool === "ada_run_task_file") {
    const file = String(args.file ?? "");
    if (!file) {
      throw new Error("file is required");
    }
    const taskPath = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    const tasks = await loadTaskFile(taskPath);
    const results = await runTaskset(tasks);
    const monitor = parseMonitorOptions(args);
    const monitorJobs: Promise<void>[] = [];
    for (let i = 0; i < tasks.length; i += 1) {
      const maybeJob = runMonitorCapture(tasks[i], results[i], monitor);
      if (maybeJob) {
        monitorJobs.push(maybeJob);
      }
    }
    if (monitorJobs.length > 0) {
      await Promise.allSettled(monitorJobs);
    }
    const allowMockMode = allowMock(args);
    for (const result of results) {
      assertRealResult(result, "ada_run_task_file", allowMockMode);
    }
    return textResult(results);
  }
  if (tool === "ada_execute") {
    ensureRiskAllowed(normalizeCommand(args.command), args);
    const command = toCommandEnvelope(args);
    await withTiming(`ensureAppiumServerReady(${command.platform})`, () => ensureAppiumServerReady(command.platform));
    const result = await withTiming(`runCommand(${command.platform}:${command.command})`, () => runCommand(command));
    const maybeJob = runMonitorCapture(command, result, parseMonitorOptions(args));
    if (maybeJob) {
      await maybeJob;
    }
    assertRealResult(result, "ada_execute", allowMock(args));
    return textResult(result);
  }
  if (tool === "ada_invoke") {
    ensureRiskAllowed("invoke", args);
    const platform = normalizePlatform(args.platform);
    const payload = buildInvokeCommandPayload(args);
    if (platform !== "web" && payload.real !== false) {
      payload.real = true;
    }
    const envelope: CommandEnvelope = {
      requestId: String(args.requestId ?? `invoke-${Date.now()}`),
      sessionId: String(args.sessionId ?? "mcp-invoke"),
      platform,
      command: "invoke",
      payload
    };
    await withTiming(`ensureAppiumServerReady(${platform})`, () => ensureAppiumServerReady(platform));
    const result = await withTiming(`runCommand(${platform}:invoke)`, () => runCommand(envelope));
    const maybeJob = runMonitorCapture(envelope, result, parseMonitorOptions(args));
    if (maybeJob) {
      await maybeJob;
    }
    assertRealResult(result, "ada_invoke", allowMock(args));
    return textResult(result);
  }
  if (tool === "ada_web_action") {
    const command = normalizeCommand(args.command);
    ensureRiskAllowed(command, args);
    if (["swipe", "home", "launchApp", "terminateApp"].includes(command)) {
      throw new Error(`web_action does not support command: ${command}`);
    }
    const envelope = toCommandEnvelope({
      ...args,
      platform: "web",
      command,
      payload: mergeWebEngineIntoPayload(args)
    });
    const result = await withTiming(`runCommand(web:${command})`, () => runCommand(envelope));
    const maybeJob = runMonitorCapture(envelope, result, parseMonitorOptions(args));
    if (maybeJob) {
      await maybeJob;
    }
    assertRealResult(result, "ada_web_action", allowMock(args));
    return textResult(result);
  }
  if (tool === "ada_mobile_action") {
    const command = normalizeCommand(args.command);
    ensureRiskAllowed(command, args);
    if (
      ["navigate", "hover", "press", "select", "scroll", "reload", "closeTab", "forward", "newTab", "switchTab", "uploadFile", "dragDrop"].includes(
        command
      )
    ) {
      throw new Error(`mobile_action does not support command: ${command}`);
    }
    const envelope = toCommandEnvelope({
      ...args,
      platform: normalizePlatform(args.platform),
      command
    });
    await withTiming(`ensureAppiumServerReady(${envelope.platform})`, () => ensureAppiumServerReady(envelope.platform));
    const result = await withTiming(`runCommand(${envelope.platform}:${command})`, () => runCommand(envelope));
    const maybeJob = runMonitorCapture(envelope, result, parseMonitorOptions(args));
    if (maybeJob) {
      await maybeJob;
    }
    assertRealResult(result, "ada_mobile_action", allowMock(args));
    return textResult(result);
  }

  throw new Error(`Unknown tool: ${tool}`);
  });
}

export function createAdaMcpProtocolServer(): Server {
  const instance = new Server(
    {
      name: "ada-mcp-server",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  wireAdaMcpProtocolServer(instance);
  return instance;
}

export const server = createAdaMcpProtocolServer();

export async function startMcpServer(): Promise<void> {
  const binaryCommand = process.execPath;
  const cwd = process.cwd();
  const passedArgs = process.argv.slice(2);
  if (passedArgs.includes("mcp")) {
    console.error('[ADA-MCP] warning: standalone ada-mcp binary does not require "mcp" arg; it is safe to remove.');
  }
  const configHint = {
    mcpServers: {
      "ada-mcp": {
        command: binaryCommand,
        args: [],
        cwd,
        env: {
          ADA_PLAYWRIGHT_HEADLESS: "true",
          ADA_NPM_PROXY_REGISTRY: "https://registry.npmmirror.com",
          ADA_PNPM_PROXY_REGISTRY: "https://registry.npmmirror.com",
          ADA_INSTALL_STRATEGY_TIMEOUT_MS: "30000"
        }
      }
    }
  };
  const npmDevHint = {
    mcpServers: {
      "ada-mcp-dev": {
        command: "npm",
        args: ["run", "mcp:dev"]
      }
    }
  };
  console.error("[ADA-MCP] config hint (binary):");
  console.error(JSON.stringify(configHint, null, 2));
  console.error("[ADA-MCP] note: MCP tool names use ada_snake_case (e.g. ada_install_deps, ada_invoke, ada_web_action)");
  console.error("[ADA-MCP] config hint (npm dev):");
  console.error(JSON.stringify(npmDevHint, null, 2));

  process.stdin.on("end", () => {
    void gracefulShutdown("stdin-end");
  });
  process.stdin.on("close", () => {
    void gracefulShutdown("stdin-close");
  });
  process.once("SIGINT", () => {
    void gracefulShutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
  });
  process.once("disconnect", () => {
    void gracefulShutdown("disconnect");
  });

  console.error("[ADA-MCP] server starting (stdio mode)");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ADA-MCP] server connected");
}
