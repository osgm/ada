import { TaskExecutor } from "@ada/core-kernel";
import type { CommandEnvelope, CommandResult, PluginManifest, WebEngine } from "@ada/contracts";
import { PluginHost, registerRuntimePlugins, resolvePackagePluginDir } from "@ada/plugin-host";

let sharedHost: PluginHost | null = null;
let sharedExecutor: TaskExecutor | null = null;

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

export async function runCommand(command: CommandEnvelope): Promise<CommandResult> {
  return getExecutor().execute(command);
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
