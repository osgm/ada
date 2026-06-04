import type {
  DeviceRegistry,
  DeviceRegistryDefaults,
  MobileDeviceScanResult,
  MobilePlatform,
  ScannedMobileDevice
} from "./device-types.js";
import { flattenScan, isValidMobileDeviceId, pickDefaultDeviceId } from "./device-scan.js";

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

  const freshKeys = new Set<string>();
  for (const fresh of flattenScan(scan)) {
    if (!isValidMobileDeviceId(fresh.platform, fresh.id)) continue;
    const key = `${fresh.platform}:${fresh.id}`;
    freshKeys.add(key);
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

  const scannedPlatforms: MobilePlatform[] = ["android", "ios", "harmony"];
  for (const platform of scannedPlatforms) {
    if (scan.errors.some((e) => e.platform === platform)) continue;
    for (const [key, device] of byKey) {
      if (device.platform === platform && !freshKeys.has(key)) {
        byKey.delete(key);
      }
    }
  }
  for (const [key, device] of byKey) {
    if (!isValidMobileDeviceId(device.platform, device.id)) {
      byKey.delete(key);
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

  const androidDefault = pickDefaultDeviceId(androidPool, preferred.android ?? defaults.android);
  defaults.android =
    androidDefault && isValidMobileDeviceId("android", androidDefault)
      ? androidDefault
      : androidPool.length
        ? undefined
        : defaults.android && isValidMobileDeviceId("android", defaults.android)
          ? defaults.android
          : undefined;
  const iosDefault = pickDefaultDeviceId(iosPool, preferred.ios ?? defaults.ios);
  defaults.ios =
    iosDefault && isValidMobileDeviceId("ios", iosDefault)
      ? iosDefault
      : iosPool.length
        ? undefined
        : defaults.ios && isValidMobileDeviceId("ios", defaults.ios)
          ? defaults.ios
          : undefined;
  const harmonyDefault = pickDefaultDeviceId(harmonyPool, preferred.harmony ?? defaults.harmony);
  defaults.harmony =
    harmonyDefault && isValidMobileDeviceId("harmony", harmonyDefault)
      ? harmonyDefault
      : harmonyPool.length
        ? undefined
        : defaults.harmony && isValidMobileDeviceId("harmony", defaults.harmony)
          ? defaults.harmony
          : undefined;

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
  const android = registry.defaults.android;
  if (android && isValidMobileDeviceId("android", android) && !process.env.ADA_ANDROID_DEVICE_SN?.trim()) {
    process.env.ADA_ANDROID_DEVICE_SN = android;
    process.env.ADA_ANDROID_UDID = android;
  }
  const ios = registry.defaults.ios;
  if (ios && isValidMobileDeviceId("ios", ios) && !process.env.ADA_IOS_DEVICE_UDID?.trim()) {
    process.env.ADA_IOS_DEVICE_UDID = ios;
  }
  const harmony = registry.defaults.harmony;
  if (harmony && isValidMobileDeviceId("harmony", harmony) && !process.env.ADA_HARMONY_DEVICE_SN?.trim()) {
    process.env.ADA_HARMONY_DEVICE_SN = harmony;
    process.env.HARMONY_DEVICE_SN = harmony;
  }
}

export function listAuthorizedDevices(registry: DeviceRegistry, platform?: ScannedMobileDevice["platform"]) {
  return registry.devices.filter((d) => d.authorized && (!platform || d.platform === platform));
}
