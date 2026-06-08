import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import {
  getBuiltInPlugins,
  getDeviceRegistrySnapshot,
  getDoctorSnapshot,
  getHealthSnapshot,
  installDependencies,
  runStartFlow,
  scanDevicesAndListForDisplay,
  scanMobileDevicesAndPersist
} from "@ada/agent-core";
import {
  ensureStandaloneMcpProbeSeed,
  registerInstallProgressSink,
  scheduleBootstrapInstallDeps,
  setBootstrapLogEmitter
} from "@ada/install-deps";

import { ensureWinConsoleUtf8 } from "./console-encoding.js";
import { loadAgentConfig } from "./config.js";
import { closeAllSessions, closeSession, listActiveSessions, runCommand } from "./executor.js";
import { buildAdaMcpToolDefinitions } from "./mcp-tool-definitions.js";
import { normalizeCommand, normalizePlatform, requireMobilePlatform } from "./mcp-normalize.js";
import {
  ensureWebRuntimeReady,
  executeWithTimeout,
  parseActionRunOptions,
  runCommandWithRetry
} from "./mcp-action-runner.js";
import { buildHealthBlockers, buildSessionPolicy, healthStatusFromBlockers } from "./mcp-health-enrich.js";
import { dispatchAdaMcpTool, resolveTaskPath } from "./mcp-tool-dispatch.js";
import { mcpTextResult, wrapAssertionResult, wrapCommandToolResult } from "./mcp-result.js";
import { registerAdaMcpResources } from "./mcp-resources.js";
import { applyMcpRuntimeConfigFromRecord } from "./mcp-response-mode.js";
import { buildStartHints, resolveStartPackageVersions } from "./mcp-start-hints.js";
import { resolveRecoveryFields } from "./mcp-payload-slim.js";
import {
  allowMock,
  asRecord,
  assertRealResult,
  buildInvokeCommandPayload,
  buildPerfSummary,
  ensureMobileSessionReadyForTool,
  ensureRealPayloadForPlatform,
  ensureRiskAllowed,
  ensureSessionActive,
  ensureWebPageReadyForTool,
  gracefulShutdown,
  invalidateRuntimeCaches,
  loadTaskFile,
  mergeWebEngineIntoPayload,
  mobilePreflight,
  parseInstallScope,
  parseMonitorOptions,
  perfStats,
  riskyCommandAllowlist,
  riskyCommandDefaults,
  runMonitorCapture,
  toCommandEnvelope,
  toExtractResponse,
  wireStdinShutdownHandlers,
  withTiming
} from "./mcp-server-context.js";
import { mcpEmitInstallProgress, mcpLog, mcpLogIfVerbose, registerMcpLogServer, shouldMcpLog } from "./mcp-log.js";
import { installMcpStdioGuard } from "./mcp-stdio-guard.js";

function normalizeToolName(raw: unknown): string {
  return String(raw ?? "").trim();
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
    return dispatchAdaMcpTool(tool, args, {
      loadAgentConfig,
      getHealthSnapshot: (options) => getHealthSnapshot(options),
      getDoctorSnapshot: (scope) => getDoctorSnapshot(scope),
      getBuiltInPlugins,
      buildHealthBlockers,
      buildSessionPolicy,
      healthStatusFromBlockers,
      mcpTextResult,
      invalidateRuntimeCaches,
      scanMobileDevicesAndPersist,
      scanDevicesAndListForDisplay,
      getDeviceRegistrySnapshot,
      parseInstallScope,
      installDependencies,
      runStartFlow,
      listActiveSessions,
      normalizePlatform,
      mergeWebEngineIntoPayload,
      closeSession,
      closeAllSessions,
      riskyCommandAllowlist,
      riskyCommandDefaults,
      buildPerfSummary,
      perfStats,
      requireMobilePlatform,
      mobilePreflight,
      withTiming,
      asRecord,
      normalizeCommand,
      ensureRiskAllowed,
      toCommandEnvelope,
      allowMock,
      executeWithTimeout,
      assertRealResult,
      buildRecoveryFields: resolveRecoveryFields,
      runCommand,
      toExtractResponse,
      ensureSessionActive,
      ensureWebPageReadyForTool,
      ensureMobileSessionReadyForTool,
      wrapAssertionResult,
      resolveTaskPath,
      loadTaskFile,
      parseMonitorOptions,
      runMonitorCapture,
      ensureRealPayloadForPlatform,
      buildInvokeCommandPayload,
      ensureWebRuntimeReady,
      parseActionRunOptions,
      runCommandWithRetry,
      wrapCommandToolResult
    });
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
        resources: {},
        logging: {}
      }
    }
  );
  wireAdaMcpProtocolServer(instance);
  return instance;
}

export const server = createAdaMcpProtocolServer();

export async function startMcpServer(): Promise<void> {
  ensureWinConsoleUtf8();
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
  registerMcpLogServer(server, true);
  registerInstallProgressSink((event) => mcpEmitInstallProgress(event));
  setBootstrapLogEmitter((level, body) => {
    mcpLog(level, body);
  });
  mcpLogIfVerbose(`ready ${versionLabel} (stdio)`);
  wireStdinShutdownHandlers();
  await ensureStandaloneMcpProbeSeed((line) => mcpLogIfVerbose(line));
  scheduleBootstrapInstallDeps(passedArgs);
  mcpLogIfVerbose("dependency bootstrap scheduled in background");
}
