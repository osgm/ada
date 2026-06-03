import type { IOSPayload } from "./adapter.js";

export function serverUrlOf(payload: IOSPayload): string {
  return String(payload.serverUrl ?? process.env.ADA_WDA_SERVER_URL ?? "http://127.0.0.1:8100").replace(/\/$/, "");
}

export function capsOf(payload: IOSPayload): Record<string, unknown> {
  return (
    payload.capabilities ?? {
      platformName: "iOS",
      automationName: "XCUITest"
    }
  );
}

/** Single source of truth for plugin + adapter session identity. */
export function iosSessionSignature(payload: IOSPayload): string {
  return JSON.stringify({
    serverUrl: serverUrlOf(payload),
    capabilities: capsOf(payload)
  });
}
