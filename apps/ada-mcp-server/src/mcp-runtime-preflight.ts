import {
  applyAdaToolsToProcessEnv,
  awaitBootstrapInstallDeps,
  getDependencyHealth,
  probeHarmonyRuntime,
  type InstallDepsConfig
} from "@ada/install-deps";
import { loadDeviceRegistry } from "@ada/agent-core";
import { applyDeviceRegistryToEnv, probeAndroidRuntime, probeIosRuntime } from "@ada/runtime-probe";
import type { AdaPlatform } from "./mcp-normalize.js";
import { isMobilePlatform } from "./mcp-normalize.js";
import { loadAgentConfig } from "./config.js";

type MobilePlatform = "android" | "ios" | "harmony";

interface PreflightCacheEntry {
  ok: boolean;
  checkedAt: number;
  error?: string;
}

const PREFLIGHT_OK_MS = Number(process.env.ADA_MCP_PREFLIGHT_CACHE_MS ?? 60_000);
const PREFLIGHT_FAIL_MS = 15_000;

const preflightCache = new Map<string, PreflightCacheEntry>();
const probeResultCache = new Map<string, { checkedAt: number; value: unknown }>();
const PROBE_RESULT_TTL_MS = Number(process.env.ADA_MCP_PROBE_CACHE_MS ?? 45_000);
let deviceRegistryCache: { checkedAtMs: number; applied: boolean } | null = null;

export function invalidateRuntimePreflightCache(platform?: MobilePlatform | "web"): void {
  if (!platform) {
    preflightCache.clear();
    probeResultCache.clear();
    deviceRegistryCache = null;
    return;
  }
  for (const key of preflightCache.keys()) {
    if (key === platform || key.startsWith(`${platform}:`)) {
      preflightCache.delete(key);
    }
  }
  for (const key of probeResultCache.keys()) {
    if (key.startsWith(`${platform}:`)) {
      probeResultCache.delete(key);
    }
  }
  if (platform !== "web") {
    deviceRegistryCache = null;
  }
}

async function getCachedProbe<T>(key: string, probe: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = probeResultCache.get(key);
  if (cached && now - cached.checkedAt < PROBE_RESULT_TTL_MS) {
    return cached.value as T;
  }
  const value = await probe();
  probeResultCache.set(key, { checkedAt: now, value });
  return value;
}

async function withPreflightCache(key: string, probe: () => Promise<void>): Promise<void> {
  const now = Date.now();
  const cached = preflightCache.get(key);
  if (cached) {
    const ttl = cached.ok ? PREFLIGHT_OK_MS : PREFLIGHT_FAIL_MS;
    if (now - cached.checkedAt < ttl) {
      if (!cached.ok) {
        throw new Error(cached.error ?? "runtime preflight failed");
      }
      return;
    }
  }

  try {
    await probe();
    preflightCache.set(key, { ok: true, checkedAt: now });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    preflightCache.set(key, { ok: false, checkedAt: now, error: message });
    throw error;
  }
}

export async function ensureDeviceRegistryEnvCached(): Promise<void> {
  const now = Date.now();
  if (deviceRegistryCache?.applied && now - deviceRegistryCache.checkedAtMs < PREFLIGHT_OK_MS) {
    return;
  }
  const registry = await loadDeviceRegistry();
  if (!registry) {
    return;
  }
  applyDeviceRegistryToEnv(registry);
  deviceRegistryCache = { checkedAtMs: now, applied: true };
}

export async function ensureWebRuntimeReady(): Promise<void> {
  await awaitBootstrapInstallDeps();
  await withPreflightCache("web", async () => {
    const deps = await getDependencyHealth(undefined, { includeHarmony: false });
    if (!deps.playwrightInstalled) {
      throw new Error("Web runtime not ready: Playwright not installed (run ada_install_deps only=playwright)");
    }
    if (!deps.playwrightLaunchOk) {
      throw new Error(
        "Web runtime not ready: Playwright browser failed to launch (run ada_install_deps only=playwright force=true)"
      );
    }
  });
}

export async function ensureMobileRuntimeReady(
  platform: AdaPlatform,
  loadConfig?: () => Promise<InstallDepsConfig>
): Promise<void> {
  if (!isMobilePlatform(platform)) {
    return;
  }

  await awaitBootstrapInstallDeps();

  await withPreflightCache(platform, async () => {
    await ensureDeviceRegistryEnvCached();
    if (platform === "android") {
      const android = await probeAndroidRuntime();
      if (!android.adbOnPath) {
        throw new Error("Android runtime not ready: adb command not found in PATH");
      }
      if (!android.deviceConnected) {
        throw new Error(`Android runtime not ready: ${android.detail}`);
      }
      return;
    }
    if (platform === "ios") {
      const config = loadConfig ? await loadConfig() : ((await loadAgentConfig()) as unknown as InstallDepsConfig);
      await applyAdaToolsToProcessEnv({
        relativeDir: config.dependencies?.toolsDir?.trim() || "tools"
      });
      const ios = await probeIosRuntime();
      if (!ios.hostSupported) {
        throw new Error("iOS runtime not ready: requires macOS or Windows host with libimobiledevice + WDA on device");
      }
      if (process.platform === "darwin" && !ios.xcrunOk) {
        throw new Error("iOS runtime not ready: xcrun not found (install Xcode Command Line Tools)");
      }
      if (!ios.wdaReachable) {
        throw new Error(
          `iOS runtime not ready: ${ios.detail} (start WebDriverAgent on device or set ADA_WDA_SERVER_URL)`
        );
      }
      return;
    }
    if (platform === "harmony") {
      const config = loadConfig ? await loadConfig() : ((await loadAgentConfig()) as unknown as InstallDepsConfig);
      const harmony = await probeHarmonyRuntime(config as InstallDepsConfig);
      if (!harmony.hypiumDriverInstalled) {
        throw new Error(
          "Harmony runtime not ready: hypium-driver package not installed (run ada_install_deps --only harmony)"
        );
      }
      if (!harmony.toolsDir) {
        throw new Error(
          "Harmony runtime not ready: hdc not found in tools/ (run ada_install_deps --only harmony or set ADA_TOOLS_DIR)"
        );
      }
      if (!harmony.ready) {
        throw new Error(`Harmony runtime not ready: ${harmony.detail}`);
      }
    }
  });
}

export async function getCachedMobileProbes(): Promise<{
  android: Awaited<ReturnType<typeof probeAndroidRuntime>>;
  ios: Awaited<ReturnType<typeof probeIosRuntime>>;
}> {
  const [android, ios] = await Promise.all([
    getCachedProbe("android:runtime", () => probeAndroidRuntime()),
    getCachedProbe("ios:runtime", () => probeIosRuntime())
  ]);
  return { android, ios };
}
