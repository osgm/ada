import fs from "node:fs/promises";
import path from "node:path";
import type { AppProfilesMap, MobileTarget } from "./mobile-target.js";

function asProfilesMap(value: unknown): AppProfilesMap {
  if (!value || typeof value !== "object") return {};
  const out: AppProfilesMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    out[key] = {
      web: p.web as MobileTarget["web"],
      android: p.android as MobileTarget["android"],
      harmony: p.harmony as MobileTarget["harmony"],
      ios: p.ios as MobileTarget["ios"]
    };
  }
  return out;
}

export async function loadAppProfilesJsonFile(filePath: string): Promise<AppProfilesMap> {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  return asProfilesMap(JSON.parse(raw));
}

export async function loadAppProfilesFromYamlFile(filePath: string): Promise<AppProfilesMap> {
  try {
    const yaml = await import("js-yaml");
    const raw = await fs.readFile(path.resolve(filePath), "utf8");
    const doc = yaml.load(raw) as Record<string, unknown>;
    return asProfilesMap(doc?.appProfiles);
  } catch {
    return {};
  }
}

export async function loadAppProfilesAuto(filePath: string): Promise<AppProfilesMap> {
  const resolved = path.resolve(filePath);
  if (resolved.endsWith(".json")) {
    return loadAppProfilesJsonFile(resolved);
  }
  return loadAppProfilesFromYamlFile(resolved);
}
