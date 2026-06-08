import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { AdaPlatform } from "./mcp-normalize.js";
import type { ActionRunOptions } from "./mcp-action-runner.js";
import type { MonitorOptions } from "./monitoring.js";
import { isBestEffortRequest, wrapBestEffortCommandResult } from "./mcp-result.js";
import { isLocatorFailure } from "./mcp-recovery.js";
import {
  guardMobileCommandIfNeeded,
  guardWebCommandIfNeeded,
  recordMobileCommandIfNeeded,
  recordWebCommandIfNeeded
} from "./mcp-action-ledger.js";
import { invalidateMobileDumpAfterCommand } from "./mcp-mobile-dump-cache.js";
import { trackWebLastUrl } from "./mcp-session-liveness.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export async function handleWebAction(
  args: Record<string, unknown>,
  deps: {
    normalizeCommand: (value: unknown) => string;
    ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
    mergeWebEngineIntoPayload: (args: Record<string, unknown>) => Record<string, unknown>;
    allowMock: (args: Record<string, unknown>) => boolean;
    ensureWebRuntimeReady: () => Promise<void>;
    ensureSessionActive: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
    ensureWebPageReady?: (sessionId: string, command: string) => Promise<void>;
    parseActionRunOptions: (args: Record<string, unknown>) => ActionRunOptions;
    runCommandWithRetry: (
      command: CommandEnvelope,
      options: ActionRunOptions
    ) => Promise<{ result: CommandResult; attempts: number }>;
    withTiming: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
    runMonitorCapture: (command: CommandEnvelope, result: CommandResult, monitor: MonitorOptions) => Promise<void> | void;
    parseMonitorOptions: (args: Record<string, unknown>) => MonitorOptions;
    assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
    wrapCommandToolResult: (input: {
      tool: string;
      envelope: CommandEnvelope;
      result: CommandResult;
      attempts?: number;
    }) => any;
  }
): Promise<any> {
  const command = deps.normalizeCommand(args.command);
  deps.ensureRiskAllowed(command, args);
  if (["swipe", "home", "launchApp", "exitApp"].includes(command)) {
    throw new Error(`web_action does not support command: ${command}`);
  }
  const envelope = deps.toCommandEnvelope(
    {
      ...args,
      platform: "web",
      command,
      payload: deps.mergeWebEngineIntoPayload(args)
    },
    deps.allowMock(args)
  );
  await deps.ensureWebRuntimeReady();
  await deps.ensureSessionActive("web", envelope.sessionId, command);
  if (deps.ensureWebPageReady) {
    await deps.ensureWebPageReady(envelope.sessionId, command);
  }
  const payload = asRecord(envelope.payload);
  guardWebCommandIfNeeded("web", envelope.sessionId, command, payload);
  const runOpts = deps.parseActionRunOptions(args);
  const { result, attempts } = await deps.withTiming(`runCommand(web:${command})`, () => deps.runCommandWithRetry(envelope, runOpts));
  recordWebCommandIfNeeded("web", envelope.sessionId, command, payload, result);
  if (command === "navigate" && result.success) {
    const url = typeof payload.url === "string" ? payload.url : undefined;
    if (url) {
      trackWebLastUrl(envelope.sessionId, url);
    }
  }
  const maybeJob = deps.runMonitorCapture(envelope, result, deps.parseMonitorOptions(args));
  if (maybeJob) {
    await maybeJob;
  }
  deps.assertRealResult(result, "ada_web_action", deps.allowMock(args));
  if (!result.success && isBestEffortRequest(args) && isLocatorFailure(result)) {
    return wrapBestEffortCommandResult({ tool: "ada_web_action", envelope, result, attempts });
  }
  return deps.wrapCommandToolResult({ tool: "ada_web_action", envelope, result, attempts });
}

export async function handleMobileRecipe(
  args: Record<string, unknown>,
  deps: {
    requireMobilePlatform: (value: unknown) => AdaPlatform;
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
    allowMock: (args: Record<string, unknown>) => boolean;
    withTiming: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
    mobilePreflight: (platform: AdaPlatform) => Promise<void>;
    ensureSessionActive?: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
    ensureMobileSessionReady?: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
    runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
    assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
    wrapCommandToolResult: (input: {
      tool: string;
      envelope: CommandEnvelope;
      result: CommandResult;
      attempts?: number;
    }) => any;
  }
): Promise<any> {
  const platform = deps.requireMobilePlatform(args.platform);
  const action = String(args.action ?? "").trim();
  if (!action) {
    throw new Error("ada_mobile_recipe requires action");
  }
  const payload = {
    ...(asRecord(args.payload) || {}),
    action,
    ...(args.path !== undefined ? { path: args.path } : {}),
    ...(args.text != null && args.text !== "" ? { text: args.text } : {})
  };
  const envelope = deps.toCommandEnvelope(
    {
      ...args,
      platform,
      command: "recipe",
      payload
    },
    deps.allowMock(args)
  );
  await deps.withTiming(`ensureMobileRuntimeReady(${platform})`, () => deps.mobilePreflight(platform));
  if (deps.ensureSessionActive) {
    await deps.ensureSessionActive(platform, envelope.sessionId, "recipe");
  }
  if (deps.ensureMobileSessionReady) {
    await deps.ensureMobileSessionReady(platform, envelope.sessionId, "recipe");
  }
  guardMobileCommandIfNeeded(platform, envelope.sessionId, "recipe", payload);
  const result = await deps.withTiming(`runCommand(${platform}:recipe:${action})`, () => deps.runCommand(envelope));
  if (result.success) {
    invalidateMobileDumpAfterCommand(platform, envelope.sessionId, "recipe");
    recordMobileCommandIfNeeded(platform, envelope.sessionId, "recipe", payload, result);
  }
  deps.assertRealResult(result, "ada_mobile_recipe", deps.allowMock(args));
  return deps.wrapCommandToolResult({ tool: "ada_mobile_recipe", envelope, result });
}

export async function handleMobileAction(
  args: Record<string, unknown>,
  deps: {
    normalizeCommand: (value: unknown) => string;
    ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
    requireMobilePlatform: (value: unknown) => AdaPlatform;
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
    allowMock: (args: Record<string, unknown>) => boolean;
    withTiming: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
    mobilePreflight: (platform: AdaPlatform) => Promise<void>;
    ensureSessionActive: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
    ensureMobileSessionReady?: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
    parseActionRunOptions: (args: Record<string, unknown>) => ActionRunOptions;
    runCommandWithRetry: (
      command: CommandEnvelope,
      options: ActionRunOptions
    ) => Promise<{ result: CommandResult; attempts: number }>;
    runMonitorCapture: (command: CommandEnvelope, result: CommandResult, monitor: MonitorOptions) => Promise<void> | void;
    parseMonitorOptions: (args: Record<string, unknown>) => MonitorOptions;
    assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
    wrapCommandToolResult: (input: {
      tool: string;
      envelope: CommandEnvelope;
      result: CommandResult;
      attempts?: number;
    }) => any;
  }
): Promise<any> {
  const command = deps.normalizeCommand(args.command);
  deps.ensureRiskAllowed(command, args);
  if (["navigate", "hover", "press", "select", "scroll", "reload", "closeTab", "forward", "newTab", "switchTab", "uploadFile", "dragDrop"].includes(command)) {
    throw new Error(`mobile_action does not support command: ${command}`);
  }
  const envelope = deps.toCommandEnvelope(
    {
      ...args,
      platform: deps.requireMobilePlatform(args.platform),
      command
    },
    deps.allowMock(args)
  );
  await deps.withTiming(`ensureMobileRuntimeReady(${envelope.platform})`, () => deps.mobilePreflight(envelope.platform));
  await deps.ensureSessionActive(envelope.platform, envelope.sessionId, command);
  if (deps.ensureMobileSessionReady) {
    await deps.ensureMobileSessionReady(envelope.platform, envelope.sessionId, command);
  }
  const payload = asRecord(envelope.payload);
  guardMobileCommandIfNeeded(envelope.platform, envelope.sessionId, command, payload);
  const runOpts = deps.parseActionRunOptions(args);
  const { result, attempts } = await deps.withTiming(`runCommand(${envelope.platform}:${command})`, () => deps.runCommandWithRetry(envelope, runOpts));
  if (result.success) {
    invalidateMobileDumpAfterCommand(envelope.platform, envelope.sessionId, command);
    recordMobileCommandIfNeeded(envelope.platform, envelope.sessionId, command, payload, result);
  }
  const maybeJob = deps.runMonitorCapture(envelope, result, deps.parseMonitorOptions(args));
  if (maybeJob) {
    await maybeJob;
  }
  deps.assertRealResult(result, "ada_mobile_action", deps.allowMock(args));
  if (!result.success && isBestEffortRequest(args) && isLocatorFailure(result)) {
    return wrapBestEffortCommandResult({ tool: "ada_mobile_action", envelope, result, attempts });
  }
  return deps.wrapCommandToolResult({ tool: "ada_mobile_action", envelope, result, attempts });
}
