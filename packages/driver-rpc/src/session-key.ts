import type { Platform } from "@ada/contracts";
import { parseWebEngineFromPayload } from "./web-engine.js";

function capsOf(payload?: Record<string, unknown>): Record<string, unknown> {
  const p = payload ?? {};
  return (typeof p.capabilities === "object" && p.capabilities !== null
    ? p.capabilities
    : {}) as Record<string, unknown>;
}

/** 从 payload / capabilities / env 解析移动设备标识（用于内核 session 隔离） */
export function resolveMobileDeviceId(platform: Platform, payload?: Record<string, unknown>): string | undefined {
  const caps = capsOf(payload);
  const p = payload ?? {};
  if (platform === "android") {
    const udid = String(caps.udid ?? caps["ada:udid"] ?? p.udid ?? process.env.ADA_ANDROID_UDID ?? "").trim();
    return udid || undefined;
  }
  if (platform === "harmony") {
    const sn = String(
      caps.deviceSn ?? caps.udid ?? caps["ada:udid"] ?? p.deviceSn ?? process.env.ADA_HARMONY_DEVICE_SN ?? ""
    ).trim();
    return sn || undefined;
  }
  if (platform === "ios") {
    const udid = String(caps.udid ?? caps["ada:udid"] ?? process.env.ADA_IOS_DEVICE_UDID ?? "").trim();
    return udid || undefined;
  }
  return undefined;
}

/** 内核 DriverSessionManager 使用的稳定会话键 */
export function buildKernelSessionKey(
  platform: string,
  sessionId: string,
  payload?: Record<string, unknown>
): string {
  if (platform === "web") {
    const engine = parseWebEngineFromPayload(payload);
    return `web:${engine}:${sessionId}`;
  }
  const deviceId = resolveMobileDeviceId(platform as Platform, payload);
  if (deviceId && (platform === "android" || platform === "harmony" || platform === "ios")) {
    return `${platform}:${deviceId}:${sessionId}`;
  }
  return `${platform}:${sessionId}`;
}

export function parseKernelSessionKey(key: string): {
  platform: string;
  sessionId: string;
  engine?: string;
  deviceId?: string;
} | null {
  const parts = key.split(":");
  if (parts[0] === "web" && parts.length >= 3) {
    return { platform: "web", engine: parts[1], sessionId: parts.slice(2).join(":") };
  }
  if (parts.length >= 3 && (parts[0] === "android" || parts[0] === "harmony" || parts[0] === "ios")) {
    return { platform: parts[0], deviceId: parts[1], sessionId: parts.slice(2).join(":") };
  }
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  return { platform: key.slice(0, idx), sessionId: key.slice(idx + 1) };
}
