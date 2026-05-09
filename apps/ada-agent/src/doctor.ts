import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { URL } from "node:url";
import { spawn } from "node:child_process";
import type { AgentConfig } from "./types.js";
import { getDependencyHealth } from "./dependency-installer.js";
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

export async function runDoctor(config: AgentConfig): Promise<Record<string, unknown>> {
  const root = await resolveWorkspaceRoot(process.cwd());
  const queue = {
    inboxDir: path.resolve(root, config.queue.inboxDir),
    processedDir: path.resolve(root, config.queue.processedDir),
    failedDir: path.resolve(root, config.queue.failedDir)
  };

  const deps = await getDependencyHealth(config);
  const portFree = await isPortAvailable(config.bootstrapUI.host, config.bootstrapUI.port);
  const appiumConnectivity = await checkAppiumServer(config.appium.serverUrl);
  const javaRuntime = await checkJavaRuntime();
  const androidDriverEnabled = config.appium.requiredDrivers.map((item) => item.toLowerCase()).includes("uiautomator2");
  const queueDirs = {
    inbox: await dirExists(queue.inboxDir),
    processed: await dirExists(queue.processedDir),
    failed: await dirExists(queue.failedDir)
  };
  const nativeBootstrap = await checkNativeBootstrap(config, root);

  const checks = {
    dependencies: deps,
    setupPortAvailable: portFree,
    appiumServer: appiumConnectivity,
    javaRuntime,
    androidDriverEnabled,
    queueDirs,
    nativeBootstrap
  };

  const allOk =
    deps.playwrightInstalled &&
    deps.playwrightLaunchOk &&
    deps.appiumInstalled &&
    deps.appiumCliOk &&
    deps.appiumDriversOk &&
    appiumConnectivity.reachable &&
    (!androidDriverEnabled || javaRuntime.ok) &&
    queueDirs.inbox &&
    queueDirs.processed &&
    queueDirs.failed &&
    (!nativeBootstrap.enabled || nativeBootstrap.commandReachable);

  return {
    status: allOk ? "healthy" : "degraded",
    checks,
    pluginCount: listBuiltInPluginManifests().length,
    queue
  };
}

async function checkJavaRuntime(): Promise<{
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

async function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const checker = process.platform === "win32" ? "where" : "which";
    const child = spawn(checker, [command], {
      stdio: "ignore",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
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

async function checkAppiumServer(serverUrl: string): Promise<{
  serverUrl: string;
  reachable: boolean;
  detail: string;
}> {
  try {
    const parsed = new URL(serverUrl);
    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
    const host = parsed.hostname;
    const reachable = !(await isPortAvailable(host, port));
    return {
      serverUrl,
      reachable,
      detail: reachable ? "port is open (server likely running)" : "port is closed"
    };
  } catch (error) {
    return {
      serverUrl,
      reachable: false,
      detail: `invalid server url: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
