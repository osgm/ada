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
import { emitInstallProgress } from "./install-progress.js";
import { depsLogLine, wrapInstallDepsLogEmitter } from "./log-locale.js";
import {
  ensurePlaywrightDownloadHostSeeded,
  resolveDefaultPlaywrightDownloadHost,
  shouldProbeNpmRegistry,
  shouldProbePlaywrightCdn
} from "./download-probe-persist.js";
import { detectBestRegistry, registryCandidateList } from "./registry-probe.js";
import { DEFAULT_NPM_REGISTRY_CANDIDATES } from "@ada/download-probe";
import { DEFAULT_PLAYWRIGHT_HOST_CANDIDATES } from "@ada/download-probe";
import { detectBestPlaywrightDownloadHost, installPlaywrightBrowsers } from "./playwright-browser-install.js";
import { playwrightBrowsersDirHasChromium } from "./playwright-browsers-discovery.js";
import { probeAndroidRuntime, probeIosRuntime, probeAndroidUia2Runtime, probeWdaStatus } from "@ada/runtime-probe";
import { ensureAndroidUia2Bootstrap } from "./android-uia2-bootstrap.js";
import { ensureIosWdaBootstrap } from "./ios-wda-bootstrap.js";
import { isIosHostSupported } from "./platform-support.js";

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
  seededByLauncher?: boolean;
  seededByStandalone?: boolean;
  seededByLauncherVersion?: string;
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

function shouldUseShell(command: string): boolean {
  return process.platform === "win32" && !path.isAbsolute(command) && !command.includes(path.sep);
}

function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ["--version"], {
      stdio: "ignore",
      shell: shouldUseShell(command),
      env: process.env,
      ...(process.platform === "win32" ? ({ windowsHide: true } as const) : {})
    });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function resolvePackageInstallCandidates(
  spec: string
): Promise<Array<{ cmd: string; args: string[] }>> {
  const out: Array<{ cmd: string; args: string[] }> = [];
  if (await commandExists("pnpm")) {
    out.push({ cmd: "pnpm", args: ["add", spec] });
  }
  if (await commandExists("npm")) {
    out.push({ cmd: "npm", args: ["install", spec] });
  }
  if (out.length === 0) {
    out.push({ cmd: "npm", args: ["install", spec] });
  }
  return out;
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
  const checkIos =
    isIosHostSupported() &&
    (only === "all" || only === "mobile" || only === "ios" || only === "drivers");
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
    if (!android.adbOnPath) {
      tracker.record({
        id: "android-uia2",
        status: "missing",
        detail: "adb not on PATH"
      });
    } else if (!android.deviceConnected) {
      tracker.record({
        id: "android-uia2",
        status: "skipped",
        detail: "no adb device; UIA2 deferred until device connected"
      });
      onLogLine?.("[mobile] UIA2 probe skipped (no adb device)");
    } else {
      const uia2 = await probeAndroidUia2Runtime({ ensureForward: true });
      tracker.record({
        id: "android-uia2",
        status: uia2.reachable ? "skipped" : "missing",
        detail: uia2.detail
      });
      onLogLine?.(uia2.reachable ? `[mobile] ${uia2.detail}` : `[mobile][warn] ${uia2.detail}`);
    }
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

function resolveLauncherRegistryHint(): string {
  const explicit = process.env.ADA_MCP_LAUNCHER_REGISTRY?.trim();
  if (explicit) {
    return explicit;
  }
  if (process.env.ADA_MCP_LAUNCHER_RAN === "1") {
    return process.env.npm_config_registry?.trim() ?? "";
  }
  return "";
}

function scopeMarkedInState(state: InstallState, only: InstallScope): boolean {
  const scopes = new Set(state.installedScopes ?? []);
  if (scopes.has("all")) {
    return true;
  }
  if (only === "all") {
    return scopes.has("playwright") && scopes.has("harmony") && (scopes.has("mobile") || scopes.has("drivers"));
  }
  return scopes.has(only);
}

/** 已写入 install state 且包/浏览器就绪则视为完成（force 时不跳过） */
export async function isInstallScopeComplete(
  only: InstallScope,
  config: InstallDepsConfig,
  options?: Pick<EnsureInstallOptions, "force" | "playwrightInstallTargetsOverride">
): Promise<boolean> {
  if (options?.force) {
    return false;
  }
  if (options?.playwrightInstallTargetsOverride?.length) {
    return false;
  }
  const state = await loadInstallState();
  if (!scopeMarkedInState(state, only)) {
    return false;
  }

  const pwTargetsKey = playwrightTargetsKey(config, options?.playwrightInstallTargetsOverride);
  const needPlaywright = only === "all" || only === "playwright";
  const needHarmony =
    only === "all" || only === "harmony" || only === "mobile" || only === "drivers";

  if (needPlaywright) {
    if (!isPackageAvailable("playwright")) {
      return false;
    }
    const browsersPath = await resolvePlaywrightBrowsersPath({});
    const browsersOk =
      (state.playwrightReady && state.playwrightTargetsKey === pwTargetsKey) ||
      (await playwrightBrowsersDirHasChromium(browsersPath));
    if (!browsersOk) {
      return false;
    }
  }

  if (needHarmony) {
    if (!isPackageAvailable("hypium-driver")) {
      return false;
    }
  }

  return true;
}

function buildSkippedInstallSummary(
  only: InstallScope,
  startedAt: number,
  state: InstallState
): InstallSummary {
  return {
    scope: only,
    force: false,
    elapsedMs: Date.now() - startedAt,
    requestedDrivers: [],
    installedPackages: [],
    skippedPackages: [
      ...(only === "all" || only === "playwright" ? (["playwright"] as const) : []),
      ...(only === "all" || only === "harmony" || only === "mobile" || only === "drivers"
        ? (["hypium-driver"] as const)
        : [])
    ],
    installedDrivers: [],
    skippedDrivers: [],
    failedDrivers: [],
    summaryLines: [`scope ${only} already installed`],
    bestNpmRegistry: state.bestNpmRegistry,
    bestPlaywrightDownloadHost: state.bestPlaywrightDownloadHost
  };
}

async function ensurePackageInstalled(
  name: "playwright" | "hypium-driver",
  spec: string,
  force: boolean,
  onLogLine?: (line: string) => void
): Promise<boolean> {
  if (!force && isPackageAvailable(name)) {
    onLogLine?.(
      depsLogLine(`[deps] ${name} 已就绪，跳过安装`, `[deps] ${name} ready, skip install`)
    );
    return false;
  }
  await ensurePackageResolution(onLogLine);
  const installCwd = getSharedDepsRoot() ?? (await resolveDepsInstallRoot());
  const candidates = await resolvePackageInstallCandidates(spec);
  let lastError: unknown;
  for (const c of candidates) {
    try {
      onLogLine?.(
        depsLogLine(
          `[deps] 执行 ${c.cmd} ${c.args.join(" ")}`,
          `[deps] run ${c.cmd} ${c.args.join(" ")}`
        )
      );
      await runCommand(c.cmd, c.args, installCwd);
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : `failed to install ${name}`);
}

function normalizeRegistryUrl(registry: string): string {
  return registry.replace(/\/$/, "");
}

/**
 * 不经 @ada-mcp/launcher 启动 mcp-server 时，写入默认 registry + Playwright CDN（跳过 bootstrap 测速）。
 */
export async function ensureStandaloneMcpProbeSeed(onLogLine?: (line: string) => void): Promise<void> {
  if (process.env.ADA_MCP_LAUNCHER_RAN === "1") {
    return;
  }
  const log = wrapInstallDepsLogEmitter(onLogLine);
  const state = await loadInstallState();
  const envReg =
    process.env.ADA_MCP_REGISTRY?.trim() ||
    process.env.ADA_MCP_LAUNCHER_REGISTRY?.trim() ||
    process.env.npm_config_registry?.trim();
  if (
    state.seededByLauncher &&
    state.bestNpmRegistry?.trim() &&
    state.bestPlaywrightDownloadHost?.trim()
  ) {
    await applyPersistedDownloadProbeFromState(log);
    return;
  }
  const registry = normalizeRegistryUrl(
    envReg || state.bestNpmRegistry?.trim() || DEFAULT_NPM_REGISTRY_CANDIDATES[0]
  );
  const pwHost = resolveDefaultPlaywrightDownloadHost(registry);
  state.bestNpmRegistry = registry;
  state.bestPlaywrightDownloadHost = pwHost;
  state.seededByStandalone = true;
  process.env.npm_config_registry = registry;
  process.env.PLAYWRIGHT_DOWNLOAD_HOST = pwHost;
  await saveInstallState(state);
  log?.(
    depsLogLine(
      `[deps] standalone MCP seed: registry=${registry} playwright=${pwHost}`,
      `[deps] standalone MCP seed: registry=${registry} playwright=${pwHost}`
    )
  );
}

export async function applyPersistedDownloadProbeFromState(onLogLine?: (line: string) => void): Promise<void> {
  const log = wrapInstallDepsLogEmitter(onLogLine);
  const state = await loadInstallState();
  if (state.bestNpmRegistry?.trim()) {
    process.env.npm_config_registry = state.bestNpmRegistry.trim();
  }
  if (state.bestPlaywrightDownloadHost?.trim() && !process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim()) {
    process.env.PLAYWRIGHT_DOWNLOAD_HOST = state.bestPlaywrightDownloadHost.trim();
  }
  if (state.bestNpmRegistry || state.bestPlaywrightDownloadHost) {
    log?.(
      depsLogLine(
        `[deps] 复用缓存镜像: registry=${state.bestNpmRegistry ?? "(none)"} playwright=${state.bestPlaywrightDownloadHost ?? "(none)"}`,
        `[deps] reuse cached mirrors: registry=${state.bestNpmRegistry ?? "(none)"} playwright=${state.bestPlaywrightDownloadHost ?? "(none)"}`
      )
    );
  }
}

export async function ensureDriverDependencies(config: InstallDepsConfig, options?: EnsureInstallOptions): Promise<InstallSummary> {
  const startedAt = Date.now();
  const only = options?.only ?? "all";
  const force = options?.force === true;
  const onLogLine = wrapInstallDepsLogEmitter(options?.onLogLine, only);
  const pwTargetsKey = playwrightTargetsKey(config, options?.playwrightInstallTargetsOverride);

  emitInstallProgress({
    status: "running",
    phase: "scope",
    scope: only,
    message: `install scope: ${only}`,
    percent: 25
  });

  if (!force && (await isInstallScopeComplete(only, config, options))) {
    const state = await loadInstallState();
    onLogLine?.(
      depsLogLine(
        `[deps] ${only} 已安装，跳过（force=true 可强制重装）`,
        `[deps] scope ${only} already installed, skip (force=true to reinstall)`
      )
    );
    return buildSkippedInstallSummary(only, startedAt, state);
  }

  if (only === "ios" && !isIosHostSupported()) {
    const state = await loadInstallState();
    onLogLine?.(
      depsLogLine(
        "[deps] iOS 依赖跳过（需 macOS 宿主机）",
        "[deps] iOS deps skipped (requires macOS host)"
      )
    );
    return {
      scope: only,
      force,
      elapsedMs: Date.now() - startedAt,
      requestedDrivers: [],
      installedPackages: [],
      skippedPackages: [],
      installedDrivers: [],
      skippedDrivers: [],
      failedDrivers: [],
      summaryLines: [
        depsLogLine("iOS 需 macOS 宿主机，已跳过", "iOS requires macOS host, skipped")
      ],
      bestNpmRegistry: state.bestNpmRegistry,
      bestPlaywrightDownloadHost: state.bestPlaywrightDownloadHost
    };
  }

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
  const launcherReg = resolveLauncherRegistryHint();
  if (launcherReg) {
    state.bestNpmRegistry = launcherReg;
    process.env.npm_config_registry = launcherReg;
  }
  if (
    needNpmInstall &&
    shouldProbeNpmRegistry({
      launcherRegistryHint: launcherReg,
      persistedRegistry: state.bestNpmRegistry,
      force
    })
  ) {
    try {
      const regCandidates = registryCandidateList(
        undefined,
        config.dependencies.npmRegistryCandidates
      );
      const probed = await detectBestRegistry(regCandidates);
      state.bestNpmRegistry = probed.best;
      process.env.npm_config_registry = probed.best;
      onLogLine?.(
        depsLogLine(
          `[deps] npm registry 测速结果: ${probed.best}`,
          `[deps] npm registry probe: ${probed.best}`
        )
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      onLogLine?.(
        depsLogLine(
          `[deps][warn] npm registry 测速失败: ${msg}`,
          `[deps][warn] npm registry probe failed: ${msg}`
        )
      );
    }
  } else if (state.bestNpmRegistry?.trim()) {
    process.env.npm_config_registry = state.bestNpmRegistry.trim();
    onLogLine?.(
      depsLogLine(
        `[deps] 复用 launcher/state registry: ${state.bestNpmRegistry.trim()}`,
        `[deps] reuse launcher/state registry: ${state.bestNpmRegistry.trim()}`
      )
    );
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
    ensurePlaywrightDownloadHostSeeded(state, config, onLogLine);
    if (
      shouldProbePlaywrightCdn({
        force,
        hasHost: Boolean(state.bestPlaywrightDownloadHost?.trim())
      })
    ) {
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
        process.env.PLAYWRIGHT_DOWNLOAD_HOST = probed.best;
        onLogLine?.(
          depsLogLine(
            `[deps] Playwright CDN 测速结果: ${probed.best}`,
            `[deps] Playwright CDN probe: ${probed.best}`
          )
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onLogLine?.(
          depsLogLine(
            `[deps][warn] Playwright CDN 测速失败: ${msg}`,
            `[deps][warn] Playwright CDN probe failed: ${msg}`
          )
        );
      }
    }
    const browsersPath = await resolvePlaywrightBrowsersPath({ onLogLine });
    const stateBrowsersReady =
      state.playwrightReady && state.playwrightTargetsKey === pwTargetsKey;
    const hasLocalChromium =
      !force &&
      !options?.playwrightInstallTargetsOverride?.length &&
      (await playwrightBrowsersDirHasChromium(browsersPath));
    const skipBrowsers =
      !force &&
      !options?.playwrightInstallTargetsOverride?.length &&
      (stateBrowsersReady || hasLocalChromium);
    if (skipBrowsers) {
      if (hasLocalChromium && !stateBrowsersReady) {
        state.playwrightReady = true;
        state.playwrightTargetsKey = pwTargetsKey;
        onLogLine?.(
          depsLogLine(
            "[deps] 检测到本机已有 Playwright 浏览器，跳过 playwright install",
            "[deps] local Playwright browsers found, skip playwright install"
          )
        );
      } else {
        onLogLine?.(
          depsLogLine(
            "[deps] Playwright 浏览器已缓存，跳过 playwright install",
            "[deps] Playwright browsers cached, skip playwright install"
          )
        );
      }
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
      const androidForBootstrap = await probeAndroidRuntime();
      if (androidForBootstrap.deviceConnected) {
        const { outcome } = await ensureAndroidUia2Bootstrap({ force, onLogLine });
        tracker.record(outcome);
      } else {
        onLogLine?.("[mobile] UIA2 bootstrap skipped (no adb device)");
      }
    }
    const bootstrapIos =
      isIosHostSupported() &&
      (only === "ios" || only === "mobile" || only === "drivers" || only === "all");
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
    const allScopes = ["playwright", "mobile", "android", "harmony", "drivers"];
    if (isIosHostSupported()) {
      allScopes.push("ios");
    }
    allScopes.forEach((s) => scopes.add(s));
  } else {
    scopes.add(only);
  }
  state.installedScopes = Array.from(scopes);
  await saveInstallState(state);

  invalidateDependencyHealthCache();

  const driverSummary = tracker.build();
  const failed = driverSummary.failedDrivers.length;
  emitInstallProgress({
    status: failed > 0 ? "warn" : "ok",
    phase: "scope",
    scope: only,
    message: failed > 0 ? `scope ${only} finished with ${failed} driver(s) not ready` : `scope ${only} finished`,
    percent: failed > 0 ? 85 : 95,
    detail: driverSummary.summaryLines.slice(0, 3).join("; ")
  });
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
  /** npm 包 + install state 标记（不等于设备/runtime 就绪） */
  packagesReady: {
    playwright: boolean;
    mobile: boolean;
    android: boolean;
    ios: boolean;
    harmony: boolean;
    all: boolean;
  };
  /** 探测后的真实运行时就绪 */
  runtimeReady: {
    web: boolean;
    harmony: boolean;
  };
  packageSources: {
    playwright: PackageSource;
    hypiumDriver: PackageSource;
  };
};

export async function getPackagesReadiness(
  config: InstallDepsConfig
): Promise<DependencyHealthResult["packagesReady"]> {
  const [playwright, mobile, android, ios, harmony, all] = await Promise.all([
    isInstallScopeComplete("playwright", config),
    isInstallScopeComplete("mobile", config),
    isInstallScopeComplete("android", config),
    isInstallScopeComplete("ios", config),
    isInstallScopeComplete("harmony", config),
    isInstallScopeComplete("all", config)
  ]);
  return { playwright, mobile, android, ios, harmony, all };
}

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

  const hypiumDriverInstalled = isPackageAvailable("hypium-driver");
  const depsConfig = (config ?? { dependencies: {} }) as InstallDepsConfig;
  const packagesReady = await getPackagesReadiness(depsConfig);

  return {
    playwrightInstalled,
    playwrightLaunchOk,
    hypiumDriverInstalled,
    harmonyToolsDir: tools.toolsDir,
    hdcReachable,
    hdcTargetsSummary,
    packagesReady,
    runtimeReady: {
      web: playwrightInstalled && playwrightLaunchOk,
      harmony: hypiumDriverInstalled && hdcReachable
    },
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
