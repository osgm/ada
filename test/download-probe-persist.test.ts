import assert from "node:assert/strict";
import {
  isMirrorProbeFresh,
  mirrorProbeTtlMs,
  resolveDefaultPlaywrightDownloadHost,
  shouldProbeNpmRegistry,
  shouldProbePlaywrightCdn
} from "@ada/install-deps";

const prev = { ...process.env };

function restore() {
  for (const key of Object.keys(process.env)) {
    if (!(key in prev)) delete process.env[key];
  }
  Object.assign(process.env, prev);
}

try {
  delete process.env.ADA_MCP_LAUNCHER_REGISTRY;
  delete process.env.PLAYWRIGHT_DOWNLOAD_HOST;
  delete process.env.ADA_PLAYWRIGHT_DOWNLOAD_HOST;
  delete process.env.ADA_MCP_FORCE_PLAYWRIGHT_PROBE;
  delete process.env.ADA_MCP_FORCE_REGISTRY_PROBE;
  delete process.env.ADA_MCP_REGISTRY;
  delete process.env.ADA_NPM_REGISTRY;
  delete process.env.ADA_NPM_PROXY_REGISTRY;
  delete process.env.ADA_MCP_LAUNCHER_RAN;
  delete process.env.ADA_MCP_REGISTRY_PROBE_TTL_MS;
  delete process.env.ADA_DEPS_MIRROR_PROBE_TTL_MS;

  assert.equal(
    resolveDefaultPlaywrightDownloadHost("https://registry.npmmirror.com"),
    "https://cdn.npmmirror.com/binaries/playwright"
  );
  assert.equal(
    resolveDefaultPlaywrightDownloadHost("https://registry.npmjs.org"),
    "https://cdn.playwright.dev"
  );

  assert.ok(mirrorProbeTtlMs() === 5 * 60 * 1000);

  const freshIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  assert.equal(isMirrorProbeFresh(freshIso), true);
  assert.equal(isMirrorProbeFresh(staleIso), false);
  assert.equal(isMirrorProbeFresh(undefined), false);

  // 新鲜 measured → 不测 registry
  assert.equal(
    shouldProbeNpmRegistry({
      launcherRegistryHint: "",
      persistedRegistry: "https://registry.npmmirror.com",
      force: false,
      probedAt: freshIso,
      source: "measured"
    }),
    false
  );
  // 过期 → 重测
  assert.equal(
    shouldProbeNpmRegistry({
      launcherRegistryHint: "",
      persistedRegistry: "https://registry.npmmirror.com",
      force: false,
      probedAt: staleIso,
      source: "measured"
    }),
    true
  );
  // 无缓存 → 测
  assert.equal(
    shouldProbeNpmRegistry({
      launcherRegistryHint: "",
      persistedRegistry: "",
      force: false
    }),
    true
  );
  // launcher 刚写入且 TTL 内 → 不测
  assert.equal(
    shouldProbeNpmRegistry({
      launcherRegistryHint: "https://registry.npmmirror.com",
      persistedRegistry: "https://registry.npmmirror.com",
      force: false,
      probedAt: freshIso,
      source: "launcher"
    }),
    false
  );

  // 启发式 host → 仍测 Playwright CDN
  assert.equal(
    shouldProbePlaywrightCdn({
      force: false,
      hasHost: true,
      explicitHost: false,
      source: "heuristic"
    }),
    true
  );
  // 实测且新鲜 → 不测
  assert.equal(
    shouldProbePlaywrightCdn({
      force: false,
      explicitHost: false,
      source: "measured",
      probedAt: freshIso
    }),
    false
  );
  // 用户钉死 → 不测
  assert.equal(
    shouldProbePlaywrightCdn({
      force: false,
      explicitHost: true,
      source: "explicit"
    }),
    false
  );
  // force → 测
  assert.equal(shouldProbePlaywrightCdn({ force: true, explicitHost: true }), true);

  console.log("download-probe-persist.test.ts ok");
} finally {
  restore();
}
