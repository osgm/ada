import path from "node:path";
import type { AppProfilesMap, MobileTarget, ResolveMobileTargetOptions } from "./mobile-target.js";
import { resolveMobileTarget } from "./mobile-target.js";
import { loadAppProfilesAuto, loadAppProfilesFromYamlFile } from "./profiles-file.js";

export interface ResolveE2eTargetOptions extends ResolveMobileTargetOptions {
  cwd?: string;
  /** 尝试读取 config/default.yaml 的 appProfiles 段 */
  loadDefaultConfig?: boolean;
  defaultConfigPath?: string;
}

async function loadAppProfilesFromDefaultYaml(configPath: string): Promise<AppProfilesMap> {
  try {
    return await loadAppProfilesFromYamlFile(configPath);
  } catch {
    return {};
  }
}

/**
 * 统一解析 E2E 被测目标：env + 可选 default.yaml + profile 文件 + overrides
 */
export async function resolveE2eTarget(options: ResolveE2eTargetOptions = {}): Promise<MobileTarget> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  let profiles: AppProfilesMap = { ...(options.profiles ?? {}) };

  if (options.loadDefaultConfig !== false) {
    const configPath = options.defaultConfigPath ?? path.join(cwd, "config", "default.yaml");
    const fromDefault = await loadAppProfilesFromDefaultYaml(configPath);
    profiles = { ...fromDefault, ...profiles };
  }

  const profilesFile =
    options.profileName && !env.ADA_APP_PROFILES_FILE
      ? undefined
      : env.ADA_APP_PROFILES_FILE?.trim() ||
        (env.ADA_APP_PROFILE?.trim() ? path.join(cwd, "config", "app-profiles.example.json") : "");

  if (profilesFile && !Object.keys(profiles).length) {
    const fromFile = await loadAppProfilesAuto(profilesFile).catch(() => ({}));
    profiles = { ...profiles, ...fromFile };
  } else if (profilesFile) {
    const fromFile = await loadAppProfilesAuto(profilesFile).catch(() => ({}));
    profiles = { ...fromFile, ...profiles };
  }

  return resolveMobileTarget({
    env,
    profiles,
    profileName: options.profileName ?? env.ADA_APP_PROFILE,
    overrides: options.overrides
  });
}
