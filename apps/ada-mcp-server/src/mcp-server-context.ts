import fs from "node:fs/promises";

import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { truncateViewTreeValue } from "@ada/driver-rpc";
import {
  invalidateDependencyHealthCache,
  isBootstrapInstallActive,
  type InstallDepsConfig,
  type InstallScope
} from "@ada/install-deps";
import { invalidateDoctorSnapshotCache } from "@ada/agent-core";
import { stopAllIosIproxyForwards } from "@ada/runtime-probe";

import { loadAgentConfig } from "./config.js";
import { listActiveSessions, runCommand, shutdownExecutor } from "./executor.js";
import { mcpLog, mcpLogIfVerbose, shouldMcpLog } from "./mcp-log.js";
import { normalizeCommand, normalizePlatform, type AdaPlatform } from "./mcp-normalize.js";
import { shouldPreflightSession } from "./mcp-action-runner.js";
import { isMcpExtractRaw } from "./mcp-response-mode.js";
import { ensureMobileSessionReady as probeMobileSession } from "./mcp-mobile-session-liveness.js";
import { ensureWebPageReady as probeAndRecoverWebPage } from "./mcp-session-liveness.js";
import { invalidateRuntimePreflightCache, ensureMobileRuntimeReady } from "./mcp-runtime-preflight.js";
import { captureMcpMonitor, type MonitorOptions } from "./monitoring.js";

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function mergeWebEngineIntoPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...asRecord(args.payload) };
  if (args.engine !== undefined && payload.engine === undefined) {
    payload.engine = args.engine;
  }
  const hoistKeys = [
    "locator",
    "selector",
    "text",
    "key",
    "url",
    "waitTimeoutMs",
    "timeoutMs",
    "locatorTimeoutMs",
    "headless",
    "channel",
    "browser",
    "userDataDir",
    "cdpEndpoint",
    "tabIndex",
    "commandTimeoutMs"
  ];
  for (const key of hoistKeys) {
    if (args[key] !== undefined && payload[key] === undefined) {
      payload[key] = args[key];
    }
  }
  return payload;
}

export function buildInvokeCommandPayload(args: Record<string, unknown>): Record<string, unknown> {
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
    "cdpAutoLaunch",
    "cdpPort",
    "cdpLaunchArgs",
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
    "profile"
  ];
  for (const key of keys) {
    if (args[key] !== undefined && out[key] === undefined) {
      out[key] = args[key];
    }
  }
  return out;
}

export function ensureRealPayloadForPlatform(
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

export function toCommandEnvelope(input: Record<string, unknown>, allowMock = false): CommandEnvelope {
  const platform = normalizePlatform(input.platform, { allowDefaultWeb: true });
  const payload = ensureRealPayloadForPlatform(platform, asRecord(input.payload), allowMock);
  return {
    requestId: String(input.requestId ?? `mcp-${Date.now()}`),
    sessionId: String(input.sessionId ?? "mcp-session"),
    platform,
    command: normalizeCommand(input.command),
    payload
  };
}

export const riskyCommandDefaults = ["custom", "invoke", "launchApp", "exitApp"];
export const riskyCommandAllowlist = new Set<string>(
  (process.env.ADA_MCP_RISKY_COMMAND_WHITELIST ?? riskyCommandDefaults.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);

export function allowMock(args: Record<string, unknown>): boolean {
  return args.allowMock === true;
}

export function ensureRiskAllowed(command: string, args: Record<string, unknown>): void {
  if (!riskyCommandAllowlist.has(command)) {
    return;
  }
  if (args.riskApproved === true) {
    return;
  }
  throw new Error(`Command ${command} is high risk, set riskApproved=true to execute`);
}

export function parseInstallScope(v: unknown): InstallScope {
  if (
    v === "all" ||
    v === "playwright" ||
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

export function parseMonitorOptions(args: Record<string, unknown>): MonitorOptions {
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

export function runMonitorCapture(
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

export const perfStats = new Map<string, number[]>();
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

export function buildPerfSummary(): Record<string, unknown> {
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

export async function withTiming<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    const elapsed = Date.now() - started;
    recordPerf(label, elapsed);
    if (shouldMcpLog("info") || process.env.ADA_MCP_PERF?.trim() === "1") {
      mcpLog("info", `perf ${label} ${elapsed}ms`);
    }
  }
}

export function toExtractResponse(input: {
  source: "web" | "mobile";
  mode: string;
  platform?: AdaPlatform;
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
    if (input.mode === "viewTree") {
      const dataTruncated =
        (input.result.data as Record<string, unknown> | undefined)?.viewTreeTruncated === true;
      const capped = truncateViewTreeValue(rawValue, maxItems);
      items = [capped.value];
      truncated = dataTruncated || capped.truncated;
    } else {
      items = [rawValue];
    }
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
    ...(isMcpExtractRaw() ? { rawResult: input.result } : {})
  };
}

export function assertRealResult(result: CommandResult, context: string, allowMockMode: boolean): void {
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

export async function loadTaskFile(taskFilePath: string): Promise<CommandEnvelope[]> {
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

export function invalidateRuntimeCaches(): void {
  invalidateDependencyHealthCache();
  invalidateRuntimePreflightCache();
  invalidateDoctorSnapshotCache();
}

export function mobilePreflight(platform: AdaPlatform): Promise<void> {
  return ensureMobileRuntimeReady(platform, async () => (await loadAgentConfig()) as unknown as InstallDepsConfig);
}

export async function ensureSessionActive(
  platform: AdaPlatform,
  sessionId: string,
  command: string
): Promise<void> {
  if (!shouldPreflightSession(command, platform)) {
    return;
  }
  if (sessionId === "mcp-session" || sessionId === "mcp-batch" || sessionId === "mcp-invoke" || sessionId === "mcp-extract") {
    return;
  }
  const sessions = listActiveSessions();
  const active = sessions.some((item) => item.sessionId === sessionId);
  if (!active) {
    throw new Error(
      `Session "${sessionId}" is not active for ${command}. Start with navigate/launchApp or check ada_sessions.`
    );
  }
}

export async function ensureWebPageReadyForTool(sessionId: string, command: string): Promise<void> {
  await probeAndRecoverWebPage(sessionId, command, {
    runCommand,
    toCommandEnvelope,
    allowMock: false
  });
}

export async function ensureMobileSessionReadyForTool(
  platform: AdaPlatform,
  sessionId: string,
  command: string
): Promise<void> {
  await probeMobileSession(platform, sessionId, command, {
    runCommand,
    toCommandEnvelope,
    allowMock: false
  });
}

let shuttingDown = false;
let stdinDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

function isTruthyEnv(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function shouldExitProcessOnStdinClose(): boolean {
  return isTruthyEnv("ADA_MCP_EXIT_ON_STDIN_CLOSE");
}

function resolveStdinDisconnectDebounceMs(): number {
  if (isBootstrapInstallActive() || process.env.ADA_MCP_BOOTSTRAP_IN_PROGRESS === "1") {
    const bootstrapRaw = Number(process.env.ADA_MCP_BOOTSTRAP_DEBOUNCE_MS ?? 300_000);
    if (Number.isFinite(bootstrapRaw)) {
      return Math.min(Math.max(Math.floor(bootstrapRaw), 0), 600_000);
    }
    return 300_000;
  }
  const raw = Number(process.env.ADA_MCP_STDIN_SHUTDOWN_DEBOUNCE_MS ?? 2000);
  if (!Number.isFinite(raw)) {
    return 2000;
  }
  return Math.min(Math.max(Math.floor(raw), 0), 60_000);
}

function stdinLooksAlive(): boolean {
  return Boolean(process.stdin.readable && !process.stdin.readableEnded && !process.stdin.destroyed);
}

async function releaseExecutorSessions(reason: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  mcpLog("info", `releasing sessions (${reason}), server stays up`);
  try {
    await shutdownExecutor({ timeoutMs: 10_000 });
    await shutdownExecutor({ force: true });
  } catch (error) {
    mcpLog("warn", `releaseExecutorSessions: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function scheduleStdinDisconnect(reason: string): void {
  if (stdinDisconnectTimer) {
    clearTimeout(stdinDisconnectTimer);
  } else {
    const ms = resolveStdinDisconnectDebounceMs();
    mcpLogIfVerbose(
      `${reason}: debounce ${ms}ms (release sessions only; ADA_MCP_EXIT_ON_STDIN_CLOSE=1 to exit process)`
    );
  }
  const ms = resolveStdinDisconnectDebounceMs();
  if (ms <= 0) {
    void onStdinDisconnect(reason);
    return;
  }
  stdinDisconnectTimer = setTimeout(() => {
    stdinDisconnectTimer = null;
    void onStdinDisconnect(reason);
  }, ms);
}

async function onStdinDisconnect(reason: string): Promise<void> {
  if (stdinLooksAlive()) {
    mcpLogIfVerbose(`${reason} recovered, server continues`);
    return;
  }
  if (isBootstrapInstallActive() || process.env.ADA_MCP_BOOTSTRAP_IN_PROGRESS === "1") {
    mcpLog(
      "info",
      `${reason} during dependency bootstrap; defer session release (install in progress)`
    );
    scheduleStdinDisconnect(reason);
    return;
  }
  if (shouldExitProcessOnStdinClose()) {
    await gracefulShutdown(reason);
    return;
  }
  await releaseExecutorSessions(reason);
}

export function wireStdinShutdownHandlers(): void {
  process.stdin.on("end", () => scheduleStdinDisconnect("stdin-end"));
  process.stdin.on("close", () => scheduleStdinDisconnect("stdin-close"));
}

export async function gracefulShutdown(reason: string): Promise<void> {
  if (stdinDisconnectTimer) {
    clearTimeout(stdinDisconnectTimer);
    stdinDisconnectTimer = null;
  }
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    mcpLog("warn", `shutting down: ${reason}`);
    await shutdownExecutor({ timeoutMs: 10_000 });
    await shutdownExecutor({ force: true });
  } catch (error) {
    mcpLog("error", `shutdownExecutor: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try {
      stopAllIosIproxyForwards();
    } catch {
      // best-effort
    }
    process.exit(0);
  }
}
