import type { DeviceRegistry, MobilePlatform, ScannedMobileDevice } from "./device-types.js";

const PLATFORM_LABEL: Record<MobilePlatform, string> = {
  android: "Android",
  ios: "iOS",
  harmony: "HarmonyOS"
};

export interface DeviceListRow {
  deviceName: string;
  deviceId: string;
  resolution: string;
  systemCategory: string;
  sdkInfo: string;
  platform: MobilePlatform;
  authorized: boolean;
  connectionState: string;
  isDefault: boolean;
}

export function formatResolution(device: ScannedMobileDevice): string {
  if (device.screenWidth && device.screenHeight) {
    return `${device.screenWidth}×${device.screenHeight}`;
  }
  return "—";
}

export function formatSdkInfo(device: ScannedMobileDevice): string {
  const parts: string[] = [];
  if (device.sdkVersion) {
    if (device.platform === "android") {
      parts.push(`API ${device.sdkVersion}`);
    } else if (device.platform === "harmony") {
      parts.push(`API ${device.sdkVersion}`);
    } else {
      parts.push(`SDK ${device.sdkVersion}`);
    }
  }
  if (device.osVersion) {
    const osLabel =
      device.platform === "android"
        ? `Android ${device.osVersion}`
        : device.platform === "ios"
          ? `iOS ${device.osVersion}`
          : device.osVersion;
    parts.push(osLabel);
  }
  if (parts.length === 0) {
    if (!device.authorized) return "未授权";
    return "—";
  }
  return parts.join(" · ");
}

export function formatDeviceName(device: ScannedMobileDevice): string {
  return device.label?.trim() || device.model?.trim() || device.id;
}

export function deviceToListRow(
  device: ScannedMobileDevice,
  defaults?: DeviceRegistry["defaults"]
): DeviceListRow {
  const defaultId =
    device.platform === "android"
      ? defaults?.android
      : device.platform === "ios"
        ? defaults?.ios
        : defaults?.harmony;
  return {
    deviceName: formatDeviceName(device),
    deviceId: device.id,
    resolution: formatResolution(device),
    systemCategory: PLATFORM_LABEL[device.platform],
    sdkInfo: formatSdkInfo(device),
    platform: device.platform,
    authorized: device.authorized,
    connectionState: device.state,
    isDefault: Boolean(defaultId && defaultId === device.id)
  };
}

export function registryToDeviceListRows(registry: DeviceRegistry | null): DeviceListRow[] {
  if (!registry?.devices?.length) return [];
  return registry.devices
    .map((d) => deviceToListRow(d, registry.defaults))
    .sort((a, b) => {
      if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.deviceName.localeCompare(b.deviceName, "zh-CN");
    });
}
