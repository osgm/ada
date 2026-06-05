import os from "node:os";
import path from "node:path";

/** 是否为磁盘根（如 `/`、`C:\`），此类路径不可作为 ADA 数据目录 */
export function isFilesystemRootPath(dir: string): boolean {
  const resolved = path.resolve(dir);
  const parsed = path.parse(resolved);
  return resolved === parsed.root || path.dirname(resolved) === parsed.root;
}

/**
 * 当前用户主目录（Windows / macOS / Linux）。
 * 依次尝试 os.homedir、HOME、USERPROFILE；均不可用时不落到磁盘根。
 */
export function resolveUserHomeDirSync(): string {
  const candidates = [
    os.homedir(),
    process.env.HOME,
    process.env.USERPROFILE,
    process.platform === "win32" && process.env.SystemDrive && process.env.USERNAME
      ? path.join(process.env.SystemDrive, "Users", process.env.USERNAME)
      : undefined
  ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate.trim());
    if (!isFilesystemRootPath(resolved)) {
      return resolved;
    }
  }

  return process.platform === "win32" ? path.join("C:", "Users", "Default") : "/tmp";
}

/** 全局 ADA 数据目录（默认 ~/.ada；可用 ADA_HOME 覆盖，但不会接受磁盘根） */
export function resolveGlobalAdaHomeSync(): string {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    const resolved = path.resolve(override);
    if (!isFilesystemRootPath(resolved)) {
      return resolved;
    }
  }
  return path.join(resolveUserHomeDirSync(), ".ada");
}

export function resolveDeviceRegistryPathSync(): string {
  return path.join(resolveGlobalAdaHomeSync(), "devices.json");
}

export function resolveAgentEffectiveConfigPathSync(): string {
  return path.join(resolveGlobalAdaHomeSync(), "agent.config.yaml");
}

export function resolvePlaywrightHostFilePathSync(): string {
  return path.join(resolveGlobalAdaHomeSync(), "playwright-host");
}
