import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { deepMerge, resolveWorkspaceRoot as resolveWorkspaceRootByCoreRuntime } from "@ada/core-runtime";
import {
  ensureGlobalAdaHome,
  legacyAdaAgentDataCandidates,
  resolveAgentEffectiveConfigPathSync
} from "@ada/install-deps";
import { bundledDefaultConfigYaml } from "./bundled-config.generated.js";

const DEFAULT_CONFIG_RELATIVE = "config/default.yaml";

export async function resolveWorkspaceRoot(startDir = process.cwd()): Promise<string> {
  return resolveWorkspaceRootByCoreRuntime(DEFAULT_CONFIG_RELATIVE, startDir);
}

export async function loadAgentConfig(cwd = process.cwd()): Promise<Record<string, unknown>> {
  let root = await resolveWorkspaceRoot(cwd);
  const defaultPath = path.join(root, DEFAULT_CONFIG_RELATIVE);
  let defaultRaw: string;
  try {
    defaultRaw = await fs.readFile(defaultPath, "utf8");
  } catch {
    defaultRaw = bundledDefaultConfigYaml;
    root = process.execPath.replace(/[/\\][^/\\]+$/, "");
  }
  const defaultConfig = (yaml.load(defaultRaw) as Record<string, unknown>) ?? {};

  const primary = resolveAgentEffectiveConfigPathSync();
  try {
    const effectiveFile = await fs.readFile(primary, "utf8");
    const effectiveConfig = (yaml.load(effectiveFile) as Record<string, unknown>) ?? {};
    return deepMerge(defaultConfig, effectiveConfig);
  } catch {
    for (const legacy of await legacyAdaAgentDataCandidates("agent.config.yaml")) {
      try {
        const effectiveFile = await fs.readFile(legacy, "utf8");
        const effectiveConfig = (yaml.load(effectiveFile) as Record<string, unknown>) ?? {};
        await ensureGlobalAdaHome();
        await fs.writeFile(primary, effectiveFile, "utf8");
        return deepMerge(defaultConfig, effectiveConfig);
      } catch {
        // try next legacy path
      }
    }
    return defaultConfig;
  }
}
