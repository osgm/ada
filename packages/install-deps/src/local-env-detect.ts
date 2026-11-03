import fs from "node:fs/promises";
import path from "node:path";
import { commandExists as probeCommandExists } from "@ada/runtime-probe";
import type { InstallDepsConfig } from "./types.js";
import {
  resolveGlobalAdaHomeSync,
  resolvePlaywrightBrowsersPath
} from "./deps-install-paths.js";
import {
  ensurePackageResolution,
  resolvePackageInfo,
  type PackageSource
} from "./deps-resolution.js";
import { inspectPlaywrightBrowsersDir } from "./playwright-browsers-discovery.js";
import {
  normalizeToolsRelativeSegment,
  resolveAdaToolsDir,
  resolveDefaultToolsDir,
  resolveHdcExecutable,
  resolveLibimobiledeviceExecutable
} from "./tools-paths.js";
import { PINNED_PLAYWRIGHT_VERSION } from "./pinned-playwright-version.js";

/** 与 dependency-installer 保持一致的 hypium-driver 锁定版本 */
export const PINNED_HYPIUM_DRIVER_VERSION = "6.1.210";

export type DetectedPackageName = "playwright" | "hypium-driver";

export type LocalPackageDetect = {
  name: string;
  available: boolean;
  source: PackageSource;
  version?: string;
  expectedVersion?: string;
  /** 主版本一致（或未指定期望版本） */
  versionSatisfied: boolean;
  /** 版本完全一致 */
  versionExact: boolean;
};

export type LocalPlaywrightDetect = {
  browsersPath: string;
  browserKinds: string[];
  entryCount: number;
  requestedTargets: string[];
  /** 可在浏览器缓存目录校验的目标中，已就绪的 */
  satisfiedTargets: string[];
  /** 可校验但缺失的目标（只需补装这些） */
  missingTargets: string[];
  /** 系统渠道浏览器（chrome/msedge 等），无法在缓存目录校验 */
  unverifiableTargets: string[];
  ready: boolean;
};

export type LocalToolsDetect = {
  toolsDir: string | null;
  hdcPath: string | null;
  hdcPresent: boolean;
  libimobiledeviceReady: boolean;
  adbOnPath: boolean;
  ideviceinstallerOnPath: boolean;
};

export type LocalEnvDetectResult = {
  fingerprint: string;
  detectedAt: number;
  deep: boolean;
  packages: Record<DetectedPackageName, LocalPackageDetect>;
  playwright: LocalPlaywrightDetect;
  tools: LocalToolsDetect;
};

export type DetectLocalEnvOptions = {
  config?: InstallDepsConfig;
  playwrightTargetsOverride?: string[];
  /** 跳过缓存强制重新探测 */
  fresh?: boolean;
  /** 附加命令行探测（adb / ideviceinstaller 是否在 PATH） */
  deep?: boolean;
};

const DEFAULT_DETECT_TTL_MS = 60_000;

/** 目标 → Playwright 浏览器缓存目录中的条目类型 */
const TARGET_KIND_MAP: Record<string, string[]> = {
  chromium: ["chromium"],
  "chromium-headless-shell": ["chromium"],
  firefox: ["firefox"],
  "firefox-asan": ["firefox"],
  webkit: ["webkit"],
  all: ["chromium", "firefox", "webkit"]
};

/** 系统渠道浏览器：playwright install 走系统安装，不落在浏览器缓存目录 */
const CHANNEL_TARGETS = new Set([
  "chrome",
  "chrome-beta",
  "chrome-dev",
  "chrome-canary",
  "msedge",
  "msedge-beta",
  "msedge-dev",
  "msedge-canary"
]);

function envFlagOff(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

function envFlagOn(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * 默认信任本机实物探测结果（state 标记只作为加速缓存）。
 * 设 `ADA_DEPS_TRUST_LOCAL=0` 可回退为「必须有 state 标记才算完成」的旧行为。
 */
export function isTrustLocalEnvEnabled(): boolean {
  return !envFlagOff("ADA_DEPS_TRUST_LOCAL");
}

/** 默认只比对主版本；设 `ADA_DEPS_STRICT_VERSION=1` 要求完全一致 */
export function isStrictVersionCheckEnabled(): boolean {
  return envFlagOn("ADA_DEPS_STRICT_VERSION");
}

export function localEnvDetectTtlMs(): number {
  const raw = Number(process.env.ADA_DEPS_DETECT_TTL_MS ?? "");
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return DEFAULT_DETECT_TTL_MS;
}

export function expectedPackageVersion(name: DetectedPackageName): string | undefined {
  if (name === "playwright") {
    return process.env.ADA_PLAYWRIGHT_VERSION?.trim() || PINNED_PLAYWRIGHT_VERSION;
  }
  return process.env.ADA_HYPIUM_DRIVER_VERSION?.trim() || PINNED_HYPIUM_DRIVER_VERSION;
}

function majorOf(version: string): string | undefined {
  const m = version.trim().replace(/^[\^~>=<\s]*/, "").match(/^(\d+)\./);
  return m?.[1];
}

/** 期望版本含范围语义（^ ~ x * >= 等）时不做精确比对 */
function isRangeSpec(expected: string): boolean {
  return /[\^~*x><|\s]|latest|next/i.test(expected.trim());
}

export function compareInstalledVersion(
  actual: string | undefined,
  expected: string | undefined
): { versionSatisfied: boolean; versionExact: boolean } {
  if (!expected || !expected.trim()) {
    return { versionSatisfied: true, versionExact: Boolean(actual) };
  }
  if (!actual || !actual.trim()) {
    return { versionSatisfied: false, versionExact: false };
  }
  const exact = actual.trim() === expected.trim();
  if (isRangeSpec(expected)) {
    return { versionSatisfied: true, versionExact: exact };
  }
  const sameMajor = Boolean(majorOf(actual)) && majorOf(actual) === majorOf(expected);
  const satisfied = isStrictVersionCheckEnabled() ? exact : sameMajor;
  return { versionSatisfied: satisfied, versionExact: exact };
}

export function detectPackage(name: DetectedPackageName): LocalPackageDetect {
  const info = resolvePackageInfo(name);
  const expectedVersion = expectedPackageVersion(name);
  const cmp = info.available
    ? compareInstalledVersion(info.version, expectedVersion)
    : { versionSatisfied: false, versionExact: false };
  return {
    name,
    available: info.available,
    source: info.source,
    version: info.version,
    expectedVersion,
    ...cmp
  };
}

/** 归一化 playwright 安装目标列表 */
export function normalizePlaywrightTargets(
  config?: InstallDepsConfig,
  override?: string[]
): string[] {
  const raw =
    override && override.length > 0
      ? override
      : config?.dependencies?.playwrightInstallTargets?.length
        ? config.dependencies.playwrightInstallTargets
        : config?.dependencies?.playwrightBrowser
          ? [config.dependencies.playwrightBrowser]
          : ["chromium"];
  const out = new Set<string>();
  for (const item of raw) {
    const t = String(item ?? "").trim().toLowerCase();
    if (t) {
      out.add(t);
    }
  }
  return [...out].sort();
}

/** 按目标逐项校验浏览器缓存目录，返回缺失目标（便于只补缺失项） */
export async function detectPlaywrightBrowsers(options?: {
  config?: InstallDepsConfig;
  playwrightTargetsOverride?: string[];
  browsersPath?: string;
}): Promise<LocalPlaywrightDetect> {
  const requestedTargets = normalizePlaywrightTargets(
    options?.config,
    options?.playwrightTargetsOverride
  );
  const browsersPath = options?.browsersPath ?? (await resolvePlaywrightBrowsersPath({}));
  const info = await inspectPlaywrightBrowsersDir(browsersPath);
  const kinds = info?.browserKinds ?? [];

  const satisfiedTargets: string[] = [];
  const missingTargets: string[] = [];
  const unverifiableTargets: string[] = [];

  for (const target of requestedTargets) {
    if (CHANNEL_TARGETS.has(target)) {
      unverifiableTargets.push(target);
      continue;
    }
    const needKinds = TARGET_KIND_MAP[target];
    if (!needKinds) {
      unverifiableTargets.push(target);
      continue;
    }
    if (needKinds.every((k) => kinds.includes(k))) {
      satisfiedTargets.push(target);
    } else {
      missingTargets.push(target);
    }
  }

  const verifiableCount = satisfiedTargets.length + missingTargets.length;
  const ready =
    missingTargets.length === 0 &&
    (verifiableCount > 0 ? true : kinds.includes("chromium"));

  return {
    browsersPath,
    browserKinds: kinds,
    entryCount: info?.entryCount ?? 0,
    requestedTargets,
    satisfiedTargets,
    missingTargets,
    unverifiableTargets,
    ready
  };
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** tools 目录实物探测（hdc / libimobiledevice），不执行耗时的设备命令 */
export async function detectLocalTools(options?: {
  config?: InstallDepsConfig;
  deep?: boolean;
}): Promise<LocalToolsDetect> {
  const relativeDir = normalizeToolsRelativeSegment(
    options?.config?.dependencies?.toolsDir?.trim() || "tools"
  );
  const toolsDir =
    (await resolveAdaToolsDir({ relativeDir })) ?? (await resolveDefaultToolsDir({ relativeDir }));
  const hdcPath = toolsDir ? resolveHdcExecutable(toolsDir) : null;
  const hdcPresent = hdcPath ? await fileExists(hdcPath) : false;
  const libimobiledeviceReady = toolsDir
    ? (await fileExists(resolveLibimobiledeviceExecutable(toolsDir, "iproxy"))) &&
      (await fileExists(resolveLibimobiledeviceExecutable(toolsDir, "idevice_id")))
    : false;

  let adbOnPath = false;
  let ideviceinstallerOnPath = false;
  if (options?.deep) {
    adbOnPath = await probeCommandExists("adb");
    ideviceinstallerOnPath = await probeCommandExists("ideviceinstaller");
  }

  return {
    toolsDir,
    hdcPath,
    hdcPresent,
    libimobiledeviceReady,
    adbOnPath,
    ideviceinstallerOnPath
  };
}

/** 影响探测结果的环境指纹：任一变化即作废缓存 */
export function localEnvFingerprint(options?: DetectLocalEnvOptions): string {
  const parts = [
    process.platform,
    process.arch,
    resolveGlobalAdaHomeSync(),
    process.env.PLAYWRIGHT_BROWSERS_PATH?.trim() ?? "",
    process.env.ADA_DEPS_INSTALL_ROOT?.trim() ?? "",
    process.env.ADA_TOOLS_DIR?.trim() ?? "",
    process.env.NODE_PATH?.trim() ?? "",
    process.env.ADA_PLAYWRIGHT_VERSION?.trim() ?? "",
    process.env.ADA_HYPIUM_DRIVER_VERSION?.trim() ?? "",
    normalizePlaywrightTargets(options?.config, options?.playwrightTargetsOverride).join(","),
    options?.deep ? "deep" : "fast"
  ];
  return parts.map((p) => String(p).replace(/\|/g, "/")).join("|");
}

let detectCache: LocalEnvDetectResult | undefined;

export function invalidateLocalEnvDetectCache(): void {
  detectCache = undefined;
}

/**
 * 聚合本机依赖实物探测：npm 包（含版本/来源）、Playwright 浏览器目标、tools 可执行文件。
 * 结果带 TTL + 环境指纹缓存，供 isInstallScopeComplete / 诊断复用。
 */
export async function detectLocalEnv(
  options?: DetectLocalEnvOptions
): Promise<LocalEnvDetectResult> {
  const fingerprint = localEnvFingerprint(options);
  const ttl = localEnvDetectTtlMs();
  if (
    !options?.fresh &&
    detectCache &&
    detectCache.fingerprint === fingerprint &&
    Date.now() - detectCache.detectedAt < ttl
  ) {
    return detectCache;
  }

  await ensurePackageResolution();

  const [playwright, tools] = await Promise.all([
    detectPlaywrightBrowsers({
      config: options?.config,
      playwrightTargetsOverride: options?.playwrightTargetsOverride
    }),
    detectLocalTools({ config: options?.config, deep: options?.deep })
  ]);

  const result: LocalEnvDetectResult = {
    fingerprint,
    detectedAt: Date.now(),
    deep: options?.deep === true,
    packages: {
      playwright: detectPackage("playwright"),
      "hypium-driver": detectPackage("hypium-driver")
    },
    playwright,
    tools
  };
  detectCache = result;
  return result;
}

/** 诊断用的单行摘要 */
export function formatLocalEnvDetectLines(result: LocalEnvDetectResult): string[] {
  const lines: string[] = [];
  for (const name of Object.keys(result.packages) as DetectedPackageName[]) {
    const p = result.packages[name];
    lines.push(
      p.available
        ? `${name}@${p.version ?? "unknown"} (${p.source}${p.versionSatisfied ? "" : `, expected ${p.expectedVersion}`})`
        : `${name}: missing`
    );
  }
  lines.push(
    `playwright-browsers: ${result.playwright.ready ? "ready" : "missing"} [${result.playwright.browserKinds.join(", ") || "none"}] @ ${result.playwright.browsersPath}` +
      (result.playwright.missingTargets.length > 0
        ? ` missing=${result.playwright.missingTargets.join(",")}`
        : "")
  );
  lines.push(
    `tools: dir=${result.tools.toolsDir ?? "none"} hdc=${result.tools.hdcPresent ? "ok" : "missing"} libimobiledevice=${result.tools.libimobiledeviceReady ? "ok" : "missing"}` +
      (result.deep
        ? ` adb=${result.tools.adbOnPath ? "ok" : "missing"} ideviceinstaller=${result.tools.ideviceinstallerOnPath ? "ok" : "missing"}`
        : "")
  );
  return lines;
}

export function resolveToolsRelativeDir(config?: InstallDepsConfig): string {
  return path.basename(
    normalizeToolsRelativeSegment(config?.dependencies?.toolsDir?.trim() || "tools")
  );
}