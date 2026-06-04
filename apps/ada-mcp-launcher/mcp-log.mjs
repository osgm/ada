/**
 * Launcher stderr 分级（Host 常将 stderr 一律显示为 error）
 */

/** @typedef {"info" | "warn" | "error"} McpLogLevel */

const RANK = { info: 10, warn: 20, error: 30 };

function isTruthy(name) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** @returns {McpLogLevel} */
export function resolveMcpLogLevel() {
  if (isTruthy("ADA_MCP_QUIET")) return "error";
  const raw = String(process.env.ADA_MCP_LOG_LEVEL ?? "").trim().toLowerCase();
  if (raw === "info" || raw === "warn" || raw === "error") return raw;
  if (isTruthy("ADA_MCP_VERBOSE")) return "info";
  return "error";
}

/** @param {McpLogLevel} level */
export function shouldMcpLog(level) {
  return RANK[level] >= RANK[resolveMcpLogLevel()];
}

/** @param {McpLogLevel} level @param {string} message */
export function mcpLog(level, message) {
  if (!shouldMcpLog(level)) return;
  console.error(`[ada-mcp][${level}] ${message}`);
}

/** @param {string} message */
export function mcpLogIfVerbose(message) {
  if (isTruthy("ADA_MCP_VERBOSE") || isTruthy("ADA_MCP_STARTUP_HINTS")) {
    mcpLog("info", message);
  }
}
