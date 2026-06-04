import type { DeviceRegistry, MobilePlatform, ScannedMobileDevice } from "./device-types.js";
import { formatDeviceName } from "./device-display.js";

export type DeviceMobileActionParams = {
  platform: MobilePlatform;
  sessionId: string;
  payload: {
    real: true;
    keepSession: true;
    capabilities: Record<string, string>;
  };
};

export type DeviceParamGuideEntry = {
  platform: MobilePlatform;
  deviceId: string;
  deviceName: string;
  isDefault: boolean;
  authorized: boolean;
  /** 复制到 ada_mobile_action 的参数字段 */
  adaMobileAction: DeviceMobileActionParams;
  /** 给大模型的一句话说明 */
  usage: string;
};

/** 鸿蒙 launchApp 模板（供 LLM 直接复制到 ada_mobile_action） */
export type HarmonyLaunchAppTemplate = {
  note: string;
  defaultAbilityId: string;
  tool: "ada_mobile_action";
  args: {
    platform: "harmony";
    command: "launchApp";
    sessionId: string;
    riskApproved: true;
    payload: {
      appId: string;
      abilityId: string;
      real: true;
      keepSession: true;
      capabilities: Record<string, string>;
    };
  };
};

export type DeviceParamsGuide = {
  /** 优先使用的设备（默认真机 / 唯一在线） */
  recommended?: DeviceParamGuideEntry;
  /** 各平台可用设备 */
  byPlatform: Partial<Record<MobilePlatform, DeviceParamGuideEntry[]>>;
  /** 鸿蒙启动 App 参数说明（有鸿蒙设备在线时出现） */
  harmonyLaunchApp?: HarmonyLaunchAppTemplate;
  /** 操作前必读 */
  rules: string[];
};

export const HARMONY_DEFAULT_ABILITY_ID = "EntryAbility";

function capabilitiesForDevice(device: ScannedMobileDevice): Record<string, string> {
  if (device.platform === "android") {
    return { udid: device.id };
  }
  if (device.platform === "ios") {
    return { udid: device.id };
  }
  return { deviceSn: device.id };
}

function sessionIdFor(device: ScannedMobileDevice): string {
  const slug = device.id.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 24);
  return `ada-${device.platform}-${slug}`;
}

function buildEntry(device: ScannedMobileDevice, defaults?: DeviceRegistry["defaults"]): DeviceParamGuideEntry {
  const defaultId =
    device.platform === "android"
      ? defaults?.android
      : device.platform === "ios"
        ? defaults?.ios
        : defaults?.harmony;
  const isDefault = Boolean(defaultId && defaultId === device.id);
  const caps = capabilitiesForDevice(device);
  const adaMobileAction: DeviceMobileActionParams = {
    platform: device.platform,
    sessionId: sessionIdFor(device),
    payload: {
      real: true,
      keepSession: true,
      capabilities: caps
    }
  };
  const capHint =
    device.platform === "android"
      ? `payload.capabilities.udid="${device.id}"`
      : device.platform === "ios"
        ? `payload.capabilities.udid="${device.id}"`
        : `payload.capabilities.deviceSn="${device.id}"`;
  return {
    platform: device.platform,
    deviceId: device.id,
    deviceName: formatDeviceName(device),
    isDefault,
    authorized: device.authorized,
    adaMobileAction,
    usage: `ada_mobile_action: platform="${device.platform}", ${capHint}, sessionId="${adaMobileAction.sessionId}" (reuse across steps)`
  };
}

function pickByPlatformPriority(entries: DeviceParamGuideEntry[]): DeviceParamGuideEntry | undefined {
  return (
    entries.find((e) => e.platform === "android") ??
    entries.find((e) => e.platform === "ios") ??
    entries.find((e) => e.platform === "harmony") ??
    entries[0]
  );
}

function resolveHarmonyAppId(): string {
  const fromEnv = typeof process !== "undefined" ? process.env.ADA_HARMONY_APP_ID?.trim() : "";
  return fromEnv || "com.example.harmony.app";
}

function resolveHarmonyAbilityId(): string {
  const fromEnv = typeof process !== "undefined" ? process.env.ADA_HARMONY_ABILITY_ID?.trim() : "";
  return fromEnv || HARMONY_DEFAULT_ABILITY_ID;
}

function buildHarmonyLaunchAppTemplate(entry: DeviceParamGuideEntry): HarmonyLaunchAppTemplate {
  const appId = resolveHarmonyAppId();
  const abilityId = resolveHarmonyAbilityId();
  const caps = entry.adaMobileAction.payload.capabilities;
  return {
    note:
      "Harmony launchApp needs payload.appId (bundle name) AND payload.abilityId (UI Ability, not optional for most apps). " +
      `Default abilityId=${HARMONY_DEFAULT_ABILITY_ID}. Override via ADA_HARMONY_APP_ID / ADA_HARMONY_ABILITY_ID env on MCP server.`,
    defaultAbilityId: HARMONY_DEFAULT_ABILITY_ID,
    tool: "ada_mobile_action",
    args: {
      platform: "harmony",
      command: "launchApp",
      sessionId: entry.adaMobileAction.sessionId,
      riskApproved: true,
      payload: {
        appId,
        abilityId,
        real: true,
        keepSession: true,
        capabilities: caps
      }
    }
  };
}

function pickRecommended(entries: DeviceParamGuideEntry[]): DeviceParamGuideEntry | undefined {
  const authorized = entries.filter((e) => e.authorized);
  if (!authorized.length) return undefined;
  const defaulted = authorized.filter((e) => e.isDefault);
  if (defaulted.length === 1) return defaulted[0];
  if (defaulted.length > 1) return pickByPlatformPriority(defaulted);
  return pickByPlatformPriority(authorized);
}

/** 从 registry 生成大模型可直接选用的设备参数指南 */
export function buildDeviceParamsGuide(registry: DeviceRegistry | null): DeviceParamsGuide {
  const devices = (registry?.devices ?? []).filter((d) => d.authorized);
  const entries = devices.map((d) => buildEntry(d, registry?.defaults));
  const byPlatform: DeviceParamsGuide["byPlatform"] = {};
  for (const e of entries) {
    const list = byPlatform[e.platform] ?? [];
    list.push(e);
    byPlatform[e.platform] = list;
  }
  const recommended = pickRecommended(entries);
  const hasHarmony = entries.some((e) => e.platform === "harmony");
  const harmonyEntry = entries.find((e) => e.platform === "harmony");
  const rules = [
    "Call ada_devices (default action=scan) before first mobile_action; reuse the same sessionId for the whole flow.",
    "Always set platform to match the physical device (android|ios|harmony). Do not use harmony when only Android is connected.",
    "Copy capabilities from recommended.adaMobileAction.payload; launchApp needs riskApproved=true.",
    "If multiple devices exist, prefer entry with isDefault=true unless user names a specific deviceId."
  ];
  if (hasHarmony) {
    rules.push(
      `Harmony launchApp: set payload.appId (bundle) + payload.abilityId (e.g. ${HARMONY_DEFAULT_ABILITY_ID}). ` +
        "Android-style package-only launch is NOT enough — copy deviceParams.harmonyLaunchApp.args when unsure."
    );
  }
  if (!entries.length) {
    rules.push("No authorized device online: connect USB, run adb devices / hdc list targets, then ada_devices scan again.");
  } else if (recommended) {
    rules.push(`For this session prefer: platform="${recommended.platform}", ${recommended.usage.split(": ")[1] ?? recommended.deviceId}`);
  }
  const harmonyLaunchApp =
    harmonyEntry && hasHarmony ? buildHarmonyLaunchAppTemplate(harmonyEntry) : undefined;
  return { recommended, byPlatform, harmonyLaunchApp, rules };
}
