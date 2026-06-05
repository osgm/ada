/** 与 @ada/install-deps/log-locale 规则对齐（download-probe 独立包，避免循环依赖） */

export function useEnglishAdaLogs(): boolean {
  const raw = String(process.env.ADA_MCP_LOG_LOCALE ?? "").trim().toLowerCase();
  if (raw === "en") return true;
  if (raw === "zh") return false;
  return process.platform === "win32";
}

export function probeLogLine(zh: string, en: string): string {
  return useEnglishAdaLogs() ? en : zh;
}
