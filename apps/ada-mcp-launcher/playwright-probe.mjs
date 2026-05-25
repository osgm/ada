/**
 * Playwright 浏览器 CDN 测速（与 ada-mcp-server/scripts/playwright-probe.mjs 保持同步）
 */
export const DEFAULT_PLAYWRIGHT_HOST_CANDIDATES = [
  "https://cdn.playwright.dev",
  "https://playwright.azureedge.net",
  "https://npmmirror.com/mirrors/playwright",
  "https://cdn.npmmirror.com/binaries/playwright"
];

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

async function probeUrlLatency(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal });
    if (response.status >= 200 && response.status < 500) return Date.now() - started;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function probePlaywrightHostLatency(host) {
  let best = null;
  for (const url of playwrightProbeUrls(host)) {
    const latency = await probeUrlLatency(url);
    if (latency !== null && (best === null || latency < best)) best = latency;
  }
  return best;
}

export async function detectBestPlaywrightHost(candidates = playwrightHostCandidateList()) {
  const probeResults = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      latency: await probePlaywrightHostLatency(candidate)
    }))
  );
  let best = candidates[0] ?? DEFAULT_PLAYWRIGHT_HOST_CANDIDATES[0];
  let bestLatency = Number.POSITIVE_INFINITY;
  let bestPriority = Number.POSITIVE_INFINITY;
  for (const { candidate, latency } of probeResults) {
    if (latency === null) continue;
    const prio = candidates.indexOf(candidate);
    const priority = prio >= 0 ? prio : Number.POSITIVE_INFINITY;
    if (latency < bestLatency || (latency === bestLatency && priority < bestPriority)) {
      best = candidate;
      bestLatency = latency;
      bestPriority = priority;
    }
  }
  return { best: normalizeHostUrl(best), candidates, probeResults };
}
