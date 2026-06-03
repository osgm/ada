import { fetchWebDriverJson, isHttpServerUrl } from "@ada/driver-rpc";
import type { AndroidPayload } from "./adapter.js";
import { deviceSerialOf, uia2ServerUrlOf } from "./session-signature.js";

const httpProbeCache = new Map<string, { reachable: boolean; at: number }>();
const PROBE_TTL_MS = 5_000;

async function probeHttpServer(baseUrl: string): Promise<boolean> {
  const cached = httpProbeCache.get(baseUrl);
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) {
    return cached.reachable;
  }
  const res = await fetchWebDriverJson("GET", `${baseUrl}/status`);
  const reachable = res.ok || res.status === 200;
  httpProbeCache.set(baseUrl, { reachable, at: Date.now() });
  return reachable;
}

/** Resolve adb vs UIA2 HTTP; auto-upgrade when env URL is reachable (unless ADA_ANDROID_UIA2_AUTO_HTTP=false). */
export async function resolveAndroidTransport(
  payload: AndroidPayload
): Promise<{ transport: "adb" | "http"; serverUrl: string }> {
  const configured = uia2ServerUrlOf(payload);
  if (isHttpServerUrl(configured)) {
    return { transport: "http", serverUrl: configured.replace(/\/$/, "") };
  }
  const autoDisabled = process.env.ADA_ANDROID_UIA2_AUTO_HTTP === "false";
  if (!autoDisabled) {
    const envUrl = process.env.ADA_ANDROID_UIA2_SERVER_URL?.trim();
    if (envUrl && isHttpServerUrl(envUrl)) {
      const base = envUrl.replace(/\/$/, "");
      if (await probeHttpServer(base)) {
        return { transport: "http", serverUrl: base };
      }
    }
  }
  return { transport: "adb", serverUrl: deviceSerialOf(payload) };
}
