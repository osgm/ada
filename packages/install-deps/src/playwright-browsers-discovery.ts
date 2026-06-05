import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function resolveAdaHomeSync(): string {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".ada");
}

/** Playwright 浏览器缓存目录名：chromium-1234 / firefox-… / webkit-… 等 */
const BROWSER_ENTRY_RE =
  /^(chromium|chromium_headless_shell|firefox|webkit|ffmpeg)[-_]/i;

export type PlaywrightBrowsersDirInfo = {
  path: string;
  browserKinds: string[];
  entryCount: number;
};

function isTruthyEnvOff(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

/** 默认开启；设 `ADA_PLAYWRIGHT_AUTO_DISCOVER=0` 关闭系统扫描 */
export function isPlaywrightBrowsersAutoDiscoverEnabled(): boolean {
  return !isTruthyEnvOff("ADA_PLAYWRIGHT_AUTO_DISCOVER");
}

function normalizeDir(p: string): string {
  return path.normalize(path.resolve(p));
}

function dedupeDirs(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of paths) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const n = normalizeDir(trimmed);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * 各平台常见 Playwright 浏览器缓存路径（不含已显式设置的 PLAYWRIGHT_BROWSERS_PATH）。
 * 顺序：本机 ADA 缓存 → 系统默认 ms-playwright → 其它常见缓存根。
 */
export function listPlaywrightBrowsersCandidateDirs(): string[] {
  const home = os.homedir();
  const adaHome = resolveAdaHomeSync();
  const candidates: string[] = [path.join(adaHome, "playwright-browsers")];

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA?.trim();
    if (localAppData) {
      candidates.push(path.join(localAppData, "ms-playwright"));
    }
    const userProfile = process.env.USERPROFILE?.trim();
    if (userProfile) {
      candidates.push(path.join(userProfile, "AppData", "Local", "ms-playwright"));
    }
    const appData = process.env.APPDATA?.trim();
    if (appData) {
      candidates.push(path.join(path.dirname(appData), "Local", "ms-playwright"));
    }
  } else if (process.platform === "darwin") {
    candidates.push(path.join(home, "Library", "Caches", "ms-playwright"));
  } else {
    const xdgCache = process.env.XDG_CACHE_HOME?.trim();
    candidates.push(path.join(xdgCache || path.join(home, ".cache"), "ms-playwright"));
  }

  candidates.push(path.join(home, ".cache", "ms-playwright"));

  const init = process.env.INIT_CWD?.trim();
  if (init) {
    candidates.push(path.join(init, "node_modules", ".cache", "ms-playwright"));
  }

  const cwd = process.cwd();
  if (cwd && cwd !== init) {
    candidates.push(path.join(cwd, "node_modules", ".cache", "ms-playwright"));
  }

  return dedupeDirs(candidates);
}

function kindFromEntryName(name: string): string | null {
  const m = name.match(BROWSER_ENTRY_RE);
  if (!m) return null;
  const k = m[1].toLowerCase();
  if (k === "chromium_headless_shell") return "chromium";
  return k;
}

/** 目录是否像 Playwright 浏览器缓存（至少有一个浏览器条目） */
export async function inspectPlaywrightBrowsersDir(dir: string): Promise<PlaywrightBrowsersDirInfo | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const kinds = new Set<string>();
    let entryCount = 0;
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const kind = kindFromEntryName(ent.name);
      if (!kind) continue;
      entryCount += 1;
      kinds.add(kind);
    }
    if (entryCount === 0) {
      return null;
    }
    return {
      path: normalizeDir(dir),
      browserKinds: [...kinds].sort(),
      entryCount
    };
  } catch {
    return null;
  }
}

function scoreBrowsersDir(info: PlaywrightBrowsersDirInfo): number {
  let score = info.entryCount * 10;
  if (info.browserKinds.includes("chromium")) score += 100;
  if (info.browserKinds.includes("firefox")) score += 20;
  if (info.browserKinds.includes("webkit")) score += 20;
  if (info.path.includes(`${path.sep}ms-playwright`)) score += 5;
  return score;
}

/**
 * 在候选目录中选取已有浏览器缓存的最佳路径；无则返回 null。
 */
export async function discoverPlaywrightBrowsersPath(
  candidates: string[] = listPlaywrightBrowsersCandidateDirs()
): Promise<PlaywrightBrowsersDirInfo | null> {
  let best: PlaywrightBrowsersDirInfo | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const info = await inspectPlaywrightBrowsersDir(candidate);
    if (!info) continue;
    const score = scoreBrowsersDir(info);
    if (score > bestScore) {
      bestScore = score;
      best = info;
    }
  }
  return best;
}

export async function playwrightBrowsersDirHasChromium(dir: string): Promise<boolean> {
  const info = await inspectPlaywrightBrowsersDir(dir);
  return Boolean(info?.browserKinds.includes("chromium"));
}
