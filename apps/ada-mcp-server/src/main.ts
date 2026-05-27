import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
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
import {
  resolveCommandPath,
  spawnDetachedHidden,
  spawnSyncHidden
} from "./spawn-util.js";
import { getBuiltInPlugins, getDoctorSnapshot, getHealthSnapshot, installDependencies, runStartFlow } from "@ada/agent-core";
import type { InstallScope } from "@ada/agent/dependency-installer";
import { buildAdaMcpToolDefinitions } from "./mcp-tool-definitions.js";

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }]
  };
}

let appiumEnsureJob: Promise<void> | null = null;
let persistedHomesCache: { androidHome?: string; appiumHome?: string } | null = null;
let appiumReadyCache: { serverUrl: string; timestamp: number } | null = null;
const APPIUM_READY_CACHE_TTL_MS = Number(process.env.ADA_APPIUM_READY_CACHE_MS ?? 300_000) || 300_000;

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
  return resolveCommandPath(command) !== null;
}

const commandAvailableCache = new Map<string, boolean>();
function commandAvailableCached(command: string): boolean {
  if (commandAvailableCache.has(command)) {
    return commandAvailableCache.get(command)!;
  }
  const ok = commandAvailable(command);
  commandAvailableCache.set(command, ok);
  return ok;
}

function spawnDetachedChecked(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ ok: true; pid?: number } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    try {
      const resolved = path.isAbsolute(cmd) ? cmd : resolveCommandPath(cmd) ?? cmd;
      const child = spawnDetachedHidden(resolved, args, { cwd: process.cwd(), env });
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

function globalDepsStateFile(): string {
  const override = process.env.ADA_HOME?.trim();
  const adaHome = override ? path.resolve(override) : path.join(os.homedir(), ".ada");
  const explicit = process.env.ADA_DEPS_STATE_FILE?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  return path.join(adaHome, "deps-install-state.json");
}

function loadPersistedHomes(): { androidHome?: string; appiumHome?: string } {
  if (persistedHomesCache) {
    return persistedHomesCache;
  }
  const candidates = [
    globalDepsStateFile(),
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

let cachedAndroidSdkRoot: string | null | undefined;

function resolveAndroidSdkRoot(): string | null {
  if (cachedAndroidSdkRoot !== undefined) {
    return cachedAndroidSdkRoot;
  }
  const persisted = loadPersistedHomes();
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const adbLookup = spawnSyncHidden(checker, ["adb"], { encoding: "utf8" });
  const adbStdout = adbLookup.stdout;
  const adbText = typeof adbStdout === "string" ? adbStdout : adbStdout ? adbStdout.toString("utf8") : "";
  const adbPath = adbText
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .find(Boolean);
  const adbSdkRoot = adbPath ? path.dirname(path.dirname(adbPath)) : null;

  const workspaceRoot = process.cwd();
  const projectAndroidHome = path.join(workspaceRoot, "ANDROID_HOME");
  const candidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    persisted.androidHome,
    existsSync(projectAndroidHome) ? projectAndroidHome : null,
    adbSdkRoot,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk") : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local", "Android", "Sdk") : null
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  for (const sdkRoot of candidates) {
    if (persisted.androidHome && sdkRoot === persisted.androidHome && existsSync(sdkRoot)) {
      cachedAndroidSdkRoot = sdkRoot;
      return sdkRoot;
    }
    const platformTools = path.join(sdkRoot, "platform-tools");
    if (existsSync(platformTools)) {
      cachedAndroidSdkRoot = sdkRoot;
      return sdkRoot;
    }
  }
  cachedAndroidSdkRoot = null;
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
  const projectAppiumHome = path.join(process.cwd(), "APPIUM_HOME");
  const candidates = [
    process.env.APPIUM_HOME,
    persisted.appiumHome,
    existsSync(projectAppiumHome) ? projectAppiumHome : null,
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
  const appiumPath = resolveCommandPath("appium");
  if (appiumPath) {
    candidates.push({
      cmd: appiumPath,
      args: ["--address", host, "--port", String(port), "--relaxed-security"]
    });
  }

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
    if (!commandAvailableCached(candidate.cmd)) {
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

function ensureRealPayloadForPlatform(
  platform: "web" | "android" | "ios" | "harmony",
  payload: Record<string, unknown>,
  allowMock = false
): Record<string, unknown> {
  const next = { ...payload };
  if (allowMock) {
    return next;
  }
  next.real = true;
  next.mock = false;
  return next;
}

function toCommandEnvelope(input: Record<string, unknown>, allowMock = false): CommandEnvelope {
  const platform = normalizePlatform(input.platform);
  const payload = ensureRealPayloadForPlatform(platform, asRecord(input.payload), allowMock);
  return {
    requestId: String(input.requestId ?? `mcp-${Date.now()}`),
    sessionId: String(input.sessionId ?? "mcp-session"),
    platform,
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
  return "playwright";
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
  const data = result.data as Record<string, unknown> | undefined;
  const mode = data?.mode;
  const message = String(data?.message ?? "");
  const mockMessage =
    message === "Mock mobile command executed" ||
    message === "Mock harmony command executed" ||
    message === "Mock web command executed";
  if (!allowMockMode && (mode === "mock" || mockMessage)) {
    const reason = data?.reason ?? data?.errorMessage ?? data?.message ?? "unknown";
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
    tools: buildAdaMcpToolDefinitions()
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
        }, allowMock(args));
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
      }, allowMock(args))
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
        }, allowMock(args))
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
      }, allowMock(args))
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
        }, allowMock(args))
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
      }, allowMock(args))
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
      }, allowMock(args))
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
    const command = toCommandEnvelope(args, allowMock(args));
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
    const payload = ensureRealPayloadForPlatform(platform, buildInvokeCommandPayload(args), allowMock(args));
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
    }, allowMock(args));
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
    }, allowMock(args));
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
  function tryReadPackageVersion(name: string): string | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const raw = require(`${name}/package.json`) as { version?: unknown };
      const v = String(raw?.version ?? "").trim();
      return v.length > 0 ? v : null;
    } catch {
      return null;
    }
  }

  const launcherVersion = tryReadPackageVersion("@ada-mcp/launcher");
  const selfVersion = tryReadPackageVersion("@ada-mcp/mcp-server");
  const alignedLauncherVersion = launcherVersion || selfVersion;

  const launcherSpec = alignedLauncherVersion
    ? `@ada-mcp/launcher@${alignedLauncherVersion}`
    : "@ada-mcp/launcher";

  const configHint = {
    mcpServers: {
      "ada-mcp": {
        command: "pnpm",
        args: ["dlx", launcherSpec]
      }
    }
  };
  const binaryHint = {
    mcpServers: {
      "ada-mcp": {
        command: binaryCommand,
        args: [],
        cwd,
        env: {
          ADA_PLAYWRIGHT_HEADLESS: "true",
          ADA_MCP_INSTALL_DEPS: "playwright",
          ADA_INSTALL_STRATEGY_TIMEOUT_MS: "120000",
          ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS: "3600000"
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
  console.error("[ADA-MCP] config hint (npm standard):");
  console.error(JSON.stringify(configHint, null, 2));
  if (selfVersion) {
    console.error(`[ADA-MCP] package version: @ada-mcp/mcp-server@${selfVersion}`);
  }
  if (launcherVersion) {
    console.error(`[ADA-MCP] launcher version detected: @ada-mcp/launcher@${launcherVersion}`);
  } else {
    console.error("[ADA-MCP] launcher version not detected (using tag without version).");
  }
  console.error("[ADA-MCP] config hint (local binary):");
  console.error(JSON.stringify(binaryHint, null, 2));
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
