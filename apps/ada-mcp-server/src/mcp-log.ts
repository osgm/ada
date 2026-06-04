export type McpLogLevel = "info" | "warn" | "error";

const LEVEL_RANK: Record<McpLogLevel, number> = { info: 10, warn: 20, error: 30 };

function isTruthyEnv(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** 仅输出 error（Host 常把 stderr 标红，默认减少 info 噪音） */
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
  /** 默认仅真实故障：成功启动尽量不写 stderr（Host 常把 stderr 标为 error） */
  return "error";
}

export function shouldMcpLog(level: McpLogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[resolveMcpLogLevel()];
}

/** MCP 诊断日志（写 stderr，带级别前缀，便于 Host 过滤） */
export function mcpLog(level: McpLogLevel, message: string): void {
  if (!shouldMcpLog(level)) {
    return;
  }
  console.error(`[ADA-MCP][${level}] ${message}`);
}

export function mcpLogIfVerbose(message: string): void {
  if (isTruthyEnv("ADA_MCP_VERBOSE") || isTruthyEnv("ADA_MCP_STARTUP_HINTS")) {
    mcpLog("info", message);
  }
}
