import { loadConfig, maskToken } from "@ada/agent/config";
import { loadSecret } from "@ada/agent/secrets";
import { getMcpBootstrapStatus, runBootstrapInstallDeps } from "@ada/install-deps";
import {
  ensureDriverDependencies,
  getDependencyHealth,
  getLatestInstallProgress,
  probeRuntimesForTasks,
  type InstallScope,
  type InstallSummary
} from "@ada/install-deps";
import { checkJavaRuntime, runDoctor } from "@ada/agent/doctor";
import { listBuiltInPluginManifests } from "@ada/agent/plugin-registry";
import { runSetupCli } from "@ada/agent/setup-cli";
import { runSetupNative } from "@ada/agent/setup-native";
import { runSetupUi } from "@ada/agent/bootstrap-ui";
import {
  applyDeviceRegistryToEnv,
  buildDeviceParamsGuide,
  registryToDeviceListRows,
  type DeviceListRow,
  type DeviceParamsGuide,
  type DeviceRegistryDefaults
} from "@ada/runtime-probe";
import {
  deviceRegistryPath,
  isDeviceAutoScanEnabled,
  loadDeviceRegistry,
  scanAndPersistDevices
} from "@ada/agent/device-store";
import { patchRemoteCredentials, persistAgentSetup } from "@ada/agent/setup-state";
import { createRuntimeTransport } from "@ada/agent/transport-client";
import { processQueueOnce, watchQueue } from "@ada/agent/queue-runner";
import { runDemoTaskset, runForegroundLoop, runTaskset } from "@ada/agent/runtime";
import { loadTaskFile } from "@ada/agent/task-loader";
import { log } from "@ada/agent/logger";
import type { AgentConfig, BootstrapInput, SetupMode } from "@ada/agent/types";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import fs from "node:fs/promises";

export async function getHealthSnapshot(options?: {
  config?: AgentConfig;
  includeHarmony?: boolean;
  fresh?: boolean;
}): Promise<Record<string, unknown>> {
  const config = options?.config ?? (await loadConfig());
  const secret = await loadSecret(config.bootstrapUI.secretsProvider);
  const includeHarmony = options?.includeHarmony ?? true;
  const deps = await getDependencyHealth(config, { includeHarmony, fresh: options?.fresh });
  const mcpBootstrap = getMcpBootstrapStatus();
  const installProgress = getLatestInstallProgress();
  const deviceRegistry = await loadDeviceRegistry();
  return {
    status: "ok",
    mcpBootstrap,
    installProgress,
    setupConfigured: Boolean(secret),
    transport: config.transport,
    graphics: config.graphics,
    monitoring: config.monitoring,
    plugins: listBuiltInPluginManifests().map((m) => ({
      id: m.id,
      platforms: m.platforms,
      engine: m.engine
    })),
    dependencies: deps,
    deviceRegistry: deviceRegistry
      ? {
          lastScanAt: deviceRegistry.lastScanAt,
          defaults: deviceRegistry.defaults,
          deviceCount: deviceRegistry.devices.length,
          authorizedCount: deviceRegistry.devices.filter((d) => d.authorized).length
        }
      : null
  };
}

export async function getDeviceRegistrySnapshot(): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  const registry = await loadDeviceRegistry();
  const display = await getDeviceListForDisplay();
  const deviceParams = buildDeviceParamsGuide(registry);
  return {
    configured: Boolean(config.devices),
    autoScanOnSetup: config.devices?.autoScanOnSetup ?? true,
    autoScanOnStart: config.devices?.autoScanOnStart ?? true,
    registry,
    rows: display.rows,
    lastScanAt: display.lastScanAt,
    defaults: display.defaults,
    deviceParams
  };
}

export async function scanMobileDevicesAndPersist(options?: {
  deviceTags?: string[];
}): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  const { registry, scan, file } = await scanAndPersistDevices(config, {
    deviceTags: options?.deviceTags,
    applyEnv: true
  });
  return { file, scan, registry };
}

export type { DeviceListRow };

/** GUI / 上游展示：设备列表行（名称、ID、分辨率、系统类别、SDK） */
export async function getDeviceListForDisplay(): Promise<{
  rows: DeviceListRow[];
  lastScanAt?: string;
  defaults: DeviceRegistryDefaults;
  file?: string;
}> {
  const registry = await loadDeviceRegistry();
  let file: string | undefined;
  try {
    file = await deviceRegistryPath();
  } catch {
    file = undefined;
  }
  return {
    rows: registryToDeviceListRows(registry),
    lastScanAt: registry?.lastScanAt,
    defaults: registry?.defaults ?? {},
    file: registry ? file : undefined
  };
}

export async function scanDevicesAndListForDisplay(): Promise<{
  rows: DeviceListRow[];
  lastScanAt?: string;
  defaults: DeviceRegistryDefaults;
  file: string;
  scanErrors: Array<{ platform: string; message: string }>;
  deviceParams: DeviceParamsGuide;
  hints?: string[];
}> {
  const config = await loadConfig();
  const { registry, scan, file } = await scanAndPersistDevices(config, { applyEnv: true });
  const rows = registryToDeviceListRows(registry);
  const deviceParams = buildDeviceParamsGuide(registry);
  const hints: string[] = [...deviceParams.rules];
  const androidErr = scan.errors.find((e) => e.platform === "android");
  if (androidErr) {
    hints.push(`Android scan failed: ${androidErr.message}`);
  } else if (!rows.some((r) => r.platform === "android")) {
    hints.push(
      "No Android device in scan. Connect USB, authorize adb on phone, run: adb devices. For mobile_action use platform=android and payload.capabilities.udid."
    );
  }
  if (!rows.some((r) => r.platform === "harmony") && !scan.errors.some((e) => e.platform === "harmony")) {
    hints.push("No Harmony device online (hdc list targets empty). Use platform=harmony only when a Harmony device is connected.");
  }
  return {
    rows,
    lastScanAt: registry.lastScanAt,
    defaults: registry.defaults,
    file,
    scanErrors: scan.errors.map((e) => ({ platform: e.platform, message: e.message })),
    deviceParams,
    ...(hints.length ? { hints } : {})
  };
}

const DOCTOR_CACHE_MS = Number(process.env.ADA_DOCTOR_CACHE_MS ?? 60_000);
let doctorSnapshotCache: { scope: string; checkedAt: number; result: Record<string, unknown> } | null = null;

export function invalidateDoctorSnapshotCache(): void {
  doctorSnapshotCache = null;
}

export async function getDoctorSnapshot(scope: "web" | "mobile" | "all" = "all"): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (doctorSnapshotCache && doctorSnapshotCache.scope === scope && now - doctorSnapshotCache.checkedAt < DOCTOR_CACHE_MS) {
    return doctorSnapshotCache.result;
  }
  const config = await loadConfig();
  const result = (await runDoctor(config, { scope })) as Record<string, unknown>;
  doctorSnapshotCache = { scope, checkedAt: now, result };
  return result;
}

export function getBuiltInPlugins() {
  return listBuiltInPluginManifests().map((m) => ({
    id: m.id,
    platforms: m.platforms,
    engine: m.engine
  }));
}

export {
  parseInstallDepsSpec,
  resolveBootstrapInstallDeps,
  runBootstrapInstallDeps
} from "@ada/install-deps";

export type { InstallScope, InstallSummary, TaskRuntimeProbe } from "@ada/install-deps";
export { getDependencyHealth, ensureDriverDependencies, probeRuntimesForTasks } from "@ada/install-deps";
export {
  isDeviceAutoScanEnabled,
  loadDeviceRegistry,
  scanAndPersistDevices
} from "@ada/agent/device-store";

export type InstallDependencyExtras = {
  playwrightInstallTargetsOverride?: string[];
};

export async function installDependencies(
  only: InstallScope = "all",
  force = false,
  onLogLine?: (line: string) => void,
  extras?: InstallDependencyExtras
): Promise<InstallSummary> {
  const config = await loadConfig();
  return ensureDriverDependencies(config, { only, force, onLogLine, ...extras });
}

/** 将远程控制面地址与 API Key 写入本地密钥文件（供 Agent / MCP 使用） */
export async function applyRemoteCredentials(serverUrl: string, apiKey?: string): Promise<void> {
  await patchRemoteCredentials(serverUrl, apiKey);
}

function hasPlatformTask(tasks: CommandEnvelope[], platform: "web" | "android" | "ios" | "harmony"): boolean {
  return tasks.some((task) => task.platform === platform);
}

function hasPlaywrightWebTask(tasks: CommandEnvelope[]): boolean {
  return tasks.some((task) => task.platform === "web");
}

function classifyExecutionFailure(errorCode: string): "environment" | "locator" | "assertion" | "driver" | "unknown" {
  if (
    errorCode === "SESSION_CREATE_FAILED" ||
    errorCode === "ANDROID_SESSION_CREATE_FAILED" ||
    errorCode === "IOS_SESSION_CREATE_FAILED" ||
    errorCode === "HARMONY_SESSION_CREATE_FAILED" ||
    errorCode.endsWith("_PROBE_FAILED") ||
    errorCode.endsWith("_CLICK_FAILED") ||
    errorCode.endsWith("_SWIPE_FAILED") ||
    errorCode.endsWith("_TYPE_FAILED") ||
    errorCode.endsWith("_SCREENSHOT_FAILED")
  ) {
    return "environment";
  }
  if (errorCode.includes("ELEMENT_NOT_FOUND") || errorCode.includes("LOOKUP_FAILED") || errorCode.includes("MISSING_ELEMENT")) {
    return "locator";
  }
  if (errorCode.includes("ASSERT")) {
    return "assertion";
  }
  if (errorCode.includes("UNSUPPORTED_COMMAND")) {
    return "driver";
  }
  return "unknown";
}

function buildRemediationHints(input: {
  dependencyMissing: string[];
  browserNotLaunchable: boolean;
  mobileRuntimeUnready: boolean;
  harmonyHdcUnready: boolean;
  executionFailureTypes: Array<"environment" | "locator" | "assertion" | "driver" | "unknown">;
}): string[] {
  const hints: string[] = [];
  if (input.dependencyMissing.length > 0) hints.push("运行 `./ada-agent install-deps` 补齐依赖");
  if (input.dependencyMissing.includes("java-runtime")) hints.push("安装 JDK 并配置 JAVA_HOME / PATH 中的 java");
  if (input.browserNotLaunchable) hints.push("执行 `./ada-agent doctor` 检查 Playwright 后重试安装浏览器");
  if (input.mobileRuntimeUnready) hints.push("移动运行环境未就绪：请先检查 `adb` / `xcrun` / WDA 与设备连接");
  if (input.harmonyHdcUnready) hints.push("Harmony 未就绪：请执行 install-deps --only=harmony 并确认 hdc 可连接设备");
  if (input.executionFailureTypes.includes("locator")) hints.push("定位失败：检查 locator/elementId 是否正确");
  if (input.executionFailureTypes.includes("assertion")) hints.push("断言失败：先加截图确认页面状态");
  if (input.executionFailureTypes.includes("driver")) hints.push("驱动失败：检查 command 是否被当前平台支持");
  if (input.executionFailureTypes.includes("environment")) hints.push("环境失败：检查设备连接与浏览器/驱动运行状态");
  if (input.executionFailureTypes.includes("unknown")) hints.push("未知失败：结合日志与 executionFailures 继续定位");
  return hints;
}

export function classifyRequireRealFailures(
  tasks: CommandEnvelope[],
  results: CommandResult[],
  deps: Awaited<ReturnType<typeof getDependencyHealth>>,
  runtime: Awaited<ReturnType<typeof probeRuntimesForTasks>>,
  javaOk: boolean
): Record<string, unknown> {
  const hasPlaywrightTask = hasPlaywrightWebTask(tasks);
  const hasAndroidTask = hasPlatformTask(tasks, "android");
  const hasIosTask = hasPlatformTask(tasks, "ios");
  const hasHarmonyTask = hasPlatformTask(tasks, "harmony");
  const dependencyMissing: string[] = [];
  if (hasPlaywrightTask && !deps.playwrightInstalled) dependencyMissing.push("playwright");
  const browserNotLaunchable = hasPlaywrightTask && deps.playwrightInstalled && !deps.playwrightLaunchOk;
  const androidUnready = hasAndroidTask && (!runtime.android.ready || !javaOk);
  const iosUnready = hasIosTask && !runtime.ios.ready;
  const mobileRuntimeUnready = androidUnready || iosUnready;
  const harmonyHdcUnready = hasHarmonyTask && !runtime.harmony.ready;
  if (hasAndroidTask && !javaOk) dependencyMissing.push("java-runtime");
  if (hasAndroidTask && !runtime.android.ready) dependencyMissing.push("android-runtime");
  if (iosUnready) dependencyMissing.push("ios-runtime");
  if (harmonyHdcUnready) dependencyMissing.push("hdc-or-tools");
  const mockFallbacks = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => (result.data as Record<string, unknown> | undefined)?.mode === "mock")
    .map(({ result, index }) => ({ index, requestId: result.requestId, reason: (result.data as Record<string, unknown> | undefined)?.reason ?? "unknown" }));
  const executionFailures = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => !result.success)
    .map(({ result, index }) => ({
      index,
      requestId: result.requestId,
      errorCode: result.errorCode ?? "UNKNOWN_ERROR",
      errorType: classifyExecutionFailure(result.errorCode ?? "UNKNOWN_ERROR"),
      errorMessage: result.errorMessage ?? "unknown execution failure"
    }));
  const executionFailureTypes = Array.from(new Set(executionFailures.map((item) => item.errorType)));
  return {
    dependencyMissing,
    browserNotLaunchable,
    mobileRuntimeUnready,
    harmonyHdcUnready,
    runtimeProbe: runtime,
    mockFallbackCount: mockFallbacks.length,
    executionFailureCount: executionFailures.length,
    executionFailureTypes,
    mockFallbacks,
    executionFailures,
    remediationHints: buildRemediationHints({
      dependencyMissing,
      browserNotLaunchable,
      mobileRuntimeUnready,
      harmonyHdcUnready,
      executionFailureTypes
    })
  };
}

function parseSetupMode(configured: SetupMode, modeArg?: SetupMode): SetupMode {
  if (modeArg === "auto" || modeArg === "cli" || modeArg === "gui") {
    return modeArg;
  }
  return configured;
}

async function runSetupByMode(config: AgentConfig, mode: SetupMode): Promise<{ payload: BootstrapInput }> {
  if (mode === "cli") return runSetupCli();
  if (mode === "gui") {
    if (config.bootstrapUI.native.enabled) {
      try {
        return await runSetupNative(config);
      } catch (error) {
        if (!config.bootstrapUI.native.fallbackToWeb) throw error;
        log("warn", { event: "setup.native.fallback", details: { reason: error instanceof Error ? error.message : String(error) } });
      }
    }
    return runSetupUi(config);
  }
  if (process.platform === "linux") return runSetupCli();
  if (config.bootstrapUI.native.enabled) {
    try {
      return await runSetupNative(config);
    } catch (error) {
      if (!config.bootstrapUI.native.fallbackToWeb) throw error;
      log("warn", { event: "setup.native.fallback", details: { reason: error instanceof Error ? error.message : String(error) } });
    }
  }
  return runSetupUi(config);
}

export async function runSetupFlow(modeArg?: SetupMode): Promise<void> {
  const config = await loadConfig();
  if (!config.bootstrapUI.enabled) throw new Error("bootstrapUI is disabled. Enable bootstrapUI to run setup.");
  const mode = parseSetupMode(config.bootstrapUI.mode, modeArg);
  const result = await runSetupByMode(config, mode);
  await persistAgentSetup(config, result.payload);
  console.log("[ADA-AGENT] setup completed");
}

export async function runStartFlow(options?: {
  localDev?: boolean;
  skipDeps?: boolean;
  skipSetup?: boolean;
  runOnce?: boolean;
  runWatch?: boolean;
}): Promise<void> {
  const config = await loadConfig();
  const localDev = options?.localDev === true;
  const skipDeps = options?.skipDeps === true;
  log("info", {
    event: "runtime.env.check.start",
    details: {
      localDev,
      skipDeps,
      autoInstallOnStart: config.dependencies.autoInstallOnStart,
      nodeVersion: process.version,
      platform: process.platform
    }
  });
  const includeHarmonyForConfig = (config.monitoring?.platforms ?? []).some(
    (platform) => platform.toLowerCase().trim() === "harmony"
  );
  const preDeps = await getDependencyHealth(config, { includeHarmony: includeHarmonyForConfig, fresh: true });
  const preDoctor = await runDoctor(config);
  log("info", {
    event: "runtime.env.check.preflight",
    details: {
      status: preDoctor.status,
      dependencies: preDeps,
      androidRuntime: (preDoctor.checks as Record<string, unknown> | undefined)?.androidRuntime,
      iosRuntime: (preDoctor.checks as Record<string, unknown> | undefined)?.iosRuntime,
      javaRuntime: (preDoctor.checks as Record<string, unknown> | undefined)?.javaRuntime
    }
  });
  if (config.dependencies.autoInstallOnStart && !skipDeps) {
    await runBootstrapInstallDeps(process.argv.slice(2), { config });
    const postDeps = await getDependencyHealth(config, { includeHarmony: includeHarmonyForConfig, fresh: true });
    const postDoctor = await runDoctor(config);
    log("info", {
      event: "runtime.env.check.post-install",
      details: {
        status: postDoctor.status,
        dependencies: postDeps,
        androidRuntime: (postDoctor.checks as Record<string, unknown> | undefined)?.androidRuntime,
        iosRuntime: (postDoctor.checks as Record<string, unknown> | undefined)?.iosRuntime,
        javaRuntime: (postDoctor.checks as Record<string, unknown> | undefined)?.javaRuntime
      }
    });
  }
  const skipSetup = options?.skipSetup === true;
  const secret = await loadSecret(config.bootstrapUI.secretsProvider);
  if (!secret && config.agent.setupOnFirstRun && !localDev && !skipSetup) {
    await runSetupFlow();
  }
  const effectiveSecret = await loadSecret(config.bootstrapUI.secretsProvider);
  if (!effectiveSecret && !localDev) {
    if (skipSetup) {
      throw new Error(
        "尚未完成引导配置（无本地凭据）。请在 GUI 点击「引导配置」，或执行 ada-agent-win.exe core --action=setup --mode=gui"
      );
    }
    throw new Error("No credentials found. Run `npm run setup`.");
  }
  if (effectiveSecret) {
    log("info", {
      event: "agent.auth.ready",
      details: {
        serverUrl: effectiveSecret.serverUrl,
        tenant: effectiveSecret.tenant,
        environment: effectiveSecret.environment,
        authType: effectiveSecret.authType,
        token: maskToken(effectiveSecret.token)
      }
    });
    if (isDeviceAutoScanEnabled(config, "start")) {
      try {
        const { registry, file } = await scanAndPersistDevices(config, { applyEnv: true });
        log("info", {
          event: "devices.scan.on_start",
          details: {
            file,
            count: registry.devices.length,
            defaults: registry.defaults
          }
        });
      } catch (error) {
        log("warn", {
          event: "devices.scan.on_start.failed",
          details: { reason: error instanceof Error ? error.message : String(error) }
        });
      }
    } else {
      const existing = await loadDeviceRegistry();
      if (existing) {
        const { applyDeviceRegistryToEnv } = await import("@ada/runtime-probe");
        applyDeviceRegistryToEnv(existing);
      }
    }
  }
  const runtimeTransport = await createRuntimeTransport(config, effectiveSecret);
  try {
    if (options?.runOnce) {
      const count = await processQueueOnce(config, { transport: runtimeTransport });
      log("info", { event: "queue.once.completed", details: { filesProcessed: count } });
      return;
    }
    if (options?.runWatch) {
      let stopRequested = false;
      const onStop = () => {
        stopRequested = true;
        log("warn", { event: "agent.stop.requested" });
      };
      process.on("SIGINT", onStop);
      process.on("SIGTERM", onStop);
      await runForegroundLoop(true, { transport: runtimeTransport, config });
      await watchQueue(config, () => stopRequested, { transport: runtimeTransport, config });
      return;
    }
    await runForegroundLoop(false, { transport: runtimeTransport, config });
  } finally {
    await runtimeTransport?.close();
  }
}

export async function runDemoFlow(): Promise<void> {
  const config = await loadConfig();
  const secret = await loadSecret(config.bootstrapUI.secretsProvider);
  const runtimeTransport = await createRuntimeTransport(config, secret);
  try {
    await runDemoTaskset({ transport: runtimeTransport, config });
  } finally {
    await runtimeTransport?.close();
  }
}

export async function runTaskFileFlow(file: string, options?: { requireReal?: boolean; verifyArtifacts?: boolean }): Promise<number> {
  const config = await loadConfig();
  const tasks = await loadTaskFile(file);
  const secret = await loadSecret(config.bootstrapUI.secretsProvider);
  const runtimeTransport = await createRuntimeTransport(config, secret);
  let results: CommandResult[] = [];
  try {
    results = await runTaskset(tasks, { transport: runtimeTransport, config });
  } finally {
    await runtimeTransport?.close();
  }
  if (options?.requireReal) {
    const needsHarmony = hasPlatformTask(tasks, "harmony");
    const deps = await getDependencyHealth(config, { includeHarmony: needsHarmony, fresh: true });
    const runtime = await probeRuntimesForTasks(tasks, config);
    const needsJava = hasPlatformTask(tasks, "android");
    const javaOk = needsJava ? (await checkJavaRuntime()).ok : true;
    const failureSummary = classifyRequireRealFailures(tasks, results, deps, runtime, javaOk);
    const hasFailures =
      ((failureSummary.dependencyMissing as string[]).length ?? 0) > 0 ||
      Boolean(failureSummary.browserNotLaunchable) ||
      Boolean(failureSummary.mobileRuntimeUnready) ||
      Boolean(failureSummary.harmonyHdcUnready) ||
      (Number(failureSummary.mockFallbackCount) ?? 0) > 0 ||
      (Number(failureSummary.executionFailureCount) ?? 0) > 0;
    if (hasFailures) {
      throw new Error(
        `require-real check failed: ${JSON.stringify({ failureType: "REQUIRE_REAL_VALIDATION_FAILED", summary: failureSummary }, null, 2)}`
      );
    }
  }
  if (options?.verifyArtifacts) {
    const screenshotTasks = tasks.filter((t) => t.command === "screenshot");
    const missing: string[] = [];
    for (const task of screenshotTasks) {
      const expected = `artifacts/${task.requestId}.png`;
      try {
        await fs.access(expected);
      } catch {
        missing.push(expected);
      }
    }
    console.log(JSON.stringify({ verifyArtifacts: true, screenshotTasks: screenshotTasks.length, missingArtifacts: missing }, null, 2));
  }
  return results.length;
}
