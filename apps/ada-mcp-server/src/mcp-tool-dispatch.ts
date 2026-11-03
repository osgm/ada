import path from "node:path";
import type { CommandEnvelope, CommandResult, PluginManifest, WebEngine } from "@ada/contracts";
import type { InstallScope, InstallSummary } from "@ada/install-deps";
import { handleMobileAction, handleMobileRecipe, handleWebAction } from "./mcp-actions.js";
import type { ActionRunOptions } from "./mcp-action-runner.js";
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
import { handleInvoke, handleRunTaskFile } from "./mcp-execution.js";
import { handleMobileExtract, handleWebExtract } from "./mcp-extract.js";
import { handleDiagnosticsTool, handleHealthTool } from "./mcp-health-diagnostics.js";
import type { HealthBlocker, SessionPolicy } from "./mcp-health-enrich.js";
import { handleDevices, handleInstallDeps, handleStartOnce } from "./mcp-runtime-admin.js";
import { handleMobileDismissPopups, handleWebDismissPopups } from "./mcp-dismiss-popups.js";
import { handleWebRecipe } from "./mcp-web-recipe.js";
import type { AdaPlatform } from "./mcp-normalize.js";
import type { McpErrorKind } from "./mcp-recovery.js";
import type { McpResultOptions } from "./mcp-result.js";
import type { MonitorOptions } from "./monitoring.js";

type MobilePlatform = Exclude<AdaPlatform, "web">;

/** 公共：配置 / 返回 / 风险 / 计时 */
export interface McpDispatchCoreDeps {
  loadAgentConfig: () => Promise<Record<string, unknown>>;
  mcpTextResult: (data: unknown, options?: McpResultOptions) => unknown;
  asRecord: (value: unknown) => Record<string, unknown>;
  withTiming: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  normalizePlatform: (value: unknown, options?: { allowDefaultWeb?: boolean }) => AdaPlatform;
  normalizeCommand: (value: unknown) => string;
  allowMock: (args: Record<string, unknown>) => boolean;
  ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
  toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
  assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
  buildRecoveryFields: (input: {
    tool: string;
    envelope?: CommandEnvelope;
    result?: CommandResult;
    errorKind: McpErrorKind;
    sessionId?: string;
    platform?: AdaPlatform;
  }) => { recoveryPlan: unknown; recoveryHint: string };
  wrapCommandToolResult: (input: {
    tool: string;
    envelope: CommandEnvelope;
    result: CommandResult;
    attempts?: number;
  }) => unknown;
  wrapAssertionResult: (input: {
    tool: string;
    sessionId: string;
    platform?: AdaPlatform;
    type: string;
    pass: boolean;
    details: Record<string, unknown>;
    result?: CommandResult;
  }) => unknown;
  parseMonitorOptions: (args: Record<string, unknown>) => MonitorOptions;
  runMonitorCapture: (
    command: CommandEnvelope,
    result: CommandResult,
    options: MonitorOptions
  ) => Promise<void> | void;
  parseActionRunOptions: (args: Record<string, unknown>) => ActionRunOptions;
  runCommandWithRetry: (
    command: CommandEnvelope,
    options: ActionRunOptions
  ) => Promise<{ result: CommandResult; attempts: number }>;
  executeWithTimeout: (command: CommandEnvelope, timeoutMs?: number) => Promise<CommandResult>;
  runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
}

/** Health / diagnostics / plugins / config */
export interface McpDispatchAdminDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getHealthSnapshot: (options: any) => Promise<Record<string, unknown>>;
  getDoctorSnapshot: (scope: "web" | "mobile" | "all" | string) => Promise<Record<string, unknown>>;
  getBuiltInPlugins: () => PluginManifest[] | unknown[];
  buildHealthBlockers: (
    snapshot: Record<string, unknown>,
    scope: "web" | "mobile" | "all",
    config?: Record<string, unknown>
  ) => Promise<HealthBlocker[]>;
  buildSessionPolicy: () => SessionPolicy;
  healthStatusFromBlockers: (blockers: HealthBlocker[]) => "ok" | "degraded";
  invalidateRuntimeCaches: () => void;
  scanMobileDevicesAndPersist: (options: { deviceTags: string[] }) => Promise<Record<string, unknown>>;
  scanDevicesAndListForDisplay: () => Promise<Record<string, unknown>>;
  getDeviceRegistrySnapshot: () => Promise<Record<string, unknown>>;
  parseInstallScope: (v: unknown) => InstallScope;
  installDependencies: (
    only: InstallScope,
    force: boolean,
    onLogLine: (line: string) => void
  ) => Promise<InstallSummary | unknown>;
  runStartFlow: (options: {
    runOnce: boolean;
    localDev: boolean;
    skipDeps: boolean;
    runWatch: boolean;
  }) => Promise<void>;
  listActiveSessions: () => Array<{
    platform: string;
    sessionId: string;
    engine?: WebEngine;
    driverSessionId: string;
  }>;
  mergeWebEngineIntoPayload: (args: Record<string, unknown>) => Record<string, unknown>;
  closeSession: (
    platform: CommandEnvelope["platform"],
    sessionId: string,
    options?: { engine?: WebEngine; payload?: Record<string, unknown> }
  ) => Promise<boolean>;
  closeAllSessions: () => Promise<number>;
  riskyCommandAllowlist: Set<string>;
  riskyCommandDefaults: string[];
  buildPerfSummary: () => Record<string, unknown>;
  perfStats: Map<string, number[]>;
}

/** Web / mobile action runtime */
export interface McpDispatchRuntimeDeps {
  requireMobilePlatform: (value: unknown) => MobilePlatform;
  mobilePreflight: (platform: AdaPlatform) => Promise<void>;
  ensureWebRuntimeReady: () => Promise<void>;
  ensureSessionActive: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
  ensureWebPageReadyForTool: (sessionId: string, command: string) => Promise<void>;
  ensureMobileSessionReadyForTool: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
  toExtractResponse: (input: {
    source: "web" | "mobile";
    mode: string;
    platform?: AdaPlatform;
    result: CommandResult;
    maxItems?: number;
  }) => Record<string, unknown>;
  resolveTaskPath: (file: string) => string;
  loadTaskFile: (taskFilePath: string) => Promise<CommandEnvelope[]>;
  ensureRealPayloadForPlatform: (
    platform: AdaPlatform,
    payload: Record<string, unknown>,
    allowMock?: boolean
  ) => Record<string, unknown>;
  buildInvokeCommandPayload: (args: Record<string, unknown>) => Record<string, unknown>;
}

export type McpToolDispatchDeps = McpDispatchCoreDeps & McpDispatchAdminDeps & McpDispatchRuntimeDeps;

export async function dispatchAdaMcpTool(
  tool: string,
  args: Record<string, unknown>,
  deps: McpToolDispatchDeps
  // MCP SDK ServerResult is a wide structural type; keep runtime flexible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  switch (tool) {
    case "ada_health":
      return handleHealthTool(args, {
        loadAgentConfig: deps.loadAgentConfig,
        getHealthSnapshot: deps.getHealthSnapshot,
        buildHealthBlockers: deps.buildHealthBlockers,
        buildSessionPolicy: deps.buildSessionPolicy,
        healthStatusFromBlockers: deps.healthStatusFromBlockers,
        mcpTextResult: deps.mcpTextResult
      });
    case "ada_diagnostics":
      return handleDiagnosticsTool(args, {
        getDoctorSnapshot: deps.getDoctorSnapshot,
        mcpTextResult: deps.mcpTextResult
      });
    case "ada_plugins":
      return handlePlugins({ getBuiltInPlugins: deps.getBuiltInPlugins, mcpTextResult: deps.mcpTextResult });
    case "ada_config":
      return handleConfig({ loadAgentConfig: deps.loadAgentConfig, mcpTextResult: deps.mcpTextResult });
    case "ada_devices":
      return handleDevices(args, {
        invalidateRuntimeCaches: deps.invalidateRuntimeCaches,
        scanMobileDevicesAndPersist: deps.scanMobileDevicesAndPersist,
        scanDevicesAndListForDisplay: deps.scanDevicesAndListForDisplay,
        getDeviceRegistrySnapshot: deps.getDeviceRegistrySnapshot,
        mcpTextResult: deps.mcpTextResult
      });
    case "ada_install_deps":
      return handleInstallDeps(args, {
        parseInstallScope: deps.parseInstallScope,
        installDependencies: deps.installDependencies,
        invalidateRuntimeCaches: deps.invalidateRuntimeCaches,
        mcpTextResult: deps.mcpTextResult
      });
    case "ada_start_once":
      return handleStartOnce(args, { runStartFlow: deps.runStartFlow, mcpTextResult: deps.mcpTextResult });
    case "ada_sessions":
      return handleSessions({ listActiveSessions: deps.listActiveSessions, mcpTextResult: deps.mcpTextResult });
    case "ada_close_session":
      return handleCloseSession(args, {
        normalizePlatform: deps.normalizePlatform,
        mergeWebEngineIntoPayload: deps.mergeWebEngineIntoPayload,
        closeSession: deps.closeSession,
        mcpTextResult: deps.mcpTextResult
      });
    case "ada_close_all_sessions":
      return handleCloseAllSessions({ closeAllSessions: deps.closeAllSessions, mcpTextResult: deps.mcpTextResult });
    case "ada_risk_policy":
      return handleRiskPolicy(args, {
        riskyCommandAllowlist: deps.riskyCommandAllowlist,
        riskyCommandDefaults: deps.riskyCommandDefaults,
        mcpTextResult: deps.mcpTextResult
      });
    case "ada_perf_summary":
      return handlePerfSummary(args, {
        buildPerfSummary: deps.buildPerfSummary,
        perfStats: deps.perfStats,
        mcpTextResult: deps.mcpTextResult
      });
    case "ada_batch_actions":
      return handleBatchActions(args, {
        normalizePlatform: deps.normalizePlatform,
        mobilePreflight: deps.mobilePreflight,
        ensureWebRuntimeReady: deps.ensureWebRuntimeReady,
        ensureSessionActive: deps.ensureSessionActive,
        ensureWebPageReady: deps.ensureWebPageReadyForTool,
        ensureMobileSessionReady: deps.ensureMobileSessionReadyForTool,
        withTiming: deps.withTiming,
        asRecord: deps.asRecord,
        normalizeCommand: deps.normalizeCommand,
        ensureRiskAllowed: deps.ensureRiskAllowed,
        toCommandEnvelope: deps.toCommandEnvelope,
        allowMock: deps.allowMock,
        runCommandWithRetry: deps.runCommandWithRetry,
        assertRealResult: deps.assertRealResult,
        mcpTextResult: deps.mcpTextResult,
        buildRecoveryFields: deps.buildRecoveryFields
      });
    case "ada_extract":
      return handleWebExtract(args, {
        runCommand: deps.runCommand,
        toCommandEnvelope: deps.toCommandEnvelope,
        allowMock: deps.allowMock,
        ensureRiskAllowed: deps.ensureRiskAllowed,
        assertRealResult: deps.assertRealResult,
        toExtractResponse: deps.toExtractResponse,
        mcpTextResult: deps.mcpTextResult,
        ensureSessionActive: deps.ensureSessionActive,
        ensureWebPageReady: deps.ensureWebPageReadyForTool
      });
    case "ada_assertions":
      return handleWebAssertions(args, {
        runCommand: deps.runCommand,
        toCommandEnvelope: deps.toCommandEnvelope,
        allowMock: deps.allowMock,
        ensureRiskAllowed: deps.ensureRiskAllowed,
        assertRealResult: deps.assertRealResult,
        wrapAssertionResult: deps.wrapAssertionResult
      });
    case "ada_mobile_extract":
      return handleMobileExtract(args, {
        requireMobilePlatform: deps.requireMobilePlatform,
        mobilePreflight: deps.mobilePreflight,
        runCommand: deps.runCommand,
        toCommandEnvelope: deps.toCommandEnvelope,
        allowMock: deps.allowMock,
        ensureRiskAllowed: deps.ensureRiskAllowed,
        assertRealResult: deps.assertRealResult,
        toExtractResponse: deps.toExtractResponse,
        mcpTextResult: deps.mcpTextResult,
        ensureSessionActive: deps.ensureSessionActive,
        ensureMobileSessionReady: deps.ensureMobileSessionReadyForTool
      });
    case "ada_mobile_assertions":
      return handleMobileAssertions(args, {
        requireMobilePlatform: deps.requireMobilePlatform,
        mobilePreflight: deps.mobilePreflight,
        runCommand: deps.runCommand,
        toCommandEnvelope: deps.toCommandEnvelope,
        allowMock: deps.allowMock,
        assertRealResult: deps.assertRealResult,
        wrapAssertionResult: deps.wrapAssertionResult
      });
    case "ada_run_task_file":
      return handleRunTaskFile(args, {
        resolveTaskPath: deps.resolveTaskPath,
        loadTaskFile: deps.loadTaskFile,
        runCommand: deps.runCommand,
        parseMonitorOptions: deps.parseMonitorOptions,
        runMonitorCapture: deps.runMonitorCapture,
        allowMock: deps.allowMock,
        assertRealResult: deps.assertRealResult,
        mcpTextResult: deps.mcpTextResult,
        buildRecoveryFields: deps.buildRecoveryFields
      });
    case "ada_invoke":
      return handleInvoke(args, {
        ensureRiskAllowed: deps.ensureRiskAllowed,
        normalizePlatform: deps.normalizePlatform,
        ensureSessionActive: deps.ensureSessionActive,
        ensureWebPageReady: deps.ensureWebPageReadyForTool,
        ensureRealPayloadForPlatform: deps.ensureRealPayloadForPlatform,
        buildInvokeCommandPayload: deps.buildInvokeCommandPayload,
        allowMock: deps.allowMock,
        withTiming: deps.withTiming,
        mobilePreflight: deps.mobilePreflight,
        runCommand: deps.runCommand,
        runMonitorCapture: deps.runMonitorCapture,
        parseMonitorOptions: deps.parseMonitorOptions,
        assertRealResult: deps.assertRealResult,
        wrapCommandToolResult: deps.wrapCommandToolResult
      });
    case "ada_web_recipe":
      return handleWebRecipe(args, {
        toCommandEnvelope: deps.toCommandEnvelope,
        allowMock: deps.allowMock,
        ensureWebRuntimeReady: deps.ensureWebRuntimeReady,
        ensureSessionActive: deps.ensureSessionActive,
        ensureWebPageReady: deps.ensureWebPageReadyForTool,
        runCommand: deps.runCommand,
        assertRealResult: deps.assertRealResult,
        wrapCommandToolResult: deps.wrapCommandToolResult
      });
    case "ada_web_dismiss_popups":
      return handleWebDismissPopups(args, {
        mergeWebEngineIntoPayload: deps.mergeWebEngineIntoPayload,
        mcpTextResult: deps.mcpTextResult
      });
    case "ada_web_action":
      return handleWebAction(args, {
        normalizeCommand: deps.normalizeCommand,
        ensureRiskAllowed: deps.ensureRiskAllowed,
        toCommandEnvelope: deps.toCommandEnvelope,
        mergeWebEngineIntoPayload: deps.mergeWebEngineIntoPayload,
        allowMock: deps.allowMock,
        ensureWebRuntimeReady: deps.ensureWebRuntimeReady,
        ensureSessionActive: deps.ensureSessionActive,
        ensureWebPageReady: deps.ensureWebPageReadyForTool,
        parseActionRunOptions: deps.parseActionRunOptions,
        runCommandWithRetry: deps.runCommandWithRetry,
        withTiming: deps.withTiming,
        runMonitorCapture: deps.runMonitorCapture,
        parseMonitorOptions: deps.parseMonitorOptions,
        assertRealResult: deps.assertRealResult,
        wrapCommandToolResult: deps.wrapCommandToolResult
      });
    case "ada_mobile_recipe":
      return handleMobileRecipe(args, {
        requireMobilePlatform: deps.requireMobilePlatform,
        toCommandEnvelope: deps.toCommandEnvelope,
        allowMock: deps.allowMock,
        withTiming: deps.withTiming,
        mobilePreflight: deps.mobilePreflight,
        ensureSessionActive: deps.ensureSessionActive,
        ensureMobileSessionReady: deps.ensureMobileSessionReadyForTool,
        runCommand: deps.runCommand,
        assertRealResult: deps.assertRealResult,
        wrapCommandToolResult: deps.wrapCommandToolResult
      });
    case "ada_mobile_dismiss_popups":
      return handleMobileDismissPopups(args, {
        requireMobilePlatform: deps.requireMobilePlatform,
        mcpTextResult: deps.mcpTextResult
      });
    case "ada_mobile_action":
      return handleMobileAction(args, {
        normalizeCommand: deps.normalizeCommand,
        ensureRiskAllowed: deps.ensureRiskAllowed,
        requireMobilePlatform: deps.requireMobilePlatform,
        toCommandEnvelope: deps.toCommandEnvelope,
        allowMock: deps.allowMock,
        withTiming: deps.withTiming,
        mobilePreflight: deps.mobilePreflight,
        ensureSessionActive: deps.ensureSessionActive,
        ensureMobileSessionReady: deps.ensureMobileSessionReadyForTool,
        parseActionRunOptions: deps.parseActionRunOptions,
        runCommandWithRetry: deps.runCommandWithRetry,
        runMonitorCapture: deps.runMonitorCapture,
        parseMonitorOptions: deps.parseMonitorOptions,
        assertRealResult: deps.assertRealResult,
        wrapCommandToolResult: deps.wrapCommandToolResult
      });
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

export function resolveTaskPath(file: string): string {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}
