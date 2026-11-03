import { isChinaFriendlyNpmRegistry } from "@ada/download-probe";
import type { InstallDepsConfig } from "./types.js";
import { depsLogLine } from "./log-locale.js";

const DEFAULT_PLAYWRIGHT_HOST = "https://cdn.playwright.dev";
const CHINA_PLAYWRIGHT_HOST = "https://cdn.npmmirror.com/binaries/playwright";
/** 测速结果默认 5 分钟过期（可用 ADA_MCP_REGISTRY_PROBE_TTL_MS / ADA_DEPS_MIRROR_PROBE_TTL_MS 覆盖） */
const DEFAULT_MIRROR_PROBE_TTL_MS = 5 * 60 * 1000;

export type MirrorProbeSource = "measured" | "heuristic" | "explicit" | "launcher" | "config";

export type MirrorProbeState = {
  bestNpmRegistry?: string;
  bestPlaywrightDownloadHost?: string;
  npmRegistryProbedAt?: string;
  npmRegistrySource?: MirrorProbeSource;
  playwrightHostProbedAt?: string;
  playwrightHostSource?: MirrorProbeSource;
};

function isTruthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function mirrorProbeTtlMs(): number {
  const raw =
    process.env.ADA_DEPS_MIRROR_PROBE_TTL_MS?.trim() ||
    process.env.ADA_MCP_REGISTRY_PROBE_TTL_MS?.trim();
  if (!raw) {
    return DEFAULT_MIRROR_PROBE_TTL_MS;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MIRROR_PROBE_TTL_MS;
}

export function isMirrorProbeFresh(probedAt?: string, nowMs = Date.now()): boolean {
  const ms = Date.parse(String(probedAt ?? ""));
  if (!Number.isFinite(ms)) {
    return false;
  }
  return nowMs - ms <= mirrorProbeTtlMs();
}

export function markNpmRegistryMeasured(state: MirrorProbeState, registry: string): void {
  state.bestNpmRegistry = registry.replace(/\/$/, "");
  state.npmRegistrySource = "measured";
  state.npmRegistryProbedAt = new Date().toISOString();
}

export function markPlaywrightHostMeasured(state: MirrorProbeState, host: string): void {
  state.bestPlaywrightDownloadHost = host.replace(/\/$/, "");
  state.playwrightHostSource = "measured";
  state.playwrightHostProbedAt = new Date().toISOString();
}

export function resolveDefaultPlaywrightDownloadHost(registry?: string): string {
  const reg = String(registry ?? process.env.ADA_MCP_LAUNCHER_REGISTRY ?? process.env.npm_config_registry ?? "")
    .trim();
  if (reg && isChinaFriendlyNpmRegistry(reg)) {
    return CHINA_PLAYWRIGHT_HOST;
  }
  return (
    process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim() ||
    process.env.ADA_PLAYWRIGHT_DOWNLOAD_HOST?.trim() ||
    DEFAULT_PLAYWRIGHT_HOST
  );
}

function isForcePlaywrightProbeEnv(): boolean {
  return isTruthyEnv("ADA_MCP_FORCE_PLAYWRIGHT_PROBE");
}

function hasForcedNpmRegistryEnv(): boolean {
  return Boolean(
    process.env.ADA_MCP_REGISTRY?.trim() ||
      process.env.ADA_NPM_REGISTRY?.trim() ||
      process.env.ADA_NPM_PROXY_REGISTRY?.trim()
  );
}

/**
 * npm registry 是否需要测速。
 * - force / FORCE_REGISTRY_PROBE → 测
 * - 显式 ADA_MCP_REGISTRY 等 → 不测
 * - 已有测速/ launcher 结果且在 TTL 内 → 不测
 * - 仅有过期或启发式结果 → 测
 */
export function shouldProbeNpmRegistry(options: {
  launcherRegistryHint: string;
  persistedRegistry?: string;
  force: boolean;
  probedAt?: string;
  source?: MirrorProbeSource;
}): boolean {
  if (options.force || isTruthyEnv("ADA_MCP_FORCE_REGISTRY_PROBE")) {
    return true;
  }
  if (hasForcedNpmRegistryEnv()) {
    return false;
  }
  const hasPersisted = Boolean(options.persistedRegistry?.trim() || options.launcherRegistryHint.trim());
  if (!hasPersisted) {
    return true;
  }
  const source = options.source;
  const fresh = isMirrorProbeFresh(options.probedAt);
  if (fresh && (source === "measured" || source === "launcher" || source === "explicit")) {
    return false;
  }
  // 同进程刚由 launcher 拉起且写入了 registry hint：若无时间戳，视为本次会话可用，避免立刻重测
  if (
    process.env.ADA_MCP_LAUNCHER_RAN === "1" &&
    options.launcherRegistryHint.trim() &&
    !options.probedAt
  ) {
    return false;
  }
  return true;
}

/**
 * Playwright CDN 是否需要测速。
 * - force / FORCE_PLAYWRIGHT_PROBE → 测
 * - 用户显式 PLAYWRIGHT_DOWNLOAD_HOST / 配置钉死 → 不测
 * - 实测结果在 TTL 内 → 不测
 * - 仅启发式 seed / 过期 → 测（装浏览器前选最快源）
 */
export function shouldProbePlaywrightCdn(options: {
  force: boolean;
  hasHost?: boolean;
  explicitHost?: boolean;
  measuredFresh?: boolean;
  source?: MirrorProbeSource;
  probedAt?: string;
}): boolean {
  if (options.force || isForcePlaywrightProbeEnv()) {
    return true;
  }
  if (options.explicitHost) {
    return false;
  }
  const measuredFresh =
    options.measuredFresh ??
    (options.source === "measured" && isMirrorProbeFresh(options.probedAt));
  if (measuredFresh) {
    return false;
  }
  return true;
}

export function applyPlaywrightDownloadHost(
  host: string,
  state: MirrorProbeState,
  onLogLine?: (line: string) => void,
  source: MirrorProbeSource = "heuristic"
): void {
  const normalized = host.replace(/\/$/, "");
  state.bestPlaywrightDownloadHost = normalized;
  state.playwrightHostSource = source;
  if (source === "measured") {
    state.playwrightHostProbedAt = new Date().toISOString();
  }
  process.env.PLAYWRIGHT_DOWNLOAD_HOST = normalized;
  onLogLine?.(
    depsLogLine(
      `[deps] Playwright CDN: ${normalized} (source=${source})`,
      `[deps] Playwright CDN: ${normalized} (source=${source})`
    )
  );
}

/** launcher seed / state / 中国区默认；无 host 时写入启发式值（装浏览器前仍可能测速） */
export function ensurePlaywrightDownloadHostSeeded(
  state: MirrorProbeState,
  config: InstallDepsConfig,
  onLogLine?: (line: string) => void
): { seeded: boolean; explicit: boolean } {
  if (process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim()) {
    const explicit = process.env.PLAYWRIGHT_DOWNLOAD_HOST.trim().replace(/\/$/, "");
    if (!state.bestPlaywrightDownloadHost?.trim()) {
      state.bestPlaywrightDownloadHost = explicit;
      state.playwrightHostSource = "explicit";
    }
    return { seeded: true, explicit: true };
  }
  if (state.bestPlaywrightDownloadHost?.trim()) {
    process.env.PLAYWRIGHT_DOWNLOAD_HOST = state.bestPlaywrightDownloadHost.trim().replace(/\/$/, "");
    const explicit = state.playwrightHostSource === "explicit" || state.playwrightHostSource === "config";
    return { seeded: true, explicit };
  }
  const fromConfig = config.dependencies.playwrightDownloadHost?.trim();
  if (fromConfig) {
    // 配置里的默认 CDN（如 cdn.playwright.dev）视为可被测速覆盖的候选，不是用户钉死
    const isDefaultOfficial = fromConfig.replace(/\/$/, "") === DEFAULT_PLAYWRIGHT_HOST;
    const source: MirrorProbeSource = isDefaultOfficial ? "heuristic" : "config";
    applyPlaywrightDownloadHost(fromConfig, state, onLogLine, source);
    return { seeded: true, explicit: source === "config" };
  }
  const registry = state.bestNpmRegistry ?? process.env.ADA_MCP_LAUNCHER_REGISTRY ?? "";
  const fallback = resolveDefaultPlaywrightDownloadHost(registry);
  applyPlaywrightDownloadHost(fallback, state, onLogLine, "heuristic");
  onLogLine?.(
    depsLogLine(
      `[deps] Playwright CDN 启发式 seed（装浏览器前仍会测速）: ${fallback}`,
      `[deps] Playwright CDN heuristic seed (will probe before browser install): ${fallback}`
    )
  );
  return { seeded: true, explicit: false };
}

export function isExplicitPlaywrightHostPinned(config?: InstallDepsConfig): boolean {
  if (process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim() || process.env.ADA_PLAYWRIGHT_DOWNLOAD_HOST?.trim()) {
    return true;
  }
  const fromConfig = config?.dependencies.playwrightDownloadHost?.trim();
  if (!fromConfig) {
    return false;
  }
  return fromConfig.replace(/\/$/, "") !== DEFAULT_PLAYWRIGHT_HOST;
}
