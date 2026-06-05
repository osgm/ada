import type { IOSPayload } from "./adapter.js";

export function serverUrlOf(payload: IOSPayload): string {
  return String(payload.serverUrl ?? process.env.ADA_WDA_SERVER_URL ?? "http://127.0.0.1:8100").replace(/\/$/, "");
}

export function capsOf(payload: IOSPayload): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(payload.capabilities ?? {}) };
  if (!base.platformName) base.platformName = "iOS";
  if (!base.automationName) base.automationName = "XCUITest";
  const bundleId = String(payload.bundleId ?? payload.appId ?? "").trim();
  if (bundleId && !base.bundleId) base.bundleId = bundleId;
  const udid = String(base.udid ?? process.env.ADA_IOS_DEVICE_UDID ?? "").trim();
  if (udid) base.udid = udid;
  return base;
}

/** Single source of truth for plugin + adapter session identity. */
export function iosSessionSignature(payload: IOSPayload): string {
  return JSON.stringify({
    serverUrl: serverUrlOf(payload),
    capabilities: capsOf(payload)
  });
}
