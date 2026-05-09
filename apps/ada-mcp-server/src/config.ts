import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { deepMerge, isObject, resolveWorkspaceRoot as resolveWorkspaceRootByCoreRuntime } from "@ada/core-runtime";
import { bundledDefaultConfigYaml } from "./bundled-config.generated.js";

const DEFAULT_CONFIG_RELATIVE = path.join("config", "default.yaml");
const LOCAL_DATA_DIR = path.join(".ada-agent");
const EFFECTIVE_CONFIG_FILE = path.join(LOCAL_DATA_DIR, "agent.config.yaml");

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
    root = path.dirname(process.execPath);
  }
  const defaultConfig = (yaml.load(defaultRaw) as Record<string, unknown>) ?? {};

  const effectivePath = path.join(root, EFFECTIVE_CONFIG_FILE);
  try {
    const effectiveFile = await fs.readFile(effectivePath, "utf8");
    const effectiveConfig = (yaml.load(effectiveFile) as Record<string, unknown>) ?? {};
    return deepMerge(defaultConfig, effectiveConfig);
  } catch {
    return defaultConfig;
  }
}
