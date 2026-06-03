import { isHttpServerUrl } from "@ada/driver-rpc";
import type { AndroidPayload } from "./adapter.js";

export function deviceSerialOf(payload: AndroidPayload): string {
  const caps = payload.capabilities ?? {};
  return String(
    caps["ada:udid"] ?? caps.udid ?? caps.deviceName ?? process.env.ADA_ANDROID_DEVICE_SN ?? ""
  ).trim();
}

export function uia2ServerUrlOf(payload: AndroidPayload): string {
  const caps = payload.capabilities ?? {};
  return String(
    payload.serverUrl ??
      caps["appium:serverUrl"] ??
      caps.serverUrl ??
      process.env.ADA_ANDROID_UIA2_SERVER_URL ??
      ""
  ).trim();
}

/** Single source of truth for plugin + adapter session identity. */
export function androidSessionSignature(payload: AndroidPayload): string {
  const httpUrl = uia2ServerUrlOf(payload);
  if (isHttpServerUrl(httpUrl)) {
    return JSON.stringify({ transport: "http", serverUrl: httpUrl.replace(/\/$/, ""), capabilities: payload.capabilities ?? {} });
  }
  return JSON.stringify({ transport: "adb", deviceSerial: deviceSerialOf(payload) });
}
