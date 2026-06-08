/** Shared ADA_* env parsing (canonical names + documented aliases). */

export function envTruthy(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** First non-empty env among `names` (left = preferred canonical). */
export function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** `ADA_MCP_HIDE_ADVANCED` (canonical) or `ADA_MCP_TOOL_VISIBILITY` (`hide` / `primary-only` / …). */
export function hideAdvancedToolsFromEnv(): boolean {
  const raw = (firstEnv("ADA_MCP_HIDE_ADVANCED", "ADA_MCP_TOOL_VISIBILITY") ?? "").toLowerCase();
  return (
    raw === "1" ||
    raw === "true" ||
    raw === "yes" ||
    raw === "hide" ||
    raw === "hide-advanced" ||
    raw === "primary-only"
  );
}

/** Fast MCP handshake (default on unless `ADA_MCP_SLOW_START=1` or `ADA_MCP_FAST_START=0`). */
export function fastStartFromEnv(): boolean {
  if (envTruthy(process.env.ADA_MCP_SLOW_START)) return false;
  const fast = firstEnv("ADA_MCP_FAST_START", "ADA_MCP_QUICK_START");
  if (fast === "0" || fast?.toLowerCase() === "false") return false;
  return true;
}

/** MCP tool result verbosity (`ADA_MCP_VERBOSE_RESULT` or `ADA_MCP_SLIM_RESULT=0`). */
export function mcpVerboseResultFromEnv(): boolean {
  if (envTruthy(process.env.ADA_MCP_VERBOSE_RESULT)) return true;
  if (process.env.ADA_MCP_SLIM_RESULT === "0") return true;
  return false;
}

/** UI dump cache TTL — prefer `ADA_UI_DUMP_CACHE_MS`, alias `ADA_ANDROID_HIERARCHY_CACHE_MS`. */
export function uiDumpCacheTtlMsFromEnv(defaultMs = 2000): number {
  const raw = firstEnv("ADA_UI_DUMP_CACHE_MS", "ADA_ANDROID_HIERARCHY_CACHE_MS") ?? String(defaultMs);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : defaultMs;
}
