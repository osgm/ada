import path from "node:path";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { InstallScope } from "@ada/install-deps";
import { handleMobileAction, handleMobileRecipe, handleWebAction } from "./mcp-actions.js";
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
import { handleDevices, handleInstallDeps, handleStartOnce } from "./mcp-runtime-admin.js";
import { handleMobileDismissPopups, handleWebDismissPopups } from "./mcp-dismiss-popups.js";
import { handleWebRecipe } from "./mcp-web-recipe.js";
import type { AdaPlatform } from "./mcp-normalize.js";

export interface McpToolDispatchDeps {
  loadAgentConfig: () => Promise<Record<string, unknown>>;
  getHealthSnapshot: (options: {
    config?: Record<string, unknown>;
    includeHarmony?: boolean;
    fresh?: boolean;
  }) => Promise<Record<string, unknown>>;
  getDoctorSnapshot: (scope: string) => Promise<Record<string, unknown>>;
  getBuiltInPlugins: () => unknown;
  buildHealthBlockers: (...args: any[]) => any;
  buildSessionPolicy: (...args: any[]) => any;
  healthStatusFromBlockers: (...args: any[]) => any;
  mcpTextResult: (data: Record<string, unknown>, options?: any) => any;
  invalidateRuntimeCaches: () => void;
  scanMobileDevicesAndPersist: () => Promise<unknown>;
  scanDevicesAndListForDisplay: () => Promise<unknown>;
  getDeviceRegistrySnapshot: () => Promise<Record<string, unknown>>;
  parseInstallScope: (v: unknown) => InstallScope;
  installDependencies: (...args: any[]) => Promise<unknown>;
  runStartFlow: (...args: any[]) => Promise<unknown>;
  listActiveSessions: () => Array<{ sessionId: string }>;
  normalizePlatform: (...args: any[]) => AdaPlatform;
  mergeWebEngineIntoPayload: (args: Record<string, unknown>) => Record<string, unknown>;
  closeSession: (...args: any[]) => Promise<unknown>;
  closeAllSessions: () => Promise<unknown>;
  riskyCommandAllowlist: Set<string>;
  riskyCommandDefaults: string[];
  buildPerfSummary: () => Record<string, unknown>;
  perfStats: Map<string, number[]>;
  requireMobilePlatform: (value: unknown) => AdaPlatform;
  mobilePreflight: (platform: AdaPlatform) => Promise<void>;
  withTiming: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  asRecord: (value: unknown) => Record<string, unknown>;
  normalizeCommand: (value: unknown) => string;
  ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
  toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
  allowMock: (args: Record<string, unknown>) => boolean;
  executeWithTimeout: (...args: any[]) => Promise<CommandResult>;
  assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
  buildRecoveryFields: (...args: any[]) => Record<string, unknown>;
  runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
  toExtractResponse: (input: {
    source: "web" | "mobile";
    mode: string;
    platform?: AdaPlatform;
    result: CommandResult;
    maxItems?: number;
  }) => Record<string, unknown>;
  ensureSessionActive: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
  ensureWebPageReadyForTool: (sessionId: string, command: string) => Promise<void>;
  ensureMobileSessionReadyForTool: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
  wrapAssertionResult: (...args: any[]) => any;
  resolveTaskPath: (file: string) => string;
  loadTaskFile: (taskFilePath: string) => Promise<CommandEnvelope[]>;
  parseMonitorOptions: (args: Record<string, unknown>) => Record<string, unknown>;
  runMonitorCapture: (...args: any[]) => Promise<void> | void;
  ensureRealPayloadForPlatform: (
    platform: AdaPlatform,
    payload: Record<string, unknown>,
    allowMock?: boolean
  ) => Record<string, unknown>;
  buildInvokeCommandPayload: (args: Record<string, unknown>) => Record<string, unknown>;
  ensureWebRuntimeReady: (...args: any[]) => Promise<void>;
  parseActionRunOptions: (...args: any[]) => any;
  runCommandWithRetry: (...args: any[]) => Promise<{ result: CommandResult; attempts: number }>;
  wrapCommandToolResult: (...args: any[]) => any;
}

export async function dispatchAdaMcpTool(
  tool: string,
  args: Record<string, unknown>,
  deps: McpToolDispatchDeps
): Promise<unknown> {
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
        withTiming: deps.withTiming,
        asRecord: deps.asRecord,
        normalizeCommand: deps.normalizeCommand,
        ensureRiskAllowed: deps.ensureRiskAllowed,
        toCommandEnvelope: deps.toCommandEnvelope,
        allowMock: deps.allowMock,
        executeWithTimeout: deps.executeWithTimeout,
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
