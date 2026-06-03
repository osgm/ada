import type {
  DeviceRegistry,
  DeviceRegistryDefaults,
  MobileDeviceScanResult,
  ScannedMobileDevice
} from "./device-types.js";
import { flattenScan, pickDefaultDeviceId } from "./device-scan.js";

export function createEmptyDeviceRegistry(deviceTags?: string[]): DeviceRegistry {
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    deviceTags: deviceTags?.length ? [...deviceTags] : undefined,
    defaults: {},
    devices: []
  };
}

/** 合并扫描结果：更新 lastSeenAt、保留 firstSeenAt、刷新 defaults */
export function mergeDeviceScan(
  existing: DeviceRegistry | null,
  scan: MobileDeviceScanResult,
  options?: { deviceTags?: string[]; preferredDefaults?: DeviceRegistryDefaults }
): DeviceRegistry {
  const now = new Date().toISOString();
  const base = existing ?? createEmptyDeviceRegistry(options?.deviceTags);
  const byKey = new Map(base.devices.map((d) => [`${d.platform}:${d.id}`, d]));

  for (const fresh of flattenScan(scan)) {
    const key = `${fresh.platform}:${fresh.id}`;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, {
        ...prev,
        ...fresh,
        firstSeenAt: prev.firstSeenAt,
        lastSeenAt: now
      });
    } else {
      byKey.set(key, { ...fresh, firstSeenAt: now, lastSeenAt: now });
    }
  }

  const devices = Array.from(byKey.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    return a.id.localeCompare(b.id);
  });

  const defaults: DeviceRegistryDefaults = { ...base.defaults };
  const preferred = options?.preferredDefaults ?? {};
  const androidPool = scan.android;
  const iosPool = scan.ios;
  const harmonyPool = scan.harmony;

  defaults.android =
    pickDefaultDeviceId(androidPool, preferred.android ?? defaults.android) ?? defaults.android;
  defaults.ios = pickDefaultDeviceId(iosPool, preferred.ios ?? defaults.ios) ?? defaults.ios;
  defaults.harmony =
    pickDefaultDeviceId(harmonyPool, preferred.harmony ?? defaults.harmony) ?? defaults.harmony;

  const tags =
    options?.deviceTags !== undefined
      ? options.deviceTags.length
        ? [...options.deviceTags]
        : undefined
      : base.deviceTags;

  return {
    version: 1,
    updatedAt: now,
    lastScanAt: scan.scannedAt,
    deviceTags: tags,
    defaults,
    devices
  };
}

/** 将 registry 默认设备写入进程环境（不覆盖用户已显式设置的变量） */
export function applyDeviceRegistryToEnv(registry: DeviceRegistry): void {
  if (registry.defaults.android && !process.env.ADA_ANDROID_DEVICE_SN?.trim()) {
    process.env.ADA_ANDROID_DEVICE_SN = registry.defaults.android;
    process.env.ADA_ANDROID_UDID = registry.defaults.android;
  }
  if (registry.defaults.ios && !process.env.ADA_IOS_DEVICE_UDID?.trim()) {
    process.env.ADA_IOS_DEVICE_UDID = registry.defaults.ios;
  }
  if (registry.defaults.harmony && !process.env.ADA_HARMONY_DEVICE_SN?.trim()) {
    process.env.ADA_HARMONY_DEVICE_SN = registry.defaults.harmony;
    process.env.HARMONY_DEVICE_SN = registry.defaults.harmony;
  }
}

export function listAuthorizedDevices(registry: DeviceRegistry, platform?: ScannedMobileDevice["platform"]) {
  return registry.devices.filter((d) => d.authorized && (!platform || d.platform === platform));
}
