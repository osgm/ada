import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { URL } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import {
  getBuiltInPlugins,
  getDeviceRegistrySnapshot,
  getDoctorSnapshot,
  getHealthSnapshot,
  installDependencies,
  invalidateDoctorSnapshotCache,
  runStartFlow,
  scanDevicesAndListForDisplay,
  scanMobileDevicesAndPersist
} from "@ada/agent-core";
import type { AgentConfig } from "@ada/agent/types";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { invalidateDependencyHealthCache, type InstallScope } from "@ada/install-deps";

import { scheduleBootstrapInstallDeps } from "@ada/agent/bootstrap-deps";
import { loadAgentConfig } from "./config.js";
import { mcpLog, mcpLogIfVerbose, shouldMcpLog } from "./mcp-log.js";
import {
  closeAllSessions,
  closeSession,
  listActiveSessions,
  runCommand,
  runTaskset,
  shutdownExecutor
} from "./executor.js";
import { buildAdaMcpToolDefinitions } from "./mcp-tool-definitions.js";
import {
  isMobilePlatform,
  normalizeCommand,
  normalizePlatform,
  requireMobilePlatform,
  type AdaPlatform
} from "./mcp-normalize.js";
import {
  ensureWebRuntimeReady,
  executeWithTimeout,
  parseActionRunOptions,
  runCommandWithRetry,
  shouldPreflightSession
} from "./mcp-action-runner.js";
import { handleMobileAction, handleMobileRecipe, handleWebAction } from "./mcp-actions.js";
import { handleMobileDismissPopups, handleWebDismissPopups } from "./mcp-dismiss-popups.js";
import {
  handleCloseAllSessions,
  handleCloseSession,
  handleConfig,
  handlePerfSummary,
  handlePlugins,
  handleRiskPolicy,
  handleSessions
} from "./mcp-admin.js";
import { handleMobileAssertions, handleWebAssertions } from "./mcp-assertions.js";
import { handleBatchActions } from "./mcp-batch-actions.js";
import { handleExecute, handleInvoke, handleRunTaskFile } from "./mcp-execution.js";
import { handleMobileExtract, handleWebExtract } from "./mcp-extract.js";
import { buildHealthBlockers, buildSessionPolicy, healthStatusFromBlockers } from "./mcp-health-enrich.js";
import { handleDiagnosticsTool, handleHealthTool } from "./mcp-health-diagnostics.js";
import { handleDevices, handleInstallDeps, handleStartOnce } from "./mcp-runtime-admin.js";
import { buildRecoveryPlan } from "./mcp-recovery.js";
import { mcpTextResult, wrapAssertionResult, wrapCommandToolResult } from "./mcp-result.js";
import { registerAdaMcpResources } from "./mcp-resources.js";
import { applyMcpRuntimeConfigFromRecord, isMcpExtractRaw } from "./mcp-response-mode.js";
import { buildStartHints, resolveStartPackageVersions } from "./mcp-start-hints.js";
import { buildRecoveryHint } from "./mcp-tool-tiers.js";
import { captureMcpMonitor, type MonitorOptions } from "./monitoring.js";
import {
  resolveCommandPath,
  spawnSyncHidden
} from "./spawn-util.js";
import {
  ensureMobileRuntimeReady,
  invalidateRuntimePreflightCache
} from "./mcp-runtime-preflight.js";
import { installMcpStdioGuard } from "./mcp-stdio-guard.js";

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

function invalidateRuntimeCaches(): void {
  invalidateDependencyHealthCache();
  invalidateRuntimePreflightCache();
  invalidateDoctorSnapshotCache();
}

function mobilePreflight(platform: AdaPlatform): Promise<void> {
  return ensureMobileRuntimeReady(platform, async () => (await loadAgentConfig()) as unknown as AgentConfig);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

// Payload normalization helpers for execute/invoke/web commands.
function mergeWebEngineIntoPayload(args: Record<string, unknown>): Record<string, unknown> {
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
    "profile",
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

// Risk gating for potentially destructive commands.
const riskyCommandDefaults = ["custom", "invoke", "launchApp", "exitApp"];
const riskyCommandAllowlist = new Set<string>(
  (process.env.ADA_MCP_RISKY_COMMAND_WHITELIST ?? riskyCommandDefaults.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);

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

// Monitor capture wiring shared by command-style tools.
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

// In-process perf telemetry for ada_perf_summary.
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
    if (shouldMcpLog("info") || process.env.ADA_MCP_PERF?.trim() === "1") {
      mcpLog("info", `perf ${label} ${elapsed}ms`);
    }
  }
}

// Shared extract response shaping for web/mobile extract handlers.
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
    ...(isMcpExtractRaw() ? { rawResult: input.result } : {})
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
let stdinDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

function isTruthyEnv(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** 默认 false：stdio 客户端断开时不要结束 MCP 服务进程（仅释放会话，见 onStdinDisconnect） */
function shouldExitProcessOnStdinClose(): boolean {
  return isTruthyEnv("ADA_MCP_EXIT_ON_STDIN_CLOSE");
}

function resolveStdinDisconnectDebounceMs(): number {
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
  if (shouldExitProcessOnStdinClose()) {
    await gracefulShutdown(reason);
    return;
  }
  await releaseExecutorSessions(reason);
}

function wireStdinShutdownHandlers(): void {
  process.stdin.on("end", () => scheduleStdinDisconnect("stdin-end"));
  process.stdin.on("close", () => scheduleStdinDisconnect("stdin-close"));
}

async function gracefulShutdown(reason: string): Promise<void> {
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
    process.exit(0);
  }
}

function normalizeToolName(raw: unknown): string {
  return String(raw ?? "").trim();
}

async function ensureSessionActive(platform: AdaPlatform, sessionId: string, command: string): Promise<void> {
  if (!shouldPreflightSession(command, platform)) {
    return;
  }
  if (sessionId === "mcp-session" || sessionId === "mcp-batch" || sessionId === "mcp-invoke") {
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

function wireAdaMcpProtocolServer(mcp: Server): void {
  void loadAgentConfig()
    .then((cfg) => applyMcpRuntimeConfigFromRecord(cfg))
    .catch(() => undefined);
  registerAdaMcpResources(mcp);

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildAdaMcpToolDefinitions()
  }));

  mcp.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const tool = normalizeToolName(request.params.name);
  const args = asRecord(request.params.arguments);

  if (tool === "ada_health") {
    return handleHealthTool(args, {
      loadAgentConfig,
      getHealthSnapshot: (options) => getHealthSnapshot(options),
      buildHealthBlockers,
      buildSessionPolicy,
      healthStatusFromBlockers,
      mcpTextResult
    });
  }
  if (tool === "ada_diagnostics") {
    return handleDiagnosticsTool(args, {
      getDoctorSnapshot: (scope) => getDoctorSnapshot(scope),
      mcpTextResult
    });
  }
  if (tool === "ada_plugins") {
    return handlePlugins({ getBuiltInPlugins, mcpTextResult });
  }
  if (tool === "ada_config") {
    return handleConfig({ loadAgentConfig, mcpTextResult });
  }
  if (tool === "ada_devices") {
    return handleDevices(args, {
      invalidateRuntimeCaches,
      scanMobileDevicesAndPersist,
      scanDevicesAndListForDisplay,
      getDeviceRegistrySnapshot,
      mcpTextResult
    });
  }
  if (tool === "ada_install_deps") {
    return handleInstallDeps(args, {
      parseInstallScope,
      installDependencies,
      invalidateRuntimeCaches,
      mcpTextResult
    });
  }
  if (tool === "ada_start_once") {
    return handleStartOnce(args, {
      runStartFlow,
      mcpTextResult
    });
  }
  if (tool === "ada_sessions") {
    return handleSessions({ listActiveSessions, mcpTextResult });
  }
  if (tool === "ada_close_session") {
    return handleCloseSession(args, {
      normalizePlatform,
      mergeWebEngineIntoPayload,
      closeSession,
      mcpTextResult
    });
  }
  if (tool === "ada_close_all_sessions") {
    return handleCloseAllSessions({ closeAllSessions, mcpTextResult });
  }
  if (tool === "ada_risk_policy") {
    return handleRiskPolicy(args, {
      riskyCommandAllowlist,
      riskyCommandDefaults,
      mcpTextResult
    });
  }
  if (tool === "ada_perf_summary") {
    return handlePerfSummary(args, { buildPerfSummary, perfStats, mcpTextResult });
  }
  if (tool === "ada_batch_actions") {
    return handleBatchActions(args, {
      normalizePlatform,
      mobilePreflight,
      withTiming,
      asRecord,
      normalizeCommand,
      ensureRiskAllowed,
      toCommandEnvelope,
      allowMock,
      executeWithTimeout,
      assertRealResult,
      mcpTextResult,
      buildRecoveryHint,
      buildRecoveryPlan
    } as any);
  }
  if (tool === "ada_extract") {
    return handleWebExtract(args, {
      runCommand,
      toCommandEnvelope,
      allowMock,
      ensureRiskAllowed,
      assertRealResult,
      toExtractResponse,
      mcpTextResult,
      buildRecoveryHint
    });
  }
  if (tool === "ada_assertions") {
    return handleWebAssertions(args, {
      runCommand,
      toCommandEnvelope,
      allowMock,
      ensureRiskAllowed,
      assertRealResult,
      wrapAssertionResult
    });
  }
  if (tool === "ada_mobile_extract") {
    return handleMobileExtract(args, {
      requireMobilePlatform,
      mobilePreflight,
      runCommand,
      toCommandEnvelope,
      allowMock,
      ensureRiskAllowed,
      assertRealResult,
      toExtractResponse,
      mcpTextResult,
      buildRecoveryHint
    });
  }
  if (tool === "ada_mobile_assertions") {
    return handleMobileAssertions(args, {
      requireMobilePlatform,
      mobilePreflight,
      runCommand,
      toCommandEnvelope,
      allowMock,
      assertRealResult,
      wrapAssertionResult
    });
  }
  if (tool === "ada_run_task_file") {
    return handleRunTaskFile(args, {
      resolveTaskPath: (file) => (path.isAbsolute(file) ? file : path.resolve(process.cwd(), file)),
      loadTaskFile,
      runTaskset,
      parseMonitorOptions,
      runMonitorCapture,
      allowMock,
      assertRealResult,
      mcpTextResult,
      buildRecoveryHint
    });
  }
  if (tool === "ada_execute") {
    return handleExecute(args, {
      normalizeCommand,
      ensureRiskAllowed,
      toCommandEnvelope,
      allowMock,
      withTiming,
      mobilePreflight,
      runCommand,
      runMonitorCapture,
      parseMonitorOptions,
      assertRealResult,
      wrapCommandToolResult
    });
  }
  if (tool === "ada_invoke") {
    return handleInvoke(args, {
      ensureRiskAllowed,
      normalizePlatform,
      ensureRealPayloadForPlatform,
      buildInvokeCommandPayload,
      allowMock,
      withTiming,
      mobilePreflight,
      runCommand,
      runMonitorCapture,
      parseMonitorOptions,
      assertRealResult,
      wrapCommandToolResult
    });
  }
  if (tool === "ada_web_dismiss_popups") {
    return handleWebDismissPopups(args, {
      mergeWebEngineIntoPayload,
      mcpTextResult
    });
  }
  if (tool === "ada_web_action") {
    return handleWebAction(args, {
      normalizeCommand,
      ensureRiskAllowed,
      toCommandEnvelope,
      mergeWebEngineIntoPayload,
      allowMock,
      ensureWebRuntimeReady,
      ensureSessionActive,
      parseActionRunOptions,
      runCommandWithRetry,
      withTiming,
      runMonitorCapture,
      parseMonitorOptions,
      assertRealResult,
      wrapCommandToolResult
    });
  }
  if (tool === "ada_mobile_recipe") {
    return handleMobileRecipe(args, {
      requireMobilePlatform,
      toCommandEnvelope,
      allowMock,
      withTiming,
      mobilePreflight,
      runCommand,
      assertRealResult,
      wrapCommandToolResult
    });
  }
  if (tool === "ada_mobile_dismiss_popups") {
    return handleMobileDismissPopups(args, {
      requireMobilePlatform,
      mcpTextResult
    });
  }
  if (tool === "ada_mobile_action") {
    return handleMobileAction(args, {
      normalizeCommand,
      ensureRiskAllowed,
      requireMobilePlatform,
      toCommandEnvelope,
      allowMock,
      withTiming,
      mobilePreflight,
      ensureSessionActive,
      parseActionRunOptions,
      runCommandWithRetry,
      runMonitorCapture,
      parseMonitorOptions,
      assertRealResult,
      wrapCommandToolResult
    });
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
        tools: {},
        resources: {}
      }
    }
  );
  wireAdaMcpProtocolServer(instance);
  return instance;
}

export const server = createAdaMcpProtocolServer();

export async function startMcpServer(): Promise<void> {
  installMcpStdioGuard();
  const binaryCommand = process.execPath;
  const cwd = process.cwd();
  const passedArgs = process.argv.slice(2);
  if (passedArgs.includes("mcp")) {
    mcpLog("warn", 'standalone binary does not need "mcp" arg; safe to remove');
  }
  const { launcherVersion, selfVersion, alignedLauncherVersion } = resolveStartPackageVersions();
  const versionLabel = selfVersion ? `@ada-mcp/mcp-server@${selfVersion}` : "@ada-mcp/mcp-server";
  if (shouldMcpLog("info")) {
    const { configHint, binaryHint, npmDevHint } = buildStartHints({
      binaryCommand,
      cwd,
      alignedLauncherVersion
    });
    mcpLogIfVerbose(`config hint (npm): ${JSON.stringify(configHint)}`);
    if (launcherVersion) {
      mcpLogIfVerbose(`launcher @ada-mcp/launcher@${launcherVersion}`);
    }
    mcpLogIfVerbose(`config hint (binary): ${JSON.stringify(binaryHint)}`);
    mcpLogIfVerbose(`config hint (npm dev): ${JSON.stringify(npmDevHint)}`);
  }

  process.once("SIGINT", () => {
    void gracefulShutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
  });
  process.once("disconnect", () => {
    void gracefulShutdown("disconnect");
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  mcpLogIfVerbose(`ready ${versionLabel} (stdio)`);
  wireStdinShutdownHandlers();
  scheduleBootstrapInstallDeps(passedArgs);
  mcpLogIfVerbose("dependency bootstrap scheduled in background");
}
