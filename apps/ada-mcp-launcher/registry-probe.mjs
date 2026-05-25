/**
 * 零依赖 npm registry 测速（与 ada-mcp-server/scripts/registry-probe.mjs 保持同步）
 */
export const DEFAULT_NPM_REGISTRY_CANDIDATES = [
  "https://registry.npmmirror.com",
  "https://mirrors.cloud.tencent.com/npm",
  "https://repo.huaweicloud.com/repository/npm",
  "https://registry.npmjs.org"
];

function normalizeRegistryUrl(url) {
  return String(url).replace(/\/$/, "");
}

export function registryCandidateList(extraEnv) {
  const primary = normalizeRegistryUrl(
    process.env.ADA_NPM_PROXY_REGISTRY?.trim() || DEFAULT_NPM_REGISTRY_CANDIDATES[0]
  );
  const extra = extraEnv?.trim()
    ? extraEnv.split(",").map((x) => normalizeRegistryUrl(x.trim())).filter(Boolean)
    : process.env.ADA_REGISTRY_CANDIDATES?.trim()
      ? process.env.ADA_REGISTRY_CANDIDATES.split(",").map((x) => normalizeRegistryUrl(x.trim())).filter(Boolean)
      : [];
  const ordered = [primary, ...DEFAULT_NPM_REGISTRY_CANDIDATES, ...extra];
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

async function probeRegistryLatency(registry) {
  const target = `${normalizeRegistryUrl(registry)}/appium`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(target, { method: "GET", signal: controller.signal });
    if (!response.ok) return null;
    return Date.now() - started;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function detectBestRegistry(candidates = registryCandidateList()) {
  const probeResults = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      latency: await probeRegistryLatency(candidate)
    }))
  );
  let best = candidates[0] ?? DEFAULT_NPM_REGISTRY_CANDIDATES[0];
  let bestLatency = Number.POSITIVE_INFINITY;
  let bestPriority = Number.POSITIVE_INFINITY;
  for (const { candidate, latency } of probeResults) {
    if (latency === null) continue;
    const priority = candidates.indexOf(candidate);
    const prio = priority >= 0 ? priority : Number.POSITIVE_INFINITY;
    if (latency < bestLatency || (latency === bestLatency && prio < bestPriority)) {
      best = candidate;
      bestLatency = latency;
      bestPriority = prio;
    }
  }
  return { best: normalizeRegistryUrl(best), candidates, probeResults };
}

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
