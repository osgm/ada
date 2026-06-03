import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AgentConfig } from "./types.js";
import { getDependencyHealth, probeHarmonyRuntime } from "@ada/install-deps";
import { commandExists, probeAndroidRuntime, probeIosRuntime, probeAndroidUia2Runtime, probeWdaStatus } from "@ada/runtime-probe";
import { listBuiltInPluginManifests } from "./plugin-registry.js";
import { resolveWorkspaceRoot } from "./config.js";

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function resolveDoctorPlatforms(config: AgentConfig): string[] {
  const raw = config.monitoring?.platforms ?? ["web"];
  const normalized = raw.map((item) => item.toLowerCase().trim()).filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : ["web"];
}

export type DoctorScope = "web" | "mobile" | "all";

function resolveScopedPlatforms(config: AgentConfig, scope?: DoctorScope): string[] {
  const platforms = resolveDoctorPlatforms(config);
  if (!scope || scope === "all") {
    return platforms;
  }
  if (scope === "web") {
    return platforms.includes("web") ? ["web"] : ["web"];
  }
  const mobile = platforms.filter((item) => item !== "web");
  return mobile.length > 0 ? mobile : ["android", "ios", "harmony"];
}

export async function runDoctor(
  config: AgentConfig,
  options?: { scope?: DoctorScope }
): Promise<Record<string, unknown>> {
  const root = await resolveWorkspaceRoot(process.cwd());
  const queue = {
    inboxDir: path.resolve(root, config.queue.inboxDir),
    processedDir: path.resolve(root, config.queue.processedDir),
    failedDir: path.resolve(root, config.queue.failedDir)
  };

  const platforms = resolveScopedPlatforms(config, options?.scope);
  const webEnabled = platforms.includes("web");
  const androidEnabled = platforms.includes("android");
  const iosEnabled = platforms.includes("ios");
  const harmonyEnabled = platforms.includes("harmony");

  const deps = await getDependencyHealth(config, { includeHarmony: harmonyEnabled, fresh: true });
  const harmonyDriverEnabled = harmonyEnabled;
  const harmonyProbe = harmonyEnabled ? await probeHarmonyRuntime(config) : null;
  const harmonyHdc = {
    enabled: harmonyDriverEnabled,
    toolsDir: deps.harmonyToolsDir,
    hdcReachable: deps.hdcReachable,
    targetsSummary: deps.hdcTargetsSummary,
    ok: !harmonyDriverEnabled || Boolean(harmonyProbe?.ready),
    detail: !harmonyDriverEnabled
      ? "harmony platform not in monitoring.platforms"
      : (harmonyProbe?.detail ?? "harmony probe skipped")
  };
  const portFree = await isPortAvailable(config.bootstrapUI.host, config.bootstrapUI.port);
  const androidProbe = androidEnabled
    ? await probeAndroidRuntime()
    : { adbOnPath: false, deviceConnected: false, detail: "android not in scope" };
  const androidUia2Probe = androidEnabled ? await probeAndroidUia2Runtime({ ensureForward: androidProbe.deviceConnected }) : null;
  const iosProbe = iosEnabled
    ? await probeIosRuntime()
    : {
        hostSupported: process.platform === "darwin",
        xcrunOk: false,
        wdaReachable: false,
        wdaUrl: process.env.ADA_WDA_SERVER_URL?.trim() || "http://127.0.0.1:8100",
        detail: "ios not in scope"
      };
  const wdaStatus = iosEnabled ? await probeWdaStatus(iosProbe.wdaUrl) : null;
  const javaRuntime =
    androidEnabled || harmonyEnabled
      ? await checkJavaRuntime()
      : {
          ok: true,
          javaCommandReachable: false,
          javaVersion: "",
          javaHomeConfigured: false,
          detail: "skipped (not in scope)"
        };
  const androidDriverEnabled = androidEnabled;
  const iosDriverEnabled = iosEnabled;
  const iosRuntimeOk = !iosEnabled || (iosProbe.hostSupported && iosProbe.xcrunOk && (wdaStatus?.ready ?? iosProbe.wdaReachable));
  const queueDirs = {
    inbox: await dirExists(queue.inboxDir),
    processed: await dirExists(queue.processedDir),
    failed: await dirExists(queue.failedDir)
  };
  const nativeBootstrap = await checkNativeBootstrap(config, root);

  const checks = {
    dependencies: deps,
    harmonyHdc,
    setupPortAvailable: portFree,
    androidRuntime: {
      required: androidEnabled,
      ok: !androidEnabled || (androidProbe.adbOnPath && androidProbe.deviceConnected),
      adbOnPath: androidProbe.adbOnPath,
      deviceConnected: androidProbe.deviceConnected,
      detail: !androidEnabled ? "android not in monitoring.platforms" : androidProbe.detail
    },
    androidUia2Runtime: {
      required: androidEnabled,
      ok: !androidEnabled || androidUia2Probe?.reachable === true,
      serverUrl: androidUia2Probe?.serverUrl ?? null,
      reachable: androidUia2Probe?.reachable ?? false,
      detail: !androidEnabled
        ? "android not in monitoring.platforms"
        : (androidUia2Probe?.detail ?? "UIA2 probe skipped")
    },
    iosRuntime: {
      required: iosEnabled,
      ok: iosRuntimeOk,
      wdaUrl: iosProbe.wdaUrl,
      wdaReachable: iosProbe.wdaReachable,
      wdaReady: wdaStatus?.ready ?? false,
      wdaBootstrapHint: "set ADA_IOS_WDA_BOOTSTRAP=true to xcodebuild WebDriverAgentRunner",
      detail: !iosEnabled ? "ios not in monitoring.platforms" : (wdaStatus?.detail ?? iosProbe.detail)
    },
    javaRuntime: {
      ...javaRuntime,
      required: androidEnabled
    },
    androidDriverEnabled,
    iosDriverEnabled,
    queueDirs,
    nativeBootstrap
  };

  const requirements: boolean[] = [
    queueDirs.inbox,
    queueDirs.processed,
    queueDirs.failed,
    !nativeBootstrap.enabled || nativeBootstrap.commandReachable
  ];
  if (webEnabled) {
    requirements.push(deps.playwrightInstalled, deps.playwrightLaunchOk);
  }
  if (androidEnabled) {
    requirements.push(androidProbe.adbOnPath && androidProbe.deviceConnected, javaRuntime.ok);
  }
  if (iosEnabled) {
    requirements.push(iosRuntimeOk);
  }
  if (harmonyEnabled) {
    requirements.push(harmonyHdc.ok);
  }

  const allOk = requirements.every(Boolean);

  return {
    status: allOk ? "healthy" : "degraded",
    platforms,
    checks,
    pluginCount: listBuiltInPluginManifests().length,
    queue
  };
}

export async function checkJavaRuntime(): Promise<{
  ok: boolean;
  javaCommandReachable: boolean;
  javaVersion: string;
  javaHomeConfigured: boolean;
  javaHomePath?: string;
  detail: string;
}> {
  const javaHomeRaw = process.env.JAVA_HOME;
  const javaHomeConfigured = typeof javaHomeRaw === "string" && javaHomeRaw.trim().length > 0;
  const javaHomePath = javaHomeConfigured ? javaHomeRaw?.trim() : undefined;
  const reachable = await commandExists("java");
  if (!reachable) {
    return {
      ok: false,
      javaCommandReachable: false,
      javaVersion: "",
      javaHomeConfigured,
      javaHomePath,
      detail: "java command not found in PATH"
    };
  }

  const version = await readJavaVersion();
  const ok = version.length > 0;
  return {
    ok,
    javaCommandReachable: true,
    javaVersion: version,
    javaHomeConfigured,
    javaHomePath,
    detail: ok ? "java runtime detected" : "java runtime detected but failed to read version"
  };
}

async function readJavaVersion(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("java", ["-version"], {
      stdio: ["ignore", "ignore", "pipe"],
      shell: process.platform === "win32"
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        resolve("");
        return;
      }
      const firstLine = stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      resolve(firstLine ?? "");
    });
    child.on("error", () => resolve(""));
  });
}

async function checkNativeBootstrap(
  config: AgentConfig,
  root: string
): Promise<{
  enabled: boolean;
  commandConfigured: boolean;
  commandReachable: boolean;
  detail: string;
  fallbackToWeb: boolean;
}> {
  const native = config.bootstrapUI.native;
  if (!native.enabled) {
    return {
      enabled: false,
      commandConfigured: Boolean(native.command),
      commandReachable: true,
      detail: "native bootstrap disabled",
      fallbackToWeb: native.fallbackToWeb
    };
  }
  if (!native.command) {
    return {
      enabled: true,
      commandConfigured: false,
      commandReachable: false,
      detail: "native bootstrap enabled but command is empty",
      fallbackToWeb: native.fallbackToWeb
    };
  }

  const hasPathHint =
    native.command.includes("/") || native.command.includes("\\") || native.command.startsWith(".");
  let reachable = false;
  if (hasPathHint) {
    const resolved = path.resolve(root, native.command);
    reachable = await fileExists(resolved);
  } else {
    reachable = await commandExists(native.command);
  }

  return {
    enabled: true,
    commandConfigured: true,
    commandReachable: reachable,
    detail: reachable ? "native command resolved" : "native command not found",
    fallbackToWeb: native.fallbackToWeb
  };
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

