import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isChinaFriendlyNpmRegistry } from "./mirror-candidates.mjs";
import { normalizeRegistryUrl } from "./registry-probe.mjs";

function resolveAdaHome() {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".ada");
}

/** 与 install-deps download-probe-persist 默认策略一致 */
export function defaultPlaywrightHostForRegistry(registry) {
  const reg = normalizeRegistryUrl(String(registry ?? "").trim());
  if (reg && isChinaFriendlyNpmRegistry(reg)) {
    return "https://cdn.npmmirror.com/binaries/playwright";
  }
  return "https://cdn.playwright.dev";
}

/**
 * launcher 探测结果写入 ~/.ada/deps-install-state.json（子进程 bootstrap 只读、跳过二次测速）
 * @param {{ registry: string, launcherVersion?: string, playwrightHost?: string }} payload
 */
export function seedDepsInstallProbeState(payload) {
  const reg = normalizeRegistryUrl(String(payload?.registry ?? "").trim());
  if (!reg) {
    return;
  }
  const pwHost =
    String(payload?.playwrightHost ?? "").trim().replace(/\/$/, "") ||
    defaultPlaywrightHostForRegistry(reg);
  const file = path.join(resolveAdaHome(), "deps-install-state.json");
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // new
  }
  state.bestNpmRegistry = reg;
  state.bestPlaywrightDownloadHost = pwHost;
  state.seededByLauncher = true;
  if (payload?.launcherVersion) {
    state.seededByLauncherVersion = String(payload.launcherVersion);
  }
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/** @deprecated 使用 seedDepsInstallProbeState */
export function seedDepsInstallRegistry(registry) {
  seedDepsInstallProbeState({ registry });
}
