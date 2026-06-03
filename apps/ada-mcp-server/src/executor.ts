import { TaskExecutor } from "@ada/core-kernel";
import type { CommandEnvelope, CommandResult, PluginManifest, WebEngine } from "@ada/contracts";
import {
  loadDeviceRegistryDefaults,
  mergeMobileSessionPayload,
  normalizeCommandEnvelope
} from "@ada/driver-rpc";
import { PluginHost, registerRuntimePlugins, resolvePackagePluginDir } from "@ada/plugin-host";

let sharedHost: PluginHost | null = null;
let sharedExecutor: TaskExecutor | null = null;
/** 递增后正在进行的 closeAllSessions 应尽快中止 */
let shutdownGeneration = 0;
let activeShutdown: Promise<number> | null = null;

function getPluginHost(): PluginHost {
  if (sharedHost) {
    return sharedHost;
  }
  const bundledDir = resolvePackagePluginDir();
  const host = new PluginHost();
  registerRuntimePlugins(host, bundledDir ? { pluginDir: bundledDir } : undefined);
  sharedHost = host;
  return host;
}

function getExecutor(): TaskExecutor {
  if (!sharedExecutor) {
    sharedExecutor = new TaskExecutor(getPluginHost());
  }
  return sharedExecutor;
}

export function listBuiltInPluginManifests(): PluginManifest[] {
  return getPluginHost().listManifests();
}

let deviceDefaultsPromise: ReturnType<typeof loadDeviceRegistryDefaults> | null = null;

async function enrichCommand(command: CommandEnvelope): Promise<CommandEnvelope> {
  if (command.platform === "web") {
    return command;
  }
  if (!deviceDefaultsPromise) {
    deviceDefaultsPromise = loadDeviceRegistryDefaults(process.cwd());
  }
  const defaults = await deviceDefaultsPromise;
  const payload = command.payload ?? {};
  const screen =
    typeof payload.screenWidth === "number" && typeof payload.screenHeight === "number"
      ? { width: payload.screenWidth, height: payload.screenHeight }
      : undefined;
  return {
    ...command,
    payload: mergeMobileSessionPayload(command.platform, payload, defaults, { screen })
  };
}

export async function runCommand(command: CommandEnvelope): Promise<CommandResult> {
  const normalized = normalizeCommandEnvelope(command);
  return getExecutor().execute(await enrichCommand(normalized));
}

export async function runTaskset(commands: CommandEnvelope[]): Promise<CommandResult[]> {
  const results: CommandResult[] = [];
  for (const command of commands) {
    results.push(await runCommand(command));
  }
  return results;
}

export function listActiveSessions(): Array<{
  platform: string;
  sessionId: string;
  engine?: WebEngine;
  driverSessionId: string;
}> {
  return getExecutor().listSessions();
}

export async function closeSession(
  platform: CommandEnvelope["platform"],
  sessionId: string,
  options?: { engine?: WebEngine; payload?: Record<string, unknown> }
): Promise<boolean> {
  return getExecutor().closeSession(platform, sessionId, options);
}

export async function closeAllSessions(): Promise<number> {
  return getExecutor().closeAllSessions();
}

function clearSharedRuntime(): void {
  sharedExecutor = null;
  sharedHost = null;
  deviceDefaultsPromise = null;
}

/** 关闭全部会话并 dispose 插件，供一次性 E2E 脚本在退出前调用 */
export async function shutdownExecutor(options?: {
  timeoutMs?: number;
  /** 立即 forceDispose，不等待优雅 close */
  force?: boolean;
}): Promise<number> {
  if (options?.force) {
    shutdownGeneration += 1;
    const host = sharedHost;
    clearSharedRuntime();
    activeShutdown = null;
    await host?.disposeAll(0, true);
    return 0;
  }

  if (activeShutdown) {
    return activeShutdown;
  }

  if (!sharedHost && !sharedExecutor) {
    return 0;
  }

  const generation = shutdownGeneration;
  const host = sharedHost;
  const exec = sharedExecutor;
  const timeoutMs = options?.timeoutMs ?? 25_000;

  activeShutdown = (async () => {
    let closed = 0;
    try {
      await Promise.race([
        exec && generation === shutdownGeneration
          ? exec.closeAllSessions(() => generation !== shutdownGeneration)
          : Promise.resolve(0),
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error(`shutdownExecutor timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      ]).then((n) => {
        closed = n;
      });
    } catch {
      shutdownGeneration += 1;
    } finally {
      if (generation === shutdownGeneration && host) {
        await host.disposeAll(0, true);
      }
      if (generation === shutdownGeneration) {
        clearSharedRuntime();
      }
      activeShutdown = null;
    }
    return closed;
  })();

  return activeShutdown;
}
