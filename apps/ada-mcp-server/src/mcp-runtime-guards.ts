import fs from "node:fs/promises";

import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { truncateViewTreeValue } from "@ada/driver-rpc";
import {
  invalidateDependencyHealthCache,
  type InstallDepsConfig,
  type InstallScope
} from "@ada/install-deps";
import { invalidateDoctorSnapshotCache } from "@ada/agent-core";

import { loadAgentConfig } from "./config.js";
import { listActiveSessions, runCommand } from "./executor.js";
import { shouldPreflightSession } from "./mcp-action-runner.js";
import { ensureMobileSessionReady as probeMobileSession } from "./mcp-mobile-session-liveness.js";
import { normalizeCommand, normalizePlatform, type AdaPlatform } from "./mcp-normalize.js";
import { isMcpExtractRaw } from "./mcp-response-mode.js";
import { invalidateRuntimePreflightCache, ensureMobileRuntimeReady } from "./mcp-runtime-preflight.js";
import { assertSessionNotReleased } from "./mcp-released-sessions.js";
import { ensureWebPageReady as probeAndRecoverWebPage } from "./mcp-session-liveness.js";
import { captureMcpMonitor, type MonitorOptions } from "./monitoring.js";
import { asRecord } from "./mcp-utils.js";

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
  command: string,
  options?: { forceReuseReleasedSession?: boolean }
): Promise<void> {
  if (sessionId === "mcp-session" || sessionId === "mcp-batch" || sessionId === "mcp-invoke" || sessionId === "mcp-extract") {
    return;
  }
  // 已释放的 sessionId：所有命令（含 navigate）均拦截，强制换新 id，预防幽灵会话错误
  assertSessionNotReleased(platform, sessionId, command, {
    allowForceReuse: true,
    forceReuse: options?.forceReuseReleasedSession === true
  });
  if (!shouldPreflightSession(command, platform)) {
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
