/**
 * Launcher 日志：默认写 stderr（Cursor/JoyCode MCP 输出面板只展示 stderr）。
 * 面板可能把 stderr 标成 [error]，请以行内 [ada-mcp][info|warn|error] 为准。
 * 仅走 MCP logging、不写 stderr：ADA_MCP_LOGGING_ONLY=1
 */
import { localizeAdaLogLine } from "./log-locale.mjs";

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
  return "info";
}

/** @param {McpLogLevel} level */
export function shouldMcpLog(level) {
  return RANK[level] >= RANK[resolveMcpLogLevel()];
}

/** @param {McpLogLevel} level @param {string} message */
export function mcpLog(level, message) {
  if (!shouldMcpLog(level)) return;
  if (!isTruthy("ADA_MCP_LOGGING_ONLY")) {
    console.error(`[ada-mcp][${level}] ${localizeAdaLogLine(message)}`);
  }
}

/** 启动摘要（版本、runner、registry），默认与测速同级可见 */
export function mcpLogStartup(message) {
  mcpLog("info", message);
}

/** @param {string} message */
export function mcpLogIfVerbose(message) {
  if (isTruthy("ADA_MCP_VERBOSE") || isTruthy("ADA_MCP_STARTUP_HINTS")) {
    mcpLog("info", message);
  }
}
