import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TaskExecutor } from "@ada/core-kernel";
import type { CommandEnvelope, CommandResult, PluginManifest, WebEngine } from "@ada/contracts";
import { PluginHost, registerRuntimePlugins } from "@ada/plugin-host";

function ensureBundledPluginDir(): void {
  if (process.env.ADA_PLUGIN_DIR?.trim()) {
    return;
  }
  const candidates: string[] = [];
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.join(here, "..", "plugins"));
  } catch {
    // bundled cjs
  }
  const dirname = (globalThis as { __dirname?: string }).__dirname;
  if (typeof dirname === "string") {
    candidates.push(path.join(dirname, "..", "plugins"));
  }
  for (const dir of candidates) {
    if (existsSync(dir)) {
      process.env.ADA_PLUGIN_DIR = dir;
      return;
    }
  }
}

function buildPluginHost(): PluginHost {
  ensureBundledPluginDir();
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

export function listActiveSessions(): Array<{
  platform: string;
  sessionId: string;
  engine?: WebEngine;
  driverSessionId: string;
}> {
  return sharedExecutor.listSessions();
}

export async function closeSession(
  platform: CommandEnvelope["platform"],
  sessionId: string,
  options?: { engine?: WebEngine; payload?: Record<string, unknown> }
): Promise<boolean> {
  return sharedExecutor.closeSession(platform, sessionId, options);
}

export async function closeAllSessions(): Promise<number> {
  return sharedExecutor.closeAllSessions();
}
