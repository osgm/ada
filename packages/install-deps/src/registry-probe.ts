import {
  DEFAULT_NPM_REGISTRY_CANDIDATES,
  formatDownloadProbeLine,
  pickBestDownloadProbe,
  probeDownloadSample
} from "@ada/download-probe";
import { PINNED_PLAYWRIGHT_VERSION as PINNED_PW } from "./pinned-playwright-version.js";

const PINNED_PLAYWRIGHT_VERSION = process.env.ADA_PLAYWRIGHT_VERSION?.trim() || PINNED_PW;

function normalizeRegistryUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function registryCandidateList(
  extraEnv?: string,
  configCandidates?: string[]
): string[] {
  const fromConfig = Array.isArray(configCandidates)
    ? configCandidates.map((x) => normalizeRegistryUrl(String(x).trim())).filter(Boolean)
    : [];
  const extra = extraEnv?.trim()
    ? extraEnv.split(",").map((x) => normalizeRegistryUrl(x.trim())).filter(Boolean)
    : process.env.ADA_REGISTRY_CANDIDATES?.trim()
      ? process.env.ADA_REGISTRY_CANDIDATES.split(",").map((x) => normalizeRegistryUrl(x.trim())).filter(Boolean)
      : [];
  const ordered = [...fromConfig, ...DEFAULT_NPM_REGISTRY_CANDIDATES, ...extra];
  const forced = process.env.ADA_NPM_PROXY_REGISTRY?.trim();
  if (forced) {
    ordered.unshift(normalizeRegistryUrl(forced));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of ordered) {
    const n = normalizeRegistryUrl(url);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function npmRegistryPackagePath(packageName: string): string {
  const name = packageName.trim();
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash < 0) {
      return `/${encodeURIComponent(name)}`;
    }
    return `/${name.slice(0, slash)}%2F${name.slice(slash + 1)}`;
  }
  return `/${name}`;
}

function registryTarballUrl(registry: string, packageName: string, version: string): string {
  const base = normalizeRegistryUrl(registry);
  const pkg = packageName.trim() || "playwright";
  const ver = version.trim() || PINNED_PLAYWRIGHT_VERSION;
  const tarballName = pkg.includes("/") ? pkg.slice(pkg.indexOf("/") + 1) : pkg;
  return `${base}${npmRegistryPackagePath(pkg)}/-/${tarballName}-${ver}.tgz`;
}

export async function detectBestRegistry(
  candidates = registryCandidateList(),
  samplePackage = "playwright",
  onLogLine?: (line: string) => void
): Promise<{ best: string; probeResults: Array<{ candidate: string; speedKBps: number | null }> }> {
  const pkg = samplePackage.trim() || "playwright";
  onLogLine?.(`[deps] npm registry probe parallel candidates=${candidates.length}`);
  const probeResults = await Promise.all(
    candidates.map(async (candidate) => {
      const probe = await probeDownloadSample(registryTarballUrl(candidate, pkg, PINNED_PLAYWRIGHT_VERSION));
      onLogLine?.(formatDownloadProbeLine("[deps]", candidate, probe));
      return { candidate, probe };
    })
  );
  const bestRow = pickBestDownloadProbe(probeResults, (c) => candidates.indexOf(c));
  const best = bestRow?.candidate ?? candidates[0] ?? DEFAULT_NPM_REGISTRY_CANDIDATES[0];
  return {
    best: normalizeRegistryUrl(best),
    probeResults: probeResults.map(({ candidate, probe }) => ({
      candidate,
      speedKBps: probe?.speedKBps ?? null
    }))
  };
}
