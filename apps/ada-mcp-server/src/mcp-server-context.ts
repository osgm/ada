/**
 * MCP server runtime helpers — barrel re-exports.
 * Implementation split for maintainability:
 * - mcp-runtime-guards.ts: risk / envelope / session readiness
 * - mcp-perf.ts: timing stats
 * - mcp-stdin-lifecycle.ts: stdin disconnect / graceful shutdown
 */

export { asRecord } from "./mcp-utils.js";

export {
  allowMock,
  assertRealResult,
  buildInvokeCommandPayload,
  ensureMobileSessionReadyForTool,
  ensureRealPayloadForPlatform,
  ensureRiskAllowed,
  ensureSessionActive,
  ensureWebPageReadyForTool,
  invalidateRuntimeCaches,
  loadTaskFile,
  mergeWebEngineIntoPayload,
  mobilePreflight,
  parseInstallScope,
  parseMonitorOptions,
  riskyCommandAllowlist,
  riskyCommandDefaults,
  runMonitorCapture,
  toCommandEnvelope,
  toExtractResponse
} from "./mcp-runtime-guards.js";

export { buildPerfSummary, perfStats, withTiming } from "./mcp-perf.js";

export { gracefulShutdown, wireStdinShutdownHandlers } from "./mcp-stdin-lifecycle.js";
