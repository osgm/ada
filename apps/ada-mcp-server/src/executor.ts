import { TaskExecutor } from "@ada/core-kernel";
import type { CommandEnvelope, CommandResult, PluginManifest } from "@ada/contracts";
import { PluginHost, registerRuntimePlugins } from "@ada/plugin-host";

function buildPluginHost(): PluginHost {
  const host = new PluginHost();
  registerRuntimePlugins(host);
  return host;
}

const manifests: PluginManifest[] = registerRuntimePlugins(new PluginHost());
const sharedExecutor = new TaskExecutor(buildPluginHost());

export function listBuiltInPluginManifests(): PluginManifest[] {
  return manifests;
}

export async function runCommand(command: CommandEnvelope): Promise<CommandResult> {
  return sharedExecutor.execute(command);
}

export async function runTaskset(commands: CommandEnvelope[]): Promise<CommandResult[]> {
  const results: CommandResult[] = [];
  for (const command of commands) {
    results.push(await sharedExecutor.execute(command));
  }
  return results;
}

export function listActiveSessions(): Array<{ platform: string; sessionId: string; driverSessionId: string }> {
  return sharedExecutor.listSessions();
}

export async function closeSession(platform: CommandEnvelope["platform"], sessionId: string): Promise<boolean> {
  return sharedExecutor.closeSession(platform, sessionId);
}

export async function closeAllSessions(): Promise<number> {
  return sharedExecutor.closeAllSessions();
}
