import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import {
  applyPersistedDownloadProbeFromState,
  applyAdaToolsToProcessEnv,
  ensureDriverDependencies,
  resolveInstallContextCwd,
  type EnsureInstallOptions,
  type InstallScope
} from "@ada/install-deps";
import type { AgentConfig } from "./types.js";
import { DEFAULT_PLAYWRIGHT_HOST_CANDIDATES } from "@ada/download-probe";

const INSTALL_SCOPE_TOKENS = new Set<InstallScope>([
  "playwright",
  "drivers",
  "mobile",
  "android",
  "ios",
  "harmony"
]);

export type InstallDepsParseResult =
  | { skip: true }
  | { skip: false; scopes: InstallScope[]; force: boolean; extras: EnsureInstallOptions };

function isTruthy(v: string | undefined): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isFalsy(v: string | undefined): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "0" || s === "false" || s === "no" || s === "off" || s === "skip" || s === "none";
}

/** 解析安装范围：未配置时默认仅 playwright（MCP 冷启动轻量安装）；移动端需显式 `mobile`/`android`/`ios`/`harmony`/`all`；skip/none 表示跳过 */
export function parseInstallDepsSpec(raw: string | undefined): InstallScope[] | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return ["playwright"];
  }
  const lower = trimmed.toLowerCase();
  if (isFalsy(lower)) {
    return null;
  }
  if (lower === "all") {
    return ["all"];
  }
  const scopes: InstallScope[] = [];
  for (const part of lower.split(/[,+\s]+/)) {
    const token = part.trim();
    if (!token) continue;
    if (token === "all") return ["all"];
    if (INSTALL_SCOPE_TOKENS.has(token as InstallScope)) {
      scopes.push(token as InstallScope);
    }
  }
  return scopes.length > 0 ? scopes : ["playwright"];
}

export function resolveBootstrapInstallDeps(argv: string[]): InstallDepsParseResult {
  const skipFlag =
    argv.includes("--skip-install-deps") || argv.includes("--skip-deps");
  const skipEnv = isTruthy(process.env.ADA_MCP_SKIP_INSTALL_DEPS);
  if (skipFlag || skipEnv) {
    return { skip: true };
  }

  const fromArg = argv.find((x) => x.startsWith("--install-deps="))?.slice("--install-deps=".length);
  const fromEnv = process.env.ADA_MCP_INSTALL_DEPS;
  const spec = fromArg !== undefined && fromArg.length > 0 ? fromArg : fromEnv;
  const scopes = parseInstallDepsSpec(spec);
  if (!scopes) {
    return { skip: true };
  }

  const force =
    argv.includes("--install-deps-force") ||
    isTruthy(process.env.ADA_MCP_INSTALL_DEPS_FORCE);

  return { skip: false, scopes, force, extras: {} };
}

const PREINSTALL_PLAYWRIGHT_HOST_ALLOW = new Set<string>([...DEFAULT_PLAYWRIGHT_HOST_CANDIDATES]);

function normalizePlaywrightHost(url: string): string {
  return url.replace(/\/$/, "");
}

function applyPreinstallPlaywrightHostFile(): void {
  if (process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim()) {
    return;
  }
  const roots = [process.env.INIT_CWD, process.cwd()].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0
  );
  for (const root of roots) {
    const file = path.join(root, ".ada-mcp-playwright-host");
    try {
      const host = normalizePlaywrightHost(fs.readFileSync(file, "utf8").trim());
      if (host.length > 0 && PREINSTALL_PLAYWRIGHT_HOST_ALLOW.has(host)) {
        const normalized =
          host.includes("npmmirror.com/mirrors/playwright") && !host.includes("cdn.npmmirror.com")
            ? "https://cdn.npmmirror.com/binaries/playwright"
            : host;
        if (normalized !== host) {
          bootstrapLog(`[ADA-MCP] preinstall CDN mapped to ${normalized}`);
        }
        process.env.PLAYWRIGHT_DOWNLOAD_HOST = normalized;
        process.env.ADA_PLAYWRIGHT_HOST_FROM_PREINSTALL = "1";
        bootstrapLog(`[ADA-MCP] using playwright CDN from ${file}: ${normalized}`);
        return;
      }
      if (host.length > 0) {
        bootstrapLog(`[ADA-MCP] ignore preinstall playwright CDN (will re-probe): ${host}`);
        return;
      }
    } catch {
      // try next root
    }
  }
}

function ensureDefaultInstallTimeouts(): void {
  if (!process.env.ADA_INSTALL_STRATEGY_TIMEOUT_MS?.trim()) {
    process.env.ADA_INSTALL_STRATEGY_TIMEOUT_MS = "120000";
  }
  if (!process.env.ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS?.trim()) {
    process.env.ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS = "3600000";
  }
}

export type RunBootstrapInstallDepsOptions = {
  /** 使用指定配置（如引导页刚保存的配置），否则 loadConfig() */
  config?: AgentConfig;
  /** 覆盖 ADA_MCP_INSTALL_DEPS / --install-deps= 的 scope 字符串 */
  installDepsSpec?: string;
  /** 逐行日志（默认 stderr）；引导页 SSE 可传入 */
  onLogLine?: (line: string) => void;
};

const MCP_LOG_RANK = { info: 10, warn: 20, error: 30 } as const;

function resolveBootstrapLogLevel(): keyof typeof MCP_LOG_RANK {
  if (isTruthy(process.env.ADA_MCP_QUIET)) return "error";
  const raw = String(process.env.ADA_MCP_LOG_LEVEL ?? "").trim().toLowerCase();
  if (raw === "info" || raw === "warn" || raw === "error") return raw;
  if (isTruthy(process.env.ADA_MCP_VERBOSE)) return "info";
  return "error";
}

function bootstrapLineLevel(line: string): keyof typeof MCP_LOG_RANK {
  if (/\[error\]|依赖安装未完成|bootstrap failed/i.test(line)) return "error";
  if (/\[warn\]|warn\]|probe-miss|未完成/i.test(line)) return "warn";
  return "info";
}

function bootstrapLog(line: string, onLogLine?: (line: string) => void): void {
  if (onLogLine) {
    onLogLine(line);
    return;
  }
  const level = bootstrapLineLevel(line);
  if (MCP_LOG_RANK[level] < MCP_LOG_RANK[resolveBootstrapLogLevel()]) {
    return;
  }
  const body = line.replace(/^\[ADA-MCP\](\[(?:info|warn|error)\])?\s*/i, "");
  console.error(`[ADA-MCP][${level}] ${body}`);
}

export async function runBootstrapInstallDeps(
  argv: string[],
  options?: RunBootstrapInstallDepsOptions
): Promise<void> {
  const logLine = (line: string) => bootstrapLog(line, options?.onLogLine);
  applyPreinstallPlaywrightHostFile();
  ensureDefaultInstallTimeouts();

  const argvForPlan =
    options?.installDepsSpec !== undefined
      ? [...argv.filter((x) => !x.startsWith("--install-deps=")), `--install-deps=${options.installDepsSpec}`]
      : argv;
  const plan = resolveBootstrapInstallDeps(argvForPlan);

  const config = options?.config ?? (await loadConfig());
  const toolsRelative =
    config.dependencies?.toolsDir ?? process.env.ADA_TOOLS_RELATIVE_DIR?.trim() ?? "tools";
  await applyAdaToolsToProcessEnv({
    cwd: resolveInstallContextCwd(),
    relativeDir: toolsRelative,
    onLogLine: (line) => logLine(line)
  });

  await applyPersistedDownloadProbeFromState((line) => logLine(line));

  if (plan.skip) {
    logLine("[ADA-MCP] dependency bootstrap skipped (--skip-install-deps / ADA_MCP_SKIP_INSTALL_DEPS)");
    return;
  }
  const label = plan.scopes.join(",");
  logLine(`[ADA-MCP] dependency bootstrap start (scope=${label}, force=${plan.force})`);

  for (const scope of plan.scopes) {
    logLine(`[ADA-MCP] installing: ${scope}`);
    try {
      await ensureDriverDependencies(config, {
        only: scope,
        force: plan.force,
        onLogLine: (line) => {
          logLine(`[ADA-MCP] ${line}`);
        },
        ...plan.extras
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error);
      logLine(`[ADA-MCP][warn] ${scope} 依赖安装未完成: ${msg}`);
      logLine("[ADA-MCP][warn] MCP 仍将启动；可设置 PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.playwright.dev 或 --skip-install-deps");
    }
  }

  logLine("[ADA-MCP] dependency bootstrap done");
}

/** MCP stdio：握手完成后再装依赖，避免阻塞 Host 初始化超时 */
export function scheduleBootstrapInstallDeps(
  argv: string[],
  options?: RunBootstrapInstallDepsOptions
): void {
  void runBootstrapInstallDeps(argv, options).catch((error) => {
    const msg = error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error);
    console.error(`[ADA-MCP][warn] background install incomplete: ${msg}`);
  });
}
