import { isChinaFriendlyNpmRegistry } from "@ada/download-probe";
import type { InstallDepsConfig } from "./types.js";
import { depsLogLine } from "./log-locale.js";

const DEFAULT_PLAYWRIGHT_HOST = "https://cdn.playwright.dev";
const CHINA_PLAYWRIGHT_HOST = "https://cdn.npmmirror.com/binaries/playwright";

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

function isForceProbeEnv(): boolean {
  const v = String(process.env.ADA_MCP_FORCE_PLAYWRIGHT_PROBE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** launcher / state 已写入时 bootstrap 不再测 npm registry（P2 单一探测权威） */
export function shouldProbeNpmRegistry(options: {
  launcherRegistryHint: string;
  persistedRegistry?: string;
  force: boolean;
}): boolean {
  if (options.force) {
    return true;
  }
  if (options.launcherRegistryHint.trim()) {
    return false;
  }
  if (process.env.ADA_MCP_LAUNCHER_RAN === "1" && options.persistedRegistry?.trim()) {
    return false;
  }
  if (isTruthyEnv("ADA_MCP_FORCE_REGISTRY_PROBE")) {
    return true;
  }
  return !options.persistedRegistry?.trim();
}

/** 默认不重复 CDN 测速；仅 force 或显式 ADA_MCP_FORCE_PLAYWRIGHT_PROBE */
export function shouldProbePlaywrightCdn(options: { force: boolean; hasHost: boolean }): boolean {
  if (options.force) {
    return true;
  }
  if (options.hasHost) {
    return false;
  }
  if (isForceProbeEnv()) {
    return true;
  }
  return false;
}

function isTruthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function applyPlaywrightDownloadHost(
  host: string,
  state: { bestPlaywrightDownloadHost?: string },
  onLogLine?: (line: string) => void
): void {
  const normalized = host.replace(/\/$/, "");
  state.bestPlaywrightDownloadHost = normalized;
  process.env.PLAYWRIGHT_DOWNLOAD_HOST = normalized;
  onLogLine?.(
    depsLogLine(
      `[deps] Playwright CDN: ${normalized}`,
      `[deps] Playwright CDN: ${normalized}`
    )
  );
}

/** launcher seed / state / 中国区默认；无 host 时写入 */
export function ensurePlaywrightDownloadHostSeeded(
  state: { bestPlaywrightDownloadHost?: string; bestNpmRegistry?: string },
  config: InstallDepsConfig,
  onLogLine?: (line: string) => void
): boolean {
  if (process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim()) {
    const explicit = process.env.PLAYWRIGHT_DOWNLOAD_HOST.trim().replace(/\/$/, "");
    if (!state.bestPlaywrightDownloadHost?.trim()) {
      state.bestPlaywrightDownloadHost = explicit;
    }
    return true;
  }
  if (state.bestPlaywrightDownloadHost?.trim()) {
    process.env.PLAYWRIGHT_DOWNLOAD_HOST = state.bestPlaywrightDownloadHost.trim().replace(/\/$/, "");
    return true;
  }
  const fromConfig = config.dependencies.playwrightDownloadHost?.trim();
  if (fromConfig) {
    applyPlaywrightDownloadHost(fromConfig, state, onLogLine);
    return true;
  }
  const registry = state.bestNpmRegistry ?? process.env.ADA_MCP_LAUNCHER_REGISTRY ?? "";
  const fallback = resolveDefaultPlaywrightDownloadHost(registry);
  applyPlaywrightDownloadHost(fallback, state, onLogLine);
  onLogLine?.(
    depsLogLine(
      `[deps] Playwright CDN（launcher 默认，跳过测速）: ${fallback}`,
      `[deps] Playwright CDN (launcher default, skip probe): ${fallback}`
    )
  );
  return true;
}
