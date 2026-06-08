import { readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import {
  DEFAULT_PLAYWRIGHT_HOST_CANDIDATES,
  pickBestDownloadProbe,
  probeDownloadSample,
  type DownloadProbeResult
} from "@ada/download-probe";
import type { InstallDepsConfig } from "./types.js";
import type { DriverInstallOutcome } from "./install-summary.js";
import { resolvePlaywrightBrowsersPath } from "./deps-install-paths.js";
import { depsRequire, ensurePackageResolution, isPackageAvailable } from "./deps-resolution.js";

import { PINNED_PLAYWRIGHT_VERSION } from "./pinned-playwright-version.js";

function shouldUseShell(command: string): boolean {
  return process.platform === "win32" && !path.isAbsolute(command) && !command.includes(path.sep);
}

function normalizeHostUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function playwrightProbeUrls(host: string): string[] {
  const h = normalizeHostUrl(host);
  if (h.includes("npmmirror.com/mirrors/playwright")) {
    return [h, "https://cdn.npmmirror.com/binaries/playwright"];
  }
  return [h];
}

function playwrightChromiumZipUrl(host: string, browserVersion: string): string {
  const h = normalizeHostUrl(host);
  const base =
    h.includes("cdn.npmmirror.com/binaries/playwright") || h.endsWith("/binaries/playwright")
      ? "https://cdn.npmmirror.com/binaries/playwright"
      : h.includes("npmmirror.com") && !h.includes("/mirrors/playwright")
        ? "https://npmmirror.com/mirrors/playwright"
        : h;
  const plat =
    process.platform === "darwin" ? "mac-arm64" : process.platform === "linux" ? "linux64" : "win64";
  const zip =
    plat === "mac-arm64"
      ? "chrome-mac-arm64.zip"
      : plat === "linux64"
        ? "chrome-linux64.zip"
        : "chrome-win64.zip";
  return `${base}/builds/cft/${browserVersion}/${plat}/${zip}`;
}

async function resolveChromiumBrowserVersionForProbe(): Promise<string> {
  const fromEnv = process.env.ADA_PLAYWRIGHT_BROWSER_VERSION?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const req = depsRequire();
    const browsersPath = req.resolve("playwright-core/browsers.json");
    const parsed = JSON.parse(readFileSync(browsersPath, "utf8")) as {
      browsers?: Array<{ name?: string; browserVersion?: string }>;
    };
    const chromium = parsed.browsers?.find((b) => b.name === "chromium");
    const v = String(chromium?.browserVersion ?? "").trim();
    if (v) {
      return v;
    }
  } catch {
    // playwright not installed yet
  }
  const pwVersion = process.env.ADA_PLAYWRIGHT_VERSION?.trim() || PINNED_PLAYWRIGHT_VERSION;
  const sources = [
    `https://unpkg.com/playwright-core@${pwVersion}/browsers.json`,
    `https://cdn.jsdelivr.net/npm/playwright-core@${pwVersion}/browsers.json`
  ];
  for (const url of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        continue;
      }
      const parsed = (await response.json()) as {
        browsers?: Array<{ name?: string; browserVersion?: string }>;
      };
      const chromium = parsed.browsers?.find((b) => b.name === "chromium");
      const v = String(chromium?.browserVersion ?? "").trim();
      if (v) {
        return v;
      }
    } catch {
      // try next
    }
  }
  return "";
}

async function probePlaywrightHostDownload(host: string, browserVersion: string): Promise<DownloadProbeResult | null> {
  if (!browserVersion) {
    return null;
  }
  let best: DownloadProbeResult | null = null;
  for (const base of playwrightProbeUrls(host)) {
    const url = playwrightChromiumZipUrl(base, browserVersion);
    const probe = await probeDownloadSample(url);
    if (probe && (!best || probe.speedKBps > best.speedKBps)) {
      best = probe;
    }
  }
  return best;
}

export async function detectBestPlaywrightDownloadHost(
  candidates: string[]
): Promise<{ best: string; probeResults: Array<{ candidate: string; speedKBps: number | null }> }> {
  const browserVersion = await resolveChromiumBrowserVersionForProbe();
  const probeResults: Array<{ candidate: string; probe: DownloadProbeResult | null }> = [];
  for (const candidate of candidates) {
    const probe = await probePlaywrightHostDownload(candidate, browserVersion);
    probeResults.push({ candidate, probe });
  }
  const bestRow = pickBestDownloadProbe(probeResults, (c) => candidates.indexOf(c));
  const best = bestRow?.candidate ?? candidates[0] ?? DEFAULT_PLAYWRIGHT_HOST_CANDIDATES[0];
  return {
    best: normalizeHostUrl(best),
    probeResults: probeResults.map(({ candidate, probe }) => ({
      candidate,
      speedKBps: probe?.speedKBps ?? null
    }))
  };
}

function playwrightHostCandidates(config: InstallDepsConfig): string[] {
  const configured = config.dependencies.playwrightDownloadHost?.trim();
  const fromConfig = Array.isArray(config.dependencies.playwrightHostCandidates)
    ? config.dependencies.playwrightHostCandidates.map((x) => normalizeHostUrl(String(x).trim())).filter(Boolean)
    : [];
  const ordered = [
    ...(configured ? [normalizeHostUrl(configured)] : []),
    ...fromConfig,
    ...DEFAULT_PLAYWRIGHT_HOST_CANDIDATES
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of ordered) {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function expandPlaywrightInstallTargets(targets: string[]): string[] {
  if (targets.length === 0) {
    return targets;
  }
  const lower = targets.map((x) => x.toLowerCase());
  if (lower.includes("chromium") || lower.includes("firefox") || lower.includes("webkit")) {
    return lower;
  }
  const channelOnly = lower.every((x) => x === "chrome" || x === "msedge");
  if (channelOnly) {
    return ["chromium", ...lower];
  }
  return lower;
}

export function resolvePlaywrightInstallTargets(
  config: InstallDepsConfig,
  override?: string[]
): string[] {
  if (override && override.length > 0) {
    const deduped = Array.from(new Set(override.map((x) => String(x).toLowerCase().trim()).filter(Boolean)));
    if (deduped.includes("all")) {
      return [];
    }
    return expandPlaywrightInstallTargets(deduped);
  }
  const targets = config.dependencies.playwrightInstallTargets;
  if (Array.isArray(targets) && targets.length > 0) {
    const deduped = Array.from(new Set(targets.map((x) => String(x).toLowerCase())));
    if (deduped.includes("all")) {
      return [];
    }
    return expandPlaywrightInstallTargets(deduped);
  }
  const legacy = config.dependencies.playwrightBrowser === "all" ? "" : config.dependencies.playwrightBrowser;
  return legacy ? expandPlaywrightInstallTargets([legacy]) : ["chromium"];
}

function resolveBundledPlaywrightCli(): { command: string; cliArgs: string[] } {
  const req = depsRequire();
  const pkgPath = req.resolve("playwright/package.json");
  const root = path.dirname(pkgPath);
  return { command: "node", cliArgs: [path.join(root, "cli.js")] };
}

async function runPlaywrightInstallCli(
  args: string[],
  onLogLine?: (line: string) => void
): Promise<void> {
  const { command, cliArgs } = resolveBundledPlaywrightCli();
  const fullArgs = [...cliArgs, ...args];
  onLogLine?.(`[playwright] 执行 ${command} ${fullArgs.join(" ")}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, fullArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: shouldUseShell(command),
      env: process.env,
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        const t = line.trimEnd();
        if (t) {
          onLogLine?.(`[playwright] ${t}`);
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        const t = line.trimEnd();
        if (t) {
          onLogLine?.(`[playwright] ${t}`);
        }
      }
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`playwright install exit=${code}`))));
    child.on("error", reject);
  });
}

async function clearPlaywrightInstallLock(browsersPath: string, onLogLine?: (line: string) => void): Promise<void> {
  const lockPath = path.join(browsersPath, "__dirlock");
  try {
    await fs.access(lockPath);
    await fs.rm(lockPath, { recursive: true, force: true });
    onLogLine?.(`[playwright] 已清除安装锁: ${lockPath}`);
  } catch {
    // no lock
  }
}

export async function installPlaywrightBrowsers(
  config: InstallDepsConfig,
  options?: {
    force?: boolean;
    targetsOverride?: string[];
    onLogLine?: (line: string) => void;
    bestHostOverride?: string;
  }
): Promise<DriverInstallOutcome> {
  await ensurePackageResolution(options?.onLogLine);
  if (!isPackageAvailable("playwright")) {
    options?.onLogLine?.("[playwright][warn] playwright 包未安装，跳过浏览器下载");
    return { id: "playwright-browsers", status: "missing", detail: "playwright package not installed" };
  }

  const browsersPath = await resolvePlaywrightBrowsersPath();
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  await fs.mkdir(browsersPath, { recursive: true });

  if (!process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim()) {
    const host =
      options?.bestHostOverride?.trim() ||
      config.dependencies.playwrightDownloadHost?.trim() ||
      (await detectBestPlaywrightDownloadHost(playwrightHostCandidates(config))).best;
    process.env.PLAYWRIGHT_DOWNLOAD_HOST = host;
    options?.onLogLine?.(`[playwright] 使用下载镜像: ${host}`);
  }

  const targets = resolvePlaywrightInstallTargets(config, options?.targetsOverride);
  const installArgs = ["install", ...targets];
  if (options?.force) {
    installArgs.push("--force");
  }

  if (options?.force) {
    await clearPlaywrightInstallLock(browsersPath, options.onLogLine);
  }

  const timeoutMs = Number(process.env.ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS ?? "3600000");
  const timer = setTimeout(() => {
    options?.onLogLine?.(`[playwright][warn] 安装已超过 ${timeoutMs}ms，请检查网络或 PLAYWRIGHT_DOWNLOAD_HOST`);
  }, timeoutMs);

  try {
    await runPlaywrightInstallCli(installArgs, options?.onLogLine);
    return { id: "playwright-browsers", status: "installed", detail: browsersPath };
  } finally {
    clearTimeout(timer);
  }
}
