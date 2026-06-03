/**
 * 通用移动/Web 测试目标（AppId、URL 等）— 无内置业务 profile。
 * 优先级：显式 overrides > 命名 profile 文件 > 环境变量。
 */

export interface MobileTarget {
  web?: { url?: string };
  android?: { appId?: string };
  harmony?: { appId?: string; abilityId?: string };
  ios?: { bundleId?: string };
}

export type AppProfilesMap = Record<string, MobileTarget>;

export function mergeMobileTarget(base: MobileTarget = {}, overrides: MobileTarget = {}): MobileTarget {
  return {
    web: { ...base.web, ...overrides.web },
    android: { ...base.android, ...overrides.android },
    harmony: { ...base.harmony, ...overrides.harmony },
    ios: { ...base.ios, ...overrides.ios }
  };
}

export function resolveNamedProfile(profiles: AppProfilesMap, name: string): MobileTarget {
  if (!name?.trim()) return {};
  return profiles[name.trim()] ?? {};
}

/** 从环境变量解析（npm 消费者无需仓库内 config 文件） */
export function mobileTargetFromEnv(env: NodeJS.ProcessEnv = process.env): MobileTarget {
  return {
    web: env.ADA_WEB_URL?.trim() ? { url: env.ADA_WEB_URL.trim() } : undefined,
    android: env.ADA_ANDROID_APP_ID?.trim() ? { appId: env.ADA_ANDROID_APP_ID.trim() } : undefined,
    harmony: (() => {
      const appId = (env.ADA_HARMONY_APP_ID ?? env.ADA_MOBILE_APP_ID)?.trim();
      const abilityId = env.ADA_HARMONY_ABILITY_ID?.trim();
      if (!appId && !abilityId) return undefined;
      return { ...(appId ? { appId } : {}), ...(abilityId ? { abilityId } : {}) };
    })(),
    ios: env.ADA_IOS_BUNDLE_ID?.trim() ? { bundleId: env.ADA_IOS_BUNDLE_ID.trim() } : undefined
  };
}

export interface ResolveMobileTargetOptions {
  env?: NodeJS.ProcessEnv;
  /** config 内 appProfiles 段或独立 JSON 文件内容 */
  profiles?: AppProfilesMap;
  profileName?: string;
  overrides?: MobileTarget;
}

export function resolveMobileTarget(options: ResolveMobileTargetOptions = {}): MobileTarget {
  const env = options.env ?? process.env;
  const fromEnv = mobileTargetFromEnv(env);
  const name = options.profileName?.trim() || env.ADA_APP_PROFILE?.trim() || "";
  const fromProfile = name && options.profiles ? resolveNamedProfile(options.profiles, name) : {};
  return mergeMobileTarget(mergeMobileTarget(fromEnv, fromProfile), options.overrides ?? {});
}
