export type MobilePlatform = "android" | "ios" | "harmony";

export type DeviceConnectionState =
  | "device"
  | "online"
  | "booted"
  | "available"
  | "unauthorized"
  | "offline"
  | "unknown";

export type DeviceKind = "physical" | "emulator" | "simulator" | "unknown";

/** 扫描到的单台移动设备核心信息 */
export interface ScannedMobileDevice {
  platform: MobilePlatform;
  id: string;
  state: DeviceConnectionState;
  /** 是否可用于自动化（已授权/在线） */
  authorized: boolean;
  label?: string;
  model?: string;
  /** Android API level / Harmony API / iOS runtime 版本 */
  sdkVersion?: string;
  osVersion?: string;
  screenWidth?: number;
  screenHeight?: number;
  kind: DeviceKind;
  /** 原始工具输出摘要，便于排障 */
  source: string;
}

export interface MobileDeviceScanResult {
  scannedAt: string;
  android: ScannedMobileDevice[];
  ios: ScannedMobileDevice[];
  harmony: ScannedMobileDevice[];
  errors: Array<{ platform: MobilePlatform; message: string }>;
}

export interface DeviceRegistryDefaults {
  android?: string;
  ios?: string;
  harmony?: string;
}

/** 持久化到 .ada-agent/devices.json */
export interface DeviceRegistry {
  version: 1;
  updatedAt: string;
  lastScanAt?: string;
  deviceTags?: string[];
  defaults: DeviceRegistryDefaults;
  devices: Array<
    ScannedMobileDevice & {
      firstSeenAt: string;
      lastSeenAt: string;
    }
  >;
}
