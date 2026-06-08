import yaml from "js-yaml";
import { readEffectiveAgentConfigYaml } from "./agent-effective-config.js";
import { DEFAULT_INSTALL_DEPS_CONFIG } from "./default-install-deps-config.js";
import type { InstallDepsConfig, InstallDepsDependenciesConfig } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function mergeDependencies(
  base: InstallDepsDependenciesConfig,
  override: Partial<InstallDepsDependenciesConfig> | undefined
): InstallDepsDependenciesConfig {
  if (!override) return base;
  return { ...base, ...override };
}

/** Load install-deps config from ~/.ada/agent.config.yaml (no ada-agent dependency). */
export async function loadInstallDepsConfig(): Promise<InstallDepsConfig> {
  const raw = await readEffectiveAgentConfigYaml("agent.config.yaml");
  if (!raw) {
    return DEFAULT_INSTALL_DEPS_CONFIG;
  }
  const parsed = yaml.load(raw) as Record<string, unknown> | null;
  const deps = asRecord(parsed?.dependencies) as Partial<InstallDepsDependenciesConfig>;
  return {
    dependencies: mergeDependencies(DEFAULT_INSTALL_DEPS_CONFIG.dependencies, deps)
  };
}
