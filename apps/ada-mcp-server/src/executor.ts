import type { CommandEnvelope, CommandResult, PluginManifest, WebEngine } from "@ada/contracts";
import {
  getSharedTaskExecutor,
  listBuiltInPluginManifests as listAgentPluginManifests,
  peekSharedRuntime,
  resetSharedRuntime
} from "@ada/agent-core/shared-runtime";
import {
  loadDeviceRegistryDefaults,
  mergeMobileSessionPayload,
  normalizeCommandEnvelope
} from "@ada/driver-rpc";

/** 递增后正在进行的 closeAllSessions 应尽快中止 */
let shutdownGeneration = 0;
let activeShutdown: Promise<number> | null = null;
let deviceDefaultsPromise: ReturnType<typeof loadDeviceRegistryDefaults> | null = null;

export function listBuiltInPluginManifests(): PluginManifest[] {
  return listAgentPluginManifests();
}

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
  return getSharedTaskExecutor().execute(await enrichCommand(normalized));
}

export function listActiveSessions(): Array<{
  platform: string;
  sessionId: string;
  engine?: WebEngine;
  driverSessionId: string;
}> {
  return getSharedTaskExecutor().listSessions();
}

export async function closeSession(
  platform: CommandEnvelope["platform"],
  sessionId: string,
  options?: { engine?: WebEngine; payload?: Record<string, unknown> }
): Promise<boolean> {
  return getSharedTaskExecutor().closeSession(platform, sessionId, options);
}

export async function closeAllSessions(): Promise<number> {
  return getSharedTaskExecutor().closeAllSessions();
}

function clearSharedRuntimeLocal(): void {
  deviceDefaultsPromise = null;
  resetSharedRuntime();
}

/** 关闭全部会话并 dispose 插件，供一次性 E2E 脚本在退出前调用 */
export async function shutdownExecutor(options?: {
  timeoutMs?: number;
  /** 立即 forceDispose，不等待优雅 close */
  force?: boolean;
}): Promise<number> {
  const peeked = peekSharedRuntime();
  if (!peeked.host && !peeked.executor) {
    return 0;
  }

  if (options?.force) {
    shutdownGeneration += 1;
    const host = peeked.host;
    clearSharedRuntimeLocal();
    activeShutdown = null;
    await host?.disposeAll(0, true);
    return 0;
  }

  if (activeShutdown) {
    return activeShutdown;
  }

  const generation = shutdownGeneration;
  const host = peeked.host;
  const exec = peeked.executor;
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
      if (generation === shutdownGeneration) {
        if (host) {
          await host.disposeAll(0, true);
        }
        clearSharedRuntimeLocal();
      }
      activeShutdown = null;
    }
    return closed;
  })();

  return activeShutdown;
}
