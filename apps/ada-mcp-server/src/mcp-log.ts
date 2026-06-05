import { localizeAdaLogLine, type AdaInstallProgressEvent } from "@ada/install-deps";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export type McpLogLevel = "info" | "warn" | "error";

const LEVEL_RANK: Record<McpLogLevel, number> = { info: 10, warn: 20, error: 30 };

type McpProtocolLogLevel = "debug" | "info" | "notice" | "warning" | "error" | "critical";

let mcpLogServer: Server | null = null;
let mcpProtocolConnected = false;

function isTruthyEnv(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** 默认 info：输出 install-deps 测速/下载进度；静默设 ADA_MCP_LOG_LEVEL=error 或 ADA_MCP_QUIET=1 */
export function resolveMcpLogLevel(): McpLogLevel {
  if (isTruthyEnv("ADA_MCP_QUIET")) {
    return "error";
  }
  const raw = String(process.env.ADA_MCP_LOG_LEVEL ?? "").trim().toLowerCase();
  if (raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  if (isTruthyEnv("ADA_MCP_VERBOSE")) {
    return "info";
  }
  return "info";
}

export function shouldMcpLog(level: McpLogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[resolveMcpLogLevel()];
}

export function registerMcpLogServer(server: Server, connected = true): void {
  mcpLogServer = server;
  mcpProtocolConnected = connected;
}

function loggingOnly(): boolean {
  return isTruthyEnv("ADA_MCP_LOGGING_ONLY");
}

function formatLine(level: McpLogLevel, message: string): string {
  return `[ADA-MCP][${level}] ${message}`;
}

function toProtocolLevel(level: McpLogLevel): McpProtocolLogLevel {
  if (level === "warn") {
    return "warning";
  }
  if (level === "error") {
    return "error";
  }
  return "info";
}

/**
 * 默认 stderr + MCP logging（握手后）。
 * Cursor MCP 面板只展示 stderr，可能标成 [error]；以 [ADA-MCP][info|warn] 为准。
 * 仅 MCP logging：ADA_MCP_LOGGING_ONLY=1
 */
export function mcpLog(level: McpLogLevel, message: string): void {
  if (!shouldMcpLog(level)) {
    return;
  }
  const localized = localizeAdaLogLine(message);
  const line = formatLine(level, localized);

  if (mcpProtocolConnected && mcpLogServer) {
    void mcpLogServer
      .sendLoggingMessage({
        level: toProtocolLevel(level),
        data: localized
      })
      .catch(() => {
        // ignore
      });
  }

  if (!loggingOnly()) {
    console.error(line);
  }
}

export function mcpLogIfVerbose(message: string): void {
  if (isTruthyEnv("ADA_MCP_VERBOSE") || isTruthyEnv("ADA_MCP_STARTUP_HINTS")) {
    mcpLog("info", message);
  }
}

function progressToMcpLevel(status: AdaInstallProgressEvent["status"]): McpLogLevel {
  if (status === "error") {
    return "error";
  }
  if (status === "warn") {
    return "warn";
  }
  return "info";
}

/**
 * MCP 结构化安装进度：logging 推送 JSON 对象；stderr 输出 `[ADA-MCP][progress] {...}`。
 * 关闭：ADA_MCP_STRUCTURED_PROGRESS=0
 */
export function mcpEmitInstallProgress(event: AdaInstallProgressEvent): void {
  const level = progressToMcpLevel(event.status);
  if (!shouldMcpLog(level)) {
    return;
  }
  const payload: AdaInstallProgressEvent = {
    ...event,
    message: localizeAdaLogLine(event.message)
  };

  if (mcpProtocolConnected && mcpLogServer) {
    void mcpLogServer
      .sendLoggingMessage({
        level: toProtocolLevel(level),
        data: JSON.stringify(payload)
      })
      .catch(() => {
        // ignore
      });
  }

  if (!loggingOnly()) {
    console.error(`[ADA-MCP][progress] ${JSON.stringify(payload)}`);
  }
}
