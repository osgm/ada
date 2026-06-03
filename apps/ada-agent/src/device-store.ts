import fs from "node:fs/promises";
import path from "node:path";
import { applyAdaToolsToProcessEnv } from "@ada/install-deps";
import {
  applyDeviceRegistryToEnv,
  mergeDeviceScan,
  scanMobileDevices,
  type DeviceRegistry,
  type DeviceRegistryDefaults,
  type MobileDeviceScanResult
} from "@ada/runtime-probe";
import type { AgentConfig } from "./types.js";
import { ensureLocalDataDir } from "./config.js";

const DEVICES_FILE = "devices.json";

export async function deviceRegistryPath(cwd = process.cwd()): Promise<string> {
  const dir = await ensureLocalDataDir(cwd);
  return path.join(dir, DEVICES_FILE);
}

export async function loadDeviceRegistry(cwd = process.cwd()): Promise<DeviceRegistry | null> {
  try {
    const file = await deviceRegistryPath(cwd);
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as DeviceRegistry;
    if (parsed?.version !== 1 || !Array.isArray(parsed.devices)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveDeviceRegistry(registry: DeviceRegistry, cwd = process.cwd()): Promise<string> {
  const file = await deviceRegistryPath(cwd);
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
  const existing = await loadDeviceRegistry(cwd);
  const registry = mergeDeviceScan(existing, scan, {
    deviceTags: options?.deviceTags ?? existing?.deviceTags,
    preferredDefaults: options?.preferredDefaults ?? existing?.defaults
  });
  const file = await saveDeviceRegistry(registry, cwd);
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
