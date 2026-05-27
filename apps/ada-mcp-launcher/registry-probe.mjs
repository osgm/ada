/**
 * 零依赖 npm registry 测速（与 ada-mcp-server/scripts/registry-probe.mjs 保持同步）
 */
import { pickBestDownloadProbe, probeDownloadSample } from "./download-probe.mjs";
import { DEFAULT_NPM_REGISTRY_CANDIDATES } from "./mirror-candidates.mjs";

export { DEFAULT_NPM_REGISTRY_CANDIDATES };

function normalizeRegistryUrl(url) {
  return String(url).replace(/\/$/, "");
}

export function registryCandidateList(extraEnv) {
  const extra = extraEnv?.trim()
    ? extraEnv.split(",").map((x) => normalizeRegistryUrl(x.trim())).filter(Boolean)
    : process.env.ADA_REGISTRY_CANDIDATES?.trim()
      ? process.env.ADA_REGISTRY_CANDIDATES.split(",").map((x) => normalizeRegistryUrl(x.trim())).filter(Boolean)
      : [];
  const ordered = [...DEFAULT_NPM_REGISTRY_CANDIDATES, ...extra];
  const forced = process.env.ADA_NPM_PROXY_REGISTRY?.trim();
  if (forced) {
    ordered.unshift(normalizeRegistryUrl(forced));
  }
  const seen = new Set();
  const out = [];
  for (const url of ordered) {
    const n = normalizeRegistryUrl(url);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

const PINNED_PLAYWRIGHT_VERSION = process.env.ADA_PLAYWRIGHT_VERSION?.trim() || "1.59.1";

/** npm registry 包路径（scoped 包为 /@scope%2Fname） */
export function npmRegistryPackagePath(packageName) {
  const name = String(packageName).trim();
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash < 0) {
      return `/${encodeURIComponent(name)}`;
    }
    const scope = name.slice(0, slash);
    const pkg = name.slice(slash + 1);
    return `/${scope}%2F${pkg}`;
  }
  return `/${name}`;
}

function registryTarballUrl(registry, packageName, version) {
  const base = normalizeRegistryUrl(registry);
  const pkg = String(packageName).trim() || "playwright";
  const ver = String(version).trim() || PINNED_PLAYWRIGHT_VERSION;
  const tarballName = pkg.includes("/") ? pkg.slice(pkg.indexOf("/") + 1) : pkg;
  return `${base}${npmRegistryPackagePath(pkg)}/-/${tarballName}-${ver}.tgz`;
}

async function probeRegistryDownload(registry, samplePackage, sampleVersion) {
  const url = registryTarballUrl(registry, samplePackage, sampleVersion);
  return probeDownloadSample(url);
}

export async function detectBestRegistry(candidates = registryCandidateList(), samplePackage) {
  const pkg = samplePackage?.trim() || "playwright";
  const probeResults = [];
  for (const candidate of candidates) {
    const probe = await probeRegistryDownload(candidate, pkg, PINNED_PLAYWRIGHT_VERSION);
    probeResults.push({ candidate, probe });
  }
  const bestRow = pickBestDownloadProbe(probeResults, (c) => candidates.indexOf(c));
  const best = bestRow?.candidate ?? candidates[0] ?? DEFAULT_NPM_REGISTRY_CANDIDATES[0];
  return {
    best: normalizeRegistryUrl(best),
    candidates,
    probeResults: probeResults.map(({ candidate, probe }) => ({
      candidate,
      latency: probe?.durationMs ?? null,
      speedKBps: probe?.speedKBps ?? null,
      bytesRead: probe?.bytesRead ?? null
    }))
  };
}

/**
 * 从指定 registry 读取 dist-tag latest 的版本号（与 pnpm dlx 无 @版本 时一致）
 */
export async function fetchPackageLatestVersion(packageName, registry) {
  const reg = normalizeRegistryUrl(registry);
  const url = `${reg}${npmRegistryPackagePath(packageName)}/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      return undefined;
    }
    const json = await response.json();
    const version = String(json.version ?? "").trim();
    return version || undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** 指定 registry 上是否存在某版本（用于镜像未同步时回退 npmjs） */
export async function fetchPackageVersionExists(packageName, version, registry) {
  const reg = normalizeRegistryUrl(registry);
  const ver = String(version ?? "").trim();
  if (!ver || ver === "latest") {
    return false;
  }
  const url = `${reg}${npmRegistryPackagePath(packageName)}/${encodeURIComponent(ver)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export { normalizeRegistryUrl };
