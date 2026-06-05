/**
 * Playwright 浏览器 CDN 下载测速（与 ada-mcp-server/scripts/playwright-probe.mjs 保持同步）
 */
import { pickBestDownloadProbe, probeDownloadSample } from "./download-probe.mjs";
import { DEFAULT_PLAYWRIGHT_HOST_CANDIDATES } from "./mirror-candidates.mjs";
import { isMcpFastStartEnv, probeDownloadTimeoutMs, registryMetaFetchTimeoutMs } from "./probe-env.mjs";

export { DEFAULT_PLAYWRIGHT_HOST_CANDIDATES };

const PINNED_PLAYWRIGHT_VERSION = process.env.ADA_PLAYWRIGHT_VERSION?.trim() || "1.59.1";

/** 测速用 Chromium 构建号（zip 路径），非 npm 包版本 */
export async function resolveChromiumBrowserVersionForProbe() {
  const fromEnv = process.env.ADA_PLAYWRIGHT_BROWSER_VERSION?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const { createRequire } = await import("node:module");
    const { readFileSync } = await import("node:fs");
    const require = createRequire(import.meta.url);
    const browsersPath = require.resolve("playwright-core/browsers.json");
    const parsed = JSON.parse(readFileSync(browsersPath, "utf8"));
    const chromium = parsed.browsers?.find((b) => b.name === "chromium");
    const v = String(chromium?.browserVersion ?? "").trim();
    if (v) {
      return v;
    }
  } catch {
    // playwright 尚未安装
  }
  const pwVersion = PINNED_PLAYWRIGHT_VERSION;
  const sources = [
    `https://unpkg.com/playwright-core@${pwVersion}/browsers.json`,
    `https://cdn.jsdelivr.net/npm/playwright-core@${pwVersion}/browsers.json`
  ];
  for (const url of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), registryMetaFetchTimeoutMs());
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        continue;
      }
      const parsed = await response.json();
      const chromium = parsed.browsers?.find((b) => b.name === "chromium");
      const v = String(chromium?.browserVersion ?? "").trim();
      if (v) {
        return v;
      }
    } catch {
      // try next mirror
    }
  }
  return "";
}

function normalizeHostUrl(url) {
  return String(url).replace(/\/$/, "");
}

export function playwrightProbeUrls(host) {
  const h = normalizeHostUrl(host);
  if (h.includes("npmmirror.com/mirrors/playwright")) {
    return [h, "https://cdn.npmmirror.com/binaries/playwright"];
  }
  return [h];
}

function playwrightChromiumZipUrl(host, browserVersion) {
  const h = normalizeHostUrl(host);
  const base =
    h.includes("cdn.npmmirror.com/binaries/playwright") || h.endsWith("/binaries/playwright")
      ? "https://cdn.npmmirror.com/binaries/playwright"
      : h.includes("npmmirror.com") && !h.includes("/mirrors/playwright")
        ? "https://npmmirror.com/mirrors/playwright"
        : h;
  const plat =
    process.platform === "darwin" ? "mac-arm64" : process.platform === "linux" ? "linux64" : "win64";
  const zip =
    plat === "mac-arm64"
      ? "chrome-mac-arm64.zip"
      : plat === "linux64"
        ? "chrome-linux64.zip"
        : "chrome-win64.zip";
  return `${base}/builds/cft/${browserVersion}/${plat}/${zip}`;
}

export function playwrightHostCandidateList() {
  const configured = normalizeHostUrl(
    process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim() || DEFAULT_PLAYWRIGHT_HOST_CANDIDATES[0]
  );
  const extra = process.env.ADA_PLAYWRIGHT_HOST_CANDIDATES?.trim()
    ? process.env.ADA_PLAYWRIGHT_HOST_CANDIDATES.split(",").map((x) => normalizeHostUrl(x.trim())).filter(Boolean)
    : [];
  const ordered = [configured, ...DEFAULT_PLAYWRIGHT_HOST_CANDIDATES, ...extra];
  const seen = new Set();
  const out = [];
  for (const url of ordered) {
    const n = normalizeHostUrl(url);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

async function probePlaywrightHostDownload(host, browserVersion, timeoutMs) {
  if (!browserVersion) {
    return null;
  }
  let best = null;
  for (const base of playwrightProbeUrls(host)) {
    const url = playwrightChromiumZipUrl(base, browserVersion);
    const probe = await probeDownloadSample(url, { timeoutMs });
    if (probe && (!best || probe.speedKBps > best.speedKBps)) {
      best = probe;
    }
  }
  return best;
}

export async function detectBestPlaywrightHost(candidates = playwrightHostCandidateList()) {
  const browserVersion = await resolveChromiumBrowserVersionForProbe();
  const timeoutMs = probeDownloadTimeoutMs();
  const probeResults = await Promise.all(
    candidates.map(async (candidate) => {
      const probe = await probePlaywrightHostDownload(candidate, browserVersion, timeoutMs);
      return { candidate, probe };
    })
  );
  const bestRow = pickBestDownloadProbe(probeResults, (c) => candidates.indexOf(c));
  const best = bestRow?.candidate ?? candidates[0] ?? DEFAULT_PLAYWRIGHT_HOST_CANDIDATES[0];
  return {
    best: normalizeHostUrl(best),
    browserVersion: browserVersion || null,
    candidates,
    probeResults: probeResults.map(({ candidate, probe }) => ({
      candidate,
      latency: probe?.durationMs ?? null,
      speedKBps: probe?.speedKBps ?? null,
      bytesRead: probe?.bytesRead ?? null
    }))
  };
}
