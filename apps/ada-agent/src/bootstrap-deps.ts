import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import {
  ensureDriverDependencies,
  type EnsureInstallOptions,
  type InstallScope
} from "./dependency-installer.js";
import type { AgentConfig } from "./types.js";
import { DEFAULT_PLAYWRIGHT_HOST_CANDIDATES } from "@ada/download-probe";
import { applyPersistedDownloadProbeFromState } from "./dependency-installer.js";
import { applyAdaToolsToProcessEnv } from "./tools-paths.js";
import { resolveInstallContextCwd } from "./deps-install-paths.js";

const INSTALL_SCOPE_TOKENS = new Set<InstallScope>([
  "playwright",
  "selenium",
  "appium",
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

/** 解析安装范围：未配置时默认仅 playwright；skip/none 表示跳过 */
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

  const extras: EnsureInstallOptions = {};
  const gecko =
    argv.find((x) => x.startsWith("--geckodriver-version="))?.slice("--geckodriver-version=".length) ??
    process.env.ADA_MCP_GECKODRIVER_VERSION;
  const chrome =
    argv.find((x) => x.startsWith("--chromedriver-version="))?.slice("--chromedriver-version=".length) ??
    process.env.ADA_MCP_CHROMEDRIVER_VERSION;
  const nativeDir =
    argv.find((x) => x.startsWith("--native-drivers-dir="))?.slice("--native-drivers-dir=".length) ??
    process.env.ADA_MCP_NATIVE_DRIVERS_DIR;
  if (gecko) extras.geckodriverVersion = gecko;
  if (chrome) extras.chromedriverVersion = chrome;
  if (nativeDir) extras.nativeDriversDir = nativeDir;

  return { skip: false, scopes, force, extras };
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
          console.error(
            `[ADA-MCP] preinstall CDN ${host} 映射为 ${normalized}（binaries 路径更稳定）`
          );
        }
        process.env.PLAYWRIGHT_DOWNLOAD_HOST = normalized;
        process.env.ADA_PLAYWRIGHT_HOST_FROM_PREINSTALL = "1";
        console.error(`[ADA-MCP] using playwright CDN from ${file}: ${normalized} (install-deps 将重新测速排序)`);
        return;
      }
      if (host.length > 0) {
        console.error(
          `[ADA-MCP] ignore preinstall playwright CDN (runtime will re-probe): ${host}`
        );
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

function bootstrapLog(line: string, onLogLine?: (line: string) => void): void {
  if (onLogLine) {
    onLogLine(line);
    return;
  }
  console.error(line);
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
