import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PLAYWRIGHT_HOST_CANDIDATES } from "@ada/download-probe";
import {
  applyPersistedDownloadProbeFromState,
  ensureDriverDependencies,
  isInstallScopeComplete
} from "./dependency-installer.js";
import { loadInstallDepsConfig } from "./load-install-deps-config.js";
import { depsLogLine, localizeAdaLogLine } from "./log-locale.js";
import { emitBootstrapPhaseProgress, getLatestInstallProgress } from "./install-progress.js";
import { applyAdaToolsToProcessEnv } from "./tools-paths.js";
import { resolveInstallContextCwd, resolvePlaywrightHostFilePathSync } from "./deps-install-paths.js";
import type { EnsureInstallOptions } from "./dependency-installer.js";
import type { InstallScope } from "./dependency-installer.js";
import type { InstallDepsConfig } from "./types.js";

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
  const hostCandidates = [
    resolvePlaywrightHostFilePathSync(),
    ...(process.env.INIT_CWD ? [path.join(process.env.INIT_CWD, ".ada-mcp-playwright-host")] : []),
    path.join(process.cwd(), ".ada-mcp-playwright-host")
  ];
  for (const file of hostCandidates) {
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
  /** 使用指定配置（如引导页刚保存的配置），否则 loadInstallDepsConfig() */
  config?: InstallDepsConfig;
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
  /** 与 launcher 一致：默认展示测速、[deps]/[playwright] 安装日志 */
  return "info";
}

function bootstrapLineLevel(line: string): keyof typeof MCP_LOG_RANK {
  if (/\[error\]|bootstrap failed/i.test(line)) return "error";
  if (/\[warn\]|warn\]|probe-miss|依赖安装未完成|未完成/i.test(line)) return "warn";
  return "info";
}

type BootstrapLogLevel = keyof typeof MCP_LOG_RANK;

let bootstrapLogEmitter: ((level: BootstrapLogLevel, body: string) => void) | null = null;

export function setBootstrapLogEmitter(
  emitter: ((level: BootstrapLogLevel, body: string) => void) | null
): void {
  bootstrapLogEmitter = emitter;
}

function emitBootstrapLine(level: BootstrapLogLevel, body: string): void {
  const localized = localizeAdaLogLine(body);
  const formatted = `[ADA-MCP][${level}] ${localized}`;
  if (bootstrapLogEmitter) {
    bootstrapLogEmitter(level, localized);
    return;
  }
  console.error(formatted);
}

function bootstrapLog(line: string, onLogLine?: (line: string) => void): void {
  const localized = localizeAdaLogLine(line);
  if (onLogLine) {
    onLogLine(localized);
    return;
  }
  const level = bootstrapLineLevel(localized);
  if (MCP_LOG_RANK[level] < MCP_LOG_RANK[resolveBootstrapLogLevel()]) {
    return;
  }
  const body = localized.replace(/^\[ADA-MCP\](\[(?:info|warn|error)\])?\s*/i, "");
  emitBootstrapLine(level, body);
}

export function isBootstrapInstallActive(): boolean {
  return process.env.ADA_MCP_BOOTSTRAP_IN_PROGRESS === "1";
}

export type McpBootstrapStatus = {
  active: boolean;
  scopes: string[];
  phase: string;
  startedAt: string | null;
  lastError: string | null;
};

let mcpBootstrapStatus: McpBootstrapStatus = {
  active: false,
  scopes: [],
  phase: "idle",
  startedAt: null,
  lastError: null
};

function setBootstrapPhase(phase: string, scopes: string[] = mcpBootstrapStatus.scopes): void {
  mcpBootstrapStatus = {
    ...mcpBootstrapStatus,
    active:
      phase !== "idle" &&
      phase !== "done" &&
      phase !== "skipped" &&
      phase !== "error",
    phase,
    scopes
  };
  const status =
    phase === "error"
      ? "error"
      : phase === "skipped"
        ? "skipped"
        : phase === "done"
          ? "ok"
          : "running";
  emitBootstrapPhaseProgress(phase, scopes, status);
}

/** MCP health / 工具路由：后台依赖安装状态 */
export function getMcpBootstrapStatus(): McpBootstrapStatus & {
  installProgress?: ReturnType<typeof getLatestInstallProgress>;
} {
  const latest = getLatestInstallProgress();
  return {
    ...mcpBootstrapStatus,
    ...(latest ? { installProgress: latest } : {})
  };
}

let activeBootstrapInstall: Promise<void> | null = null;

/** 后台 install-deps 进行中的 Promise（stdio 握手完成后启动） */
export function getBootstrapInstallPromise(): Promise<void> | null {
  return activeBootstrapInstall;
}

/** 工具调用前等待进行中的 bootstrap（含 --install-deps=all） */
export async function awaitBootstrapInstallDeps(): Promise<void> {
  const pending = activeBootstrapInstall;
  if (!pending) {
    return;
  }
  await pending;
}

export async function runBootstrapInstallDeps(
  argv: string[],
  options?: RunBootstrapInstallDepsOptions
): Promise<void> {
  const logLine = (line: string) => bootstrapLog(line, options?.onLogLine);
  process.env.ADA_MCP_BOOTSTRAP_IN_PROGRESS = "1";
  if (!mcpBootstrapStatus.startedAt) {
    mcpBootstrapStatus.startedAt = new Date().toISOString();
  }
  try {
    await runBootstrapInstallDepsBody(argv, options, logLine);
  } finally {
    delete process.env.ADA_MCP_BOOTSTRAP_IN_PROGRESS;
  }
}

async function runBootstrapInstallDepsBody(
  argv: string[],
  options: RunBootstrapInstallDepsOptions | undefined,
  logLine: (line: string) => void
): Promise<void> {
  mcpBootstrapStatus.lastError = null;
  setBootstrapPhase("planning", []);
  applyPreinstallPlaywrightHostFile();
  ensureDefaultInstallTimeouts();

  const argvForPlan =
    options?.installDepsSpec !== undefined
      ? [...argv.filter((x) => !x.startsWith("--install-deps=")), `--install-deps=${options.installDepsSpec}`]
      : argv;
  const plan = resolveBootstrapInstallDeps(argvForPlan);

  const config = options?.config ?? (await loadInstallDepsConfig());
  const toolsRelative =
    config.dependencies?.toolsDir ?? process.env.ADA_TOOLS_RELATIVE_DIR?.trim() ?? "tools";
  await applyAdaToolsToProcessEnv({
    cwd: resolveInstallContextCwd(),
    relativeDir: toolsRelative,
    onLogLine: (line) => logLine(line)
  });

  await applyPersistedDownloadProbeFromState((line) => logLine(line));

  if (plan.skip) {
    setBootstrapPhase("skipped", []);
    logLine("[ADA-MCP] dependency bootstrap skipped (--skip-install-deps / ADA_MCP_SKIP_INSTALL_DEPS)");
    return;
  }

  if (!plan.force) {
    let allComplete = true;
    for (const scope of plan.scopes) {
      if (!(await isInstallScopeComplete(scope, config))) {
        allComplete = false;
        break;
      }
    }
    if (allComplete) {
      setBootstrapPhase("skipped", plan.scopes);
      logLine(
        "[ADA-MCP] dependency bootstrap skipped (already installed; use --install-deps-force or ADA_MCP_INSTALL_DEPS_FORCE=1 to reinstall)"
      );
      return;
    }
  }

  const label = plan.scopes.join(",");
  setBootstrapPhase("start", plan.scopes);
  logLine(`[ADA-MCP] dependency bootstrap start (scope=${label}, force=${plan.force})`);

  for (const scope of plan.scopes) {
    setBootstrapPhase(`install:${scope}`, plan.scopes);
    logLine(`[ADA-MCP] bootstrap phase: install ${scope}`);
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
      mcpBootstrapStatus.lastError = `${scope}: ${msg}`;
      logLine(
        depsLogLine(
          `[ADA-MCP][warn] ${scope} 依赖安装未完成: ${msg}`,
          `[ADA-MCP][warn] ${scope} deps install incomplete: ${msg}`
        )
      );
      logLine(
        depsLogLine(
          "[ADA-MCP][warn] MCP 仍将启动；可设置 PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.playwright.dev 或 --skip-install-deps",
          "[ADA-MCP][warn] MCP will still start; set PLAYWRIGHT_DOWNLOAD_HOST or --skip-install-deps"
        )
      );
    }
  }

  setBootstrapPhase("done", plan.scopes);
  logLine("[ADA-MCP] dependency bootstrap done");
}

/** 解析即将执行的 bootstrap scope（供 health / schedule 展示） */
export function previewBootstrapInstallPlan(
  argv: string[],
  options?: Pick<RunBootstrapInstallDepsOptions, "installDepsSpec">
): { skip: boolean; scopes: string[]; force: boolean } {
  const argvForPlan =
    options?.installDepsSpec !== undefined
      ? [...argv.filter((x) => !x.startsWith("--install-deps=")), `--install-deps=${options.installDepsSpec}`]
      : argv;
  const plan = resolveBootstrapInstallDeps(argvForPlan);
  if (plan.skip) {
    return { skip: true, scopes: [], force: false };
  }
  return { skip: false, scopes: plan.scopes, force: plan.force };
}

/** MCP stdio：握手完成后再装依赖（含 --install-deps=all），不阻塞 Host 初始化 */
export function scheduleBootstrapInstallDeps(
  argv: string[],
  options?: RunBootstrapInstallDepsOptions
): void {
  if (activeBootstrapInstall) {
    return;
  }
  const planPreview = previewBootstrapInstallPlan(argv, options);
  if (planPreview.skip) {
    setBootstrapPhase("skipped", []);
    activeBootstrapInstall = runBootstrapInstallDeps(argv, options).finally(() => {
      activeBootstrapInstall = null;
      mcpBootstrapStatus.active = false;
    });
    return;
  }
  mcpBootstrapStatus = {
    active: true,
    scopes: planPreview.scopes,
    phase: "scheduled",
    startedAt: new Date().toISOString(),
    lastError: null
  };
  emitBootstrapPhaseProgress("scheduled", planPreview.scopes, "running");
  activeBootstrapInstall = runBootstrapInstallDeps(argv, options)
    .catch((error) => {
      const msg = error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error);
      mcpBootstrapStatus.lastError = msg;
      setBootstrapPhase("error", mcpBootstrapStatus.scopes);
      console.error(localizeAdaLogLine(`[ADA-MCP][warn] background install incomplete: ${msg}`));
    })
    .finally(() => {
      activeBootstrapInstall = null;
      mcpBootstrapStatus.active = false;
    });
}
