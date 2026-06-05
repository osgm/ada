/**
 * MCP 启动测速 / 下载超时策略（launcher + 与 scripts 同步的副本共用）
 */

function parsePositiveInt(raw, fallback) {
  const parsed = raw ? Number(raw) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isTruthyEnv(name) {
  const s = String(process.env[name] ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isFalsyEnv(name) {
  const s = String(process.env[name] ?? "").trim().toLowerCase();
  return s === "0" || s === "false" || s === "no" || s === "off";
}

/** 快速握手（默认开启；完整测速设 ADA_MCP_SLOW_START=1，关闭快速设 ADA_MCP_FAST_START=0） */
export function isMcpFastStartEnv() {
  if (isTruthyEnv("ADA_MCP_SLOW_START")) {
    return false;
  }
  if (isFalsyEnv("ADA_MCP_FAST_START")) {
    return false;
  }
  return isTruthyEnv("ADA_MCP_FAST_START") || isTruthyEnv("ADA_MCP_QUICK_START") || true;
}

export function isSkipPreinstallProbeEnv() {
  return (
    isTruthyEnv("ADA_MCP_SKIP_PREINSTALL_PROBE") ||
    isTruthyEnv("ADA_MCP_SKIP_REGISTRY_PROBE") ||
    isTruthyEnv("ADA_MCP_LAUNCHER_RAN") ||
    isMcpFastStartEnv()
  );
}

/** 单次 Range 探测超时（默认 4s；慢速模式 15s） */
export function probeDownloadTimeoutMs() {
  const fallback = isMcpFastStartEnv() ? 4_000 : 15_000;
  return parsePositiveInt(process.env.ADA_PROBE_DOWNLOAD_TIMEOUT_MS, fallback);
}

/** 测速样本大小（默认 128KB；慢速模式 384KB） */
export function probeSampleBytes() {
  const fallback = isMcpFastStartEnv() ? 128 * 1024 : 384 * 1024;
  return parsePositiveInt(process.env.ADA_PROBE_DOWNLOAD_BYTES, fallback);
}

/** registry metadata fetch（latest / version exists） */
export function registryMetaFetchTimeoutMs() {
  const fallback = isMcpFastStartEnv() ? 2_500 : 6_000;
  return parsePositiveInt(process.env.ADA_REGISTRY_META_TIMEOUT_MS, fallback);
}

/** 并行测速时整轮上限（0=不限制，仅受单次超时约束） */
export function registryProbeMaxTotalMs() {
  const fallback = isMcpFastStartEnv() ? 5_000 : 0;
  return parsePositiveInt(process.env.ADA_MCP_REGISTRY_PROBE_MAX_MS, fallback);
}
