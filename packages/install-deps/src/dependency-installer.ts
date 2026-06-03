import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { InstallDepsConfig } from "./types.js";
import { resolveWorkspaceRoot } from "./deps-install-paths.js";
import {
  legacyDepsStateFileCandidates,
  resolveDepsInstallRoot,
  resolveDepsStateFilePath,
  resolveGlobalAdaHome,
  resolveInstallContextCwd,
  resolvePlaywrightBrowsersPath
} from "./deps-install-paths.js";
import { applyAdaToolsToProcessEnv, probeHdc } from "./tools-paths.js";
import {
  ensurePackageResolution,
  getPackageSource,
  getSharedDepsRoot,
  isPackageAvailable,
  type PackageSource
} from "./deps-resolution.js";
import { ensureHarmonyHdcForConfig } from "./harmony-hdc-install.js";
import { InstallDriverTracker } from "./install-summary.js";
import { detectBestRegistry, registryCandidateList } from "./registry-probe.js";
import { DEFAULT_PLAYWRIGHT_HOST_CANDIDATES } from "@ada/download-probe";
import { detectBestPlaywrightDownloadHost, installPlaywrightBrowsers } from "./playwright-browser-install.js";
import { probeAndroidRuntime, probeIosRuntime, probeAndroidUia2Runtime, probeWdaStatus } from "@ada/runtime-probe";
import { ensureAndroidUia2Bootstrap } from "./android-uia2-bootstrap.js";
import { ensureIosWdaBootstrap } from "./ios-wda-bootstrap.js";

export {
  legacyDepsStateFileCandidates,
  resolveDepsInstallRoot,
  resolveDepsStateFilePath,
  resolveGlobalAdaHome,
  resolveInstallContextCwd,
  resolvePlaywrightBrowsersPath
} from "./deps-install-paths.js";

const PINNED_PLAYWRIGHT_VERSION = "1.59.1";
const PINNED_HYPIUM_DRIVER_VERSION = "6.1.210";

export type InstallScope = "all" | "playwright" | "mobile" | "android" | "ios" | "harmony" | "drivers";

export interface EnsureInstallOptions {
  only?: InstallScope;
  force?: boolean;
  onLogLine?: (line: string) => void;
  playwrightInstallTargetsOverride?: string[];
}

export interface InstallSummary {
  scope: InstallScope;
  force: boolean;
  elapsedMs: number;
  requestedDrivers: string[];
  installedPackages: string[];
  skippedPackages: string[];
  installedDrivers: string[];
  skippedDrivers: string[];
  failedDrivers: string[];
  summaryLines: string[];
  bestNpmRegistry?: string;
  bestPlaywrightDownloadHost?: string;
}

interface InstallState {
  installedScopes?: string[];
  bestNpmRegistry?: string;
  bestPlaywrightDownloadHost?: string;
  playwrightReady?: boolean;
  playwrightTargetsKey?: string;
  updatedAt?: string;
  depsInstallRoot?: string;
}

function playwrightInstallPackageSpec(): string {
  return `playwright@${process.env.ADA_PLAYWRIGHT_VERSION?.trim() || PINNED_PLAYWRIGHT_VERSION}`;
}

function hypiumDriverInstallPackageSpec(): string {
  return `hypium-driver@${process.env.ADA_HYPIUM_DRIVER_VERSION?.trim() || PINNED_HYPIUM_DRIVER_VERSION}`;
}

function playwrightTargetsKey(config: InstallDepsConfig, override?: string[]): string {
  const targets =
    override && override.length > 0
      ? override
      : config.dependencies.playwrightInstallTargets?.length
        ? config.dependencies.playwrightInstallTargets
        : [config.dependencies.playwrightBrowser];
  return targets.map((x) => String(x).toLowerCase()).sort().join(",");
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "ignore",
      shell: process.platform === "win32",
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exit=${code}`))));
    child.on("error", reject);
  });
}

async function probeMobileRuntimes(
  only: InstallScope,
  tracker: InstallDriverTracker,
  onLogLine?: (line: string) => void
): Promise<void> {
  const checkAndroid = only === "all" || only === "mobile" || only === "android" || only === "drivers";
  const checkIos = only === "all" || only === "mobile" || only === "ios" || only === "drivers";
  if (checkAndroid) {
    const android = await probeAndroidRuntime();
    tracker.record({
      id: "android-adb",
      status: android.adbOnPath && android.deviceConnected ? "skipped" : "missing",
      detail: android.detail
    });
    onLogLine?.(
      android.adbOnPath && android.deviceConnected
        ? `[mobile] ${android.detail}`
        : `[mobile][warn] ${android.detail}`
    );
    const uia2 = await probeAndroidUia2Runtime({ ensureForward: android.deviceConnected });
    tracker.record({
      id: "android-uia2",
      status: uia2.reachable ? "skipped" : "missing",
      detail: uia2.detail
    });
    onLogLine?.(uia2.reachable ? `[mobile] ${uia2.detail}` : `[mobile][warn] ${uia2.detail}`);
  }
  if (checkIos) {
    const ios = await probeIosRuntime();
    const wda = await probeWdaStatus(ios.wdaUrl);
    const ready = ios.hostSupported && ios.xcrunOk && wda.ready;
    tracker.record({
      id: "ios-xcrun",
      status: ios.hostSupported && ios.xcrunOk ? "skipped" : "missing",
      detail: ios.detail
    });
    tracker.record({
      id: "ios-wda",
      status: wda.ready ? "skipped" : "missing",
      detail: wda.detail
    });
    onLogLine?.(ready ? `[mobile] ${wda.detail}` : `[mobile][warn] ${ios.detail}; ${wda.detail}`);
  }
}

async function loadInstallState(): Promise<InstallState> {
  const file = await resolveDepsStateFilePath();
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as InstallState;
  } catch {
    return {};
  }
}

async function saveInstallState(state: InstallState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  state.depsInstallRoot = getSharedDepsRoot() ?? (await resolveDepsInstallRoot());
  const file = await resolveDepsStateFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
}

async function ensurePackageInstalled(
  name: "playwright" | "hypium-driver",
  spec: string,
  force: boolean,
  onLogLine?: (line: string) => void
): Promise<boolean> {
  if (!force && isPackageAvailable(name)) {
    onLogLine?.(`[deps] ${name} 已就绪，跳过安装`);
    return false;
  }
  await ensurePackageResolution(onLogLine);
  const installCwd = getSharedDepsRoot() ?? (await resolveDepsInstallRoot());
  const candidates: Array<{ cmd: string; args: string[] }> = [
    { cmd: "pnpm", args: ["add", spec] },
    { cmd: "npm", args: ["install", spec] }
  ];
  let lastError: unknown;
  for (const c of candidates) {
    try {
      onLogLine?.(`[deps] 执行 ${c.cmd} ${c.args.join(" ")}`);
      await runCommand(c.cmd, c.args, installCwd);
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : `failed to install ${name}`);
}

export async function applyPersistedDownloadProbeFromState(onLogLine?: (line: string) => void): Promise<void> {
  const state = await loadInstallState();
  if (state.bestNpmRegistry?.trim()) {
    process.env.npm_config_registry = state.bestNpmRegistry.trim();
  }
  if (state.bestPlaywrightDownloadHost?.trim() && !process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim()) {
    process.env.PLAYWRIGHT_DOWNLOAD_HOST = state.bestPlaywrightDownloadHost.trim();
  }
  if (state.bestNpmRegistry || state.bestPlaywrightDownloadHost) {
    onLogLine?.(
      `[deps] 复用缓存镜像: registry=${state.bestNpmRegistry ?? "(none)"} playwright=${state.bestPlaywrightDownloadHost ?? "(none)"}`
    );
  }
}

export async function ensureDriverDependencies(config: InstallDepsConfig, options?: EnsureInstallOptions): Promise<InstallSummary> {
  const startedAt = Date.now();
  const only = options?.only ?? "all";
  const force = options?.force === true;
  const onLogLine = options?.onLogLine;
  const pwTargetsKey = playwrightTargetsKey(config, options?.playwrightInstallTargetsOverride);
  const tracker = new InstallDriverTracker(only);

  const root = await resolveWorkspaceRoot(process.cwd());
  await applyAdaToolsToProcessEnv({
    cwd: root,
    relativeDir: config.dependencies.toolsDir?.trim() || "tools",
    onLogLine
  });

  const needPlaywright = only === "all" || only === "playwright";
  const needHarmony =
    only === "all" || only === "harmony" || only === "mobile" || only === "drivers";
  const needMobileHints =
    only === "all" || only === "mobile" || only === "android" || only === "ios" || only === "drivers";

  const installedPackages: string[] = [];
  const skippedPackages: string[] = [];
  const state = await loadInstallState();

  const needNpmInstall =
    needPlaywright || needHarmony;
  if (needNpmInstall && (!state.bestNpmRegistry?.trim() || force)) {
    try {
      const regCandidates = registryCandidateList(
        undefined,
        config.dependencies.npmRegistryCandidates
      );
      const probed = await detectBestRegistry(regCandidates);
      state.bestNpmRegistry = probed.best;
      process.env.npm_config_registry = probed.best;
      onLogLine?.(`[deps] npm registry 测速结果: ${probed.best}`);
    } catch (error) {
      onLogLine?.(`[deps][warn] npm registry 测速失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (state.bestNpmRegistry?.trim()) {
    process.env.npm_config_registry = state.bestNpmRegistry.trim();
  }

  if (needPlaywright) {
    const changed = await ensurePackageInstalled("playwright", playwrightInstallPackageSpec(), force, onLogLine);
    (changed ? installedPackages : skippedPackages).push("playwright");
  }
  if (needHarmony) {
    const changed = await ensurePackageInstalled("hypium-driver", hypiumDriverInstallPackageSpec(), force, onLogLine);
    (changed ? installedPackages : skippedPackages).push("hypium-driver");
  }

  if (needPlaywright && isPackageAvailable("playwright")) {
    if (!state.bestPlaywrightDownloadHost?.trim() || force) {
      try {
        const candidates = [
          ...(config.dependencies.playwrightDownloadHost?.trim()
            ? [config.dependencies.playwrightDownloadHost.trim()]
            : []),
          ...(config.dependencies.playwrightHostCandidates ?? [])
        ];
        const probed = await detectBestPlaywrightDownloadHost(
          candidates.length > 0 ? candidates : [...DEFAULT_PLAYWRIGHT_HOST_CANDIDATES]
        );
        state.bestPlaywrightDownloadHost = probed.best;
        onLogLine?.(`[deps] Playwright CDN 测速结果: ${probed.best}`);
      } catch (error) {
        onLogLine?.(`[deps][warn] Playwright CDN 测速失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const skipBrowsers =
      !force &&
      !options?.playwrightInstallTargetsOverride?.length &&
      state.playwrightReady &&
      state.playwrightTargetsKey === pwTargetsKey;
    if (skipBrowsers) {
      onLogLine?.("[deps] Playwright 浏览器已缓存，跳过 playwright install");
      tracker.record({
        id: "playwright-browsers",
        status: "skipped",
        detail: "cached for targets"
      });
    } else {
      const outcome = await installPlaywrightBrowsers(config, {
        force,
        targetsOverride: options?.playwrightInstallTargetsOverride,
        onLogLine,
        bestHostOverride: state.bestPlaywrightDownloadHost
      });
      tracker.record(outcome);
      if (outcome.status === "installed") {
        state.playwrightReady = true;
        state.playwrightTargetsKey = pwTargetsKey;
      }
    }
  }

  if (needHarmony) {
    const { outcome } = await ensureHarmonyHdcForConfig(config, onLogLine);
    tracker.record(outcome);
    await applyAdaToolsToProcessEnv({
      cwd: root,
      relativeDir: config.dependencies.toolsDir?.trim() || "tools",
      onLogLine
    });
  }

  if (needMobileHints) {
    await probeMobileRuntimes(only, tracker, onLogLine);
    const bootstrapAndroid =
      only === "android" || only === "mobile" || only === "drivers" || only === "all";
    const bootstrapFlag = ["1", "true", "yes"].includes(
      (process.env.ADA_ANDROID_UIA2_BOOTSTRAP ?? "").trim().toLowerCase()
    );
    if (bootstrapAndroid && bootstrapFlag) {
      const { outcome } = await ensureAndroidUia2Bootstrap({ force, onLogLine });
      tracker.record(outcome);
    }
    const bootstrapIos =
      only === "ios" || only === "mobile" || only === "drivers" || only === "all";
    const iosBootstrapFlag = ["1", "true", "yes"].includes(
      (process.env.ADA_IOS_WDA_BOOTSTRAP ?? "").trim().toLowerCase()
    );
    if (bootstrapIos && iosBootstrapFlag) {
      const { outcome } = await ensureIosWdaBootstrap({ force, onLogLine });
      tracker.record(outcome);
    }
  }

  const scopes = new Set(state.installedScopes ?? []);
  if (only === "all") {
    ["playwright", "mobile", "android", "ios", "harmony", "drivers"].forEach((s) => scopes.add(s));
  } else {
    scopes.add(only);
  }
  state.installedScopes = Array.from(scopes);
  await saveInstallState(state);

  invalidateDependencyHealthCache();

  const driverSummary = tracker.build();
  return {
    scope: only,
    force,
    elapsedMs: Date.now() - startedAt,
    requestedDrivers: driverSummary.requestedDrivers,
    installedPackages,
    skippedPackages,
    installedDrivers: driverSummary.installedDrivers,
    skippedDrivers: driverSummary.skippedDrivers,
    failedDrivers: driverSummary.failedDrivers,
    summaryLines: driverSummary.summaryLines,
    bestNpmRegistry: state.bestNpmRegistry,
    bestPlaywrightDownloadHost: state.bestPlaywrightDownloadHost
  };
}

export type GetDependencyHealthOptions = {
  /** Probe hdc (Harmony). Defaults to false to avoid slow hdc on web/android paths. */
  includeHarmony?: boolean;
  /** Bypass in-process cache and re-run probes. */
  fresh?: boolean;
};

type DependencyHealthResult = {
  playwrightInstalled: boolean;
  playwrightLaunchOk: boolean;
  hypiumDriverInstalled: boolean;
  harmonyToolsDir: string | null;
  hdcReachable: boolean;
  hdcTargetsSummary: string;
  packageSources: {
    playwright: PackageSource;
    hypiumDriver: PackageSource;
  };
};

const HEALTH_CACHE_OK_MS = Number(process.env.ADA_DEPS_HEALTH_CACHE_MS ?? 90_000);
const HEALTH_CACHE_FAIL_MS = 15_000;
const PLAYWRIGHT_LAUNCH_OK_MS = Number(process.env.ADA_PLAYWRIGHT_LAUNCH_CACHE_MS ?? 120_000);
const PLAYWRIGHT_LAUNCH_FAIL_MS = 15_000;

let dependencyHealthCache: { key: string; result: DependencyHealthResult; checkedAt: number } | null = null;
let playwrightLaunchCache: { ok: boolean; checkedAt: number } | null = null;

export function invalidateDependencyHealthCache(): void {
  dependencyHealthCache = null;
  playwrightLaunchCache = null;
}

function healthCacheKey(
  config: Pick<InstallDepsConfig, "dependencies"> | undefined,
  includeHarmony: boolean
): string {
  const toolsDir =
    config?.dependencies?.toolsDir?.trim() || process.env.ADA_TOOLS_RELATIVE_DIR?.trim() || "tools";
  return `${toolsDir}|harmony:${includeHarmony}`;
}

async function probePlaywrightLaunch(): Promise<boolean> {
  const now = Date.now();
  if (playwrightLaunchCache) {
    const ttl = playwrightLaunchCache.ok ? PLAYWRIGHT_LAUNCH_OK_MS : PLAYWRIGHT_LAUNCH_FAIL_MS;
    if (now - playwrightLaunchCache.checkedAt < ttl) {
      return playwrightLaunchCache.ok;
    }
  }
  let ok = false;
  try {
    const mod = (await new Function('return import("playwright")')()) as {
      chromium: { launch: (options: Record<string, unknown>) => Promise<{ close: () => Promise<void> }> };
    };
    const browser = await mod.chromium.launch({ headless: true });
    await browser.close();
    ok = true;
  } catch {
    ok = false;
  }
  playwrightLaunchCache = { ok, checkedAt: now };
  return ok;
}

async function getDependencyHealthUncached(
  config: Pick<InstallDepsConfig, "dependencies"> | undefined,
  includeHarmony: boolean
): Promise<DependencyHealthResult> {
  await ensurePackageResolution();
  const root = await resolveWorkspaceRoot(process.cwd());
  const tools = await applyAdaToolsToProcessEnv({
    cwd: root,
    relativeDir: config?.dependencies?.toolsDir?.trim() || process.env.ADA_TOOLS_RELATIVE_DIR?.trim() || "tools"
  });

  const playwrightInstalled = isPackageAvailable("playwright");
  const playwrightLaunchOk = playwrightInstalled ? await probePlaywrightLaunch() : false;

  let hdcReachable = false;
  let hdcTargetsSummary = "";
  if (includeHarmony && tools.hdcPath) {
    const probe = await probeHdc(tools.hdcPath);
    hdcReachable = probe.ok;
    hdcTargetsSummary = probe.ok ? probe.output : probe.error ?? probe.output;
  }

  return {
    playwrightInstalled,
    playwrightLaunchOk,
    hypiumDriverInstalled: isPackageAvailable("hypium-driver"),
    harmonyToolsDir: tools.toolsDir,
    hdcReachable,
    hdcTargetsSummary,
    packageSources: {
      playwright: getPackageSource("playwright"),
      hypiumDriver: getPackageSource("hypium-driver")
    }
  };
}

export async function getDependencyHealth(
  config?: Pick<InstallDepsConfig, "dependencies">,
  options?: GetDependencyHealthOptions
): Promise<DependencyHealthResult> {
  const includeHarmony = options?.includeHarmony === true;
  const fresh = options?.fresh === true;
  const key = healthCacheKey(config, includeHarmony);

  if (!fresh && dependencyHealthCache && dependencyHealthCache.key === key) {
    const ttl = dependencyHealthCache.result.playwrightLaunchOk ? HEALTH_CACHE_OK_MS : HEALTH_CACHE_FAIL_MS;
    if (Date.now() - dependencyHealthCache.checkedAt < ttl) {
      return dependencyHealthCache.result;
    }
  }

  const result = await getDependencyHealthUncached(config, includeHarmony);
  dependencyHealthCache = { key, result, checkedAt: Date.now() };
  return result;
}
