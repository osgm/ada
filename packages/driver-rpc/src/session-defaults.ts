import fs from "node:fs/promises";
import path from "node:path";
import type { Platform } from "@ada/contracts";

export interface DeviceRegistryDefaults {
  android?: string;
  ios?: string;
  harmony?: string;
}

export interface MergePayloadOptions {
  cwd?: string;
  screen?: { width: number; height: number };
}

async function deviceRegistryPath(cwd: string): Promise<string> {
  return path.join(cwd, ".ada-agent", "devices.json");
}

export async function loadDeviceRegistryDefaults(cwd = process.cwd()): Promise<DeviceRegistryDefaults> {
  try {
    const raw = await fs.readFile(await deviceRegistryPath(cwd), "utf8");
    const reg = JSON.parse(raw) as { defaults?: DeviceRegistryDefaults };
    return reg.defaults ?? {};
  } catch {
    return {};
  }
}

export function mergeMobileSessionPayload(
  platform: Platform,
  payload: Record<string, unknown> | undefined,
  defaults: DeviceRegistryDefaults,
  options?: MergePayloadOptions
): Record<string, unknown> {
  const p = { ...(payload ?? {}) };
  const caps = { ...((p.capabilities as Record<string, unknown>) ?? {}) };

  if (platform === "android") {
    const udid =
      String(caps.udid ?? caps["ada:udid"] ?? p.udid ?? defaults.android ?? process.env.ADA_ANDROID_UDID ?? "").trim() ||
      undefined;
    if (udid) {
      caps.udid = udid;
      caps["ada:udid"] = udid;
    }
    if (!caps.platformName) caps.platformName = "Android";
    if (!caps.automationName) caps.automationName = "UiAutomator2";
  }

  if (platform === "harmony") {
    const sn =
      String(
        caps.deviceSn ?? caps.udid ?? caps["ada:udid"] ?? defaults.harmony ?? process.env.ADA_HARMONY_DEVICE_SN ?? ""
      ).trim() || undefined;
    if (sn) {
      caps.deviceSn = sn;
      caps.udid = sn;
      caps["ada:udid"] = sn;
    }
    if (!caps.platformName) caps.platformName = "harmonyos";
    if (!caps.automationName) caps.automationName = "harmonyos";
  }

  if (platform === "ios") {
    const udid =
      String(caps.udid ?? caps["ada:udid"] ?? defaults.ios ?? process.env.ADA_IOS_DEVICE_UDID ?? "").trim() || undefined;
    if (udid) {
      caps.udid = udid;
      caps["ada:udid"] = udid;
    }
  }

  p.capabilities = caps;
  if (options?.screen) {
    p.screenWidth = options.screen.width;
    p.screenHeight = options.screen.height;
  }
  return p;
}
