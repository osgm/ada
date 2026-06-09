import fs from "node:fs/promises";
import { applyAdaToolsToProcessEnv, ensureGlobalAdaHome, legacyAdaAgentDataCandidates, resolveDeviceRegistryPathSync } from "@ada/install-deps";
import {
  applyDeviceRegistryToEnv,
  mergeDeviceScan,
  scanMobileDevices,
  type DeviceRegistry,
  type DeviceRegistryDefaults,
  type MobileDeviceScanResult
} from "@ada/runtime-probe";
import type { AgentConfig } from "./types.js";

async function readDeviceRegistryFile(file: string): Promise<DeviceRegistry | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as DeviceRegistry;
    if (parsed?.version !== 1 || !Array.isArray(parsed.devices)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function deviceRegistryPath(_cwd = process.cwd()): Promise<string> {
  await ensureGlobalAdaHome();
  return resolveDeviceRegistryPathSync();
}

export async function loadDeviceRegistry(_cwd = process.cwd()): Promise<DeviceRegistry | null> {
  const file = await deviceRegistryPath();
  const current = await readDeviceRegistryFile(file);
  if (current) {
    return current;
  }

  for (const legacy of await legacyAdaAgentDataCandidates("devices.json")) {
    const migrated = await readDeviceRegistryFile(legacy);
    if (!migrated) {
      continue;
    }
    await fs.writeFile(file, JSON.stringify(migrated, null, 2), "utf8");
    return migrated;
  }
  return null;
}

export async function saveDeviceRegistry(registry: DeviceRegistry, _cwd = process.cwd()): Promise<string> {
  const file = await deviceRegistryPath();
  await fs.writeFile(file, JSON.stringify(registry, null, 2), "utf8");
  return file;
}

export async function scanAndPersistDevices(
  config: AgentConfig,
  options?: {
    cwd?: string;
    deviceTags?: string[];
    preferredDefaults?: DeviceRegistryDefaults;
    applyEnv?: boolean;
  }
): Promise<{ registry: DeviceRegistry; scan: MobileDeviceScanResult; file: string }> {
  const cwd = options?.cwd ?? process.cwd();
  const tools = await applyAdaToolsToProcessEnv({
    cwd,
    relativeDir: config.dependencies.toolsDir ?? "tools"
  });
  const scan = await scanMobileDevices({ hdcPath: tools.hdcPath ?? undefined });
  const existing = await loadDeviceRegistry();
  const registry = mergeDeviceScan(existing, scan, {
    deviceTags: options?.deviceTags ?? existing?.deviceTags,
    preferredDefaults: options?.preferredDefaults ?? existing?.defaults
  });
  const file = await saveDeviceRegistry(registry);
  if (options?.applyEnv !== false) {
    applyDeviceRegistryToEnv(registry);
  }
  return { registry, scan, file };
}

export function isDeviceAutoScanEnabled(config: AgentConfig, when: "setup" | "start"): boolean {
  const devices = config.devices;
  if (!devices) return when === "setup" || when === "start";
  if (when === "setup") return devices.autoScanOnSetup !== false;
  return devices.autoScanOnStart !== false;
}
