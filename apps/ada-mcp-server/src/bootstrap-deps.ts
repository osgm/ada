import fs from "node:fs";
import path from "node:path";
import { installDependencies, type InstallDependencyExtras } from "@ada/agent-core";
import type { InstallScope } from "@ada/agent/dependency-installer";

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
  | { skip: false; scopes: InstallScope[]; force: boolean; extras: InstallDependencyExtras };

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
  const skipFlag = argv.includes("--skip-install-deps");
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

  const extras: InstallDependencyExtras = {};
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

const PREINSTALL_PLAYWRIGHT_HOST_ALLOW = new Set([
  "https://cdn.playwright.dev",
  "https://playwright.azureedge.net",
  "https://cdn.npmmirror.com/binaries/playwright",
  "https://npmmirror.com/mirrors/playwright"
]);

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
        process.env.PLAYWRIGHT_DOWNLOAD_HOST = host;
        process.env.ADA_PLAYWRIGHT_HOST_FROM_PREINSTALL = "1";
        console.error(`[ADA-MCP] using playwright CDN from ${file}: ${host} (install-deps 将重新测速排序)`);
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
    process.env.ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS = "1800000";
  }
}

export async function runBootstrapInstallDeps(argv: string[]): Promise<void> {
  applyPreinstallPlaywrightHostFile();
  ensureDefaultInstallTimeouts();
  const plan = resolveBootstrapInstallDeps(argv);
  if (plan.skip) {
    console.error("[ADA-MCP] dependency bootstrap skipped (--skip-install-deps / ADA_MCP_SKIP_INSTALL_DEPS)");
    return;
  }

  const label = plan.scopes.join(",");
  console.error(`[ADA-MCP] dependency bootstrap start (scope=${label}, force=${plan.force})`);

  for (const scope of plan.scopes) {
    console.error(`[ADA-MCP] installing: ${scope}`);
    try {
      await installDependencies(scope, plan.force, (line) => {
        console.error(`[ADA-MCP] ${line}`);
      }, plan.extras);
    } catch (error) {
      const msg = error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error);
      console.error(`[ADA-MCP][warn] ${scope} 依赖安装未完成: ${msg}`);
      console.error("[ADA-MCP][warn] MCP 仍将启动；可设置 PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.playwright.dev 或 --skip-install-deps");
    }
  }

  console.error("[ADA-MCP] dependency bootstrap done");
}
