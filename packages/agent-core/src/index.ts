import { loadConfig, maskToken } from "@ada/agent/config";
import { loadSecret } from "@ada/agent/secrets";
import {
  ensureDriverDependencies,
  getDependencyHealth,
  type InstallScope,
  type InstallSummary
} from "@ada/agent/dependency-installer";
import { runDoctor } from "@ada/agent/doctor";
import { listBuiltInPluginManifests } from "@ada/agent/plugin-registry";
import { runSetupCli } from "@ada/agent/setup-cli";
import { runSetupNative } from "@ada/agent/setup-native";
import { runSetupUi } from "@ada/agent/bootstrap-ui";
import { patchRemoteCredentials, persistAgentSetup } from "@ada/agent/setup-state";
import { createRuntimeTransport } from "@ada/agent/transport-client";
import { processQueueOnce, watchQueue } from "@ada/agent/queue-runner";
import { runDemoTaskset, runForegroundLoop, runTaskset } from "@ada/agent/runtime";
import { loadTaskFile } from "@ada/agent/task-loader";
import { log } from "@ada/agent/logger";
import type { AgentConfig, BootstrapInput, SetupMode } from "@ada/agent/types";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import fs from "node:fs/promises";

export async function getHealthSnapshot(): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  const secret = await loadSecret(config.bootstrapUI.secretsProvider);
  const deps = await getDependencyHealth(config);
  return {
    status: "ok",
    setupConfigured: Boolean(secret),
    transport: config.transport,
    graphics: config.graphics,
    monitoring: config.monitoring,
    plugins: listBuiltInPluginManifests().map((m) => ({
      id: m.id,
      platforms: m.platforms,
      engine: m.engine
    })),
    dependencies: deps
  };
}

export async function getDoctorSnapshot(): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  return (await runDoctor(config)) as Record<string, unknown>;
}

export function getBuiltInPlugins() {
  return listBuiltInPluginManifests().map((m) => ({
    id: m.id,
    platforms: m.platforms,
    engine: m.engine
  }));
}

export type InstallDependencyExtras = {
  playwrightInstallTargetsOverride?: string[];
  appiumRequiredDriversOverride?: string[];
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

function classifyExecutionFailure(errorCode: string): "environment" | "locator" | "assertion" | "driver" | "unknown" {
  if (
    errorCode === "APPIUM_SESSION_CREATE_FAILED" ||
    errorCode === "APPIUM_PROBE_FAILED" ||
    errorCode === "APPIUM_CLICK_FAILED" ||
    errorCode === "APPIUM_SWIPE_FAILED" ||
    errorCode === "APPIUM_TYPE_FAILED" ||
    errorCode === "APPIUM_SCREENSHOT_FAILED"
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
  appiumCliNotReady: boolean;
  appiumServerUnreachable: boolean;
  executionFailureTypes: Array<"environment" | "locator" | "assertion" | "driver" | "unknown">;
}): string[] {
  const hints: string[] = [];
  if (input.dependencyMissing.length > 0) hints.push("运行 `./ada-agent install-deps` 补齐依赖");
  if (input.browserNotLaunchable) hints.push("执行 `./ada-agent doctor` 检查 Playwright 后重试安装浏览器");
  if (input.appiumCliNotReady) hints.push("重新安装 Appium 后用 `tasks/appium-probe.tasks.json` 验证");
  if (input.appiumServerUnreachable) hints.push("先启动 Appium Server 并确认 `appium.serverUrl` 正确");
  if (input.executionFailureTypes.includes("locator")) hints.push("定位失败：检查 locator/elementId 是否正确");
  if (input.executionFailureTypes.includes("assertion")) hints.push("断言失败：先加截图确认页面状态");
  if (input.executionFailureTypes.includes("driver")) hints.push("驱动失败：检查 command 是否被当前平台支持");
  if (input.executionFailureTypes.includes("environment")) hints.push("环境失败：检查设备连接与浏览器/Appium运行状态");
  if (input.executionFailureTypes.includes("unknown")) hints.push("未知失败：结合日志与 executionFailures 继续定位");
  return hints;
}

function classifyRequireRealFailures(
  tasks: CommandEnvelope[],
  results: CommandResult[],
  deps: Awaited<ReturnType<typeof getDependencyHealth>>,
  doctor: Awaited<ReturnType<typeof runDoctor>>
): Record<string, unknown> {
  const hasWebTask = hasPlatformTask(tasks, "web");
  const hasMobileTask = hasPlatformTask(tasks, "android") || hasPlatformTask(tasks, "ios") || hasPlatformTask(tasks, "harmony");
  const dependencyMissing: string[] = [];
  if (hasWebTask && !deps.playwrightInstalled) dependencyMissing.push("playwright");
  if (hasMobileTask && !deps.appiumInstalled) dependencyMissing.push("appium");
  const browserNotLaunchable = hasWebTask && deps.playwrightInstalled && !deps.playwrightLaunchOk;
  const appiumCliNotReady = hasMobileTask && deps.appiumInstalled && !deps.appiumCliOk;
  const appiumServerReachable = Boolean(
    (doctor.checks as Record<string, unknown> | undefined)?.appiumServer &&
      ((doctor.checks as Record<string, unknown>).appiumServer as Record<string, unknown>).reachable
  );
  const appiumServerUnreachable = hasMobileTask && !appiumServerReachable;
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
    appiumCliNotReady,
    appiumServerUnreachable,
    mockFallbackCount: mockFallbacks.length,
    executionFailureCount: executionFailures.length,
    executionFailureTypes,
    mockFallbacks,
    executionFailures,
    remediationHints: buildRemediationHints({
      dependencyMissing,
      browserNotLaunchable,
      appiumCliNotReady,
      appiumServerUnreachable,
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
  const preDeps = await getDependencyHealth(config);
  const preDoctor = await runDoctor(config);
  log("info", {
    event: "runtime.env.check.preflight",
    details: {
      status: preDoctor.status,
      dependencies: preDeps,
      appiumServer: (preDoctor.checks as Record<string, unknown> | undefined)?.appiumServer,
      javaRuntime: (preDoctor.checks as Record<string, unknown> | undefined)?.javaRuntime
    }
  });
  if (config.dependencies.autoInstallOnStart && !skipDeps) {
    await ensureDriverDependencies(config);
    const postDeps = await getDependencyHealth(config);
    const postDoctor = await runDoctor(config);
    log("info", {
      event: "runtime.env.check.post-install",
      details: {
        status: postDoctor.status,
        dependencies: postDeps,
        appiumServer: (postDoctor.checks as Record<string, unknown> | undefined)?.appiumServer,
        javaRuntime: (postDoctor.checks as Record<string, unknown> | undefined)?.javaRuntime
      }
    });
  }
  const secret = await loadSecret(config.bootstrapUI.secretsProvider);
  if (!secret && config.agent.setupOnFirstRun && !localDev) {
    await runSetupFlow();
  }
  const effectiveSecret = await loadSecret(config.bootstrapUI.secretsProvider);
  if (!effectiveSecret && !localDev) throw new Error("No credentials found. Run `npm run setup`.");
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
    const deps = await getDependencyHealth(config);
    const doctor = await runDoctor(config);
    const failureSummary = classifyRequireRealFailures(tasks, results, deps, doctor);
    const hasFailures =
      ((failureSummary.dependencyMissing as string[]).length ?? 0) > 0 ||
      Boolean(failureSummary.browserNotLaunchable) ||
      Boolean(failureSummary.appiumCliNotReady) ||
      Boolean(failureSummary.appiumServerUnreachable) ||
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
