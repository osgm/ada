import assert from "node:assert/strict";
import {
  resolveDefaultPlaywrightDownloadHost,
  shouldProbeNpmRegistry,
  shouldProbePlaywrightCdn
} from "@ada/install-deps";

const prev = { ...process.env };

function restore() {
  process.env = { ...prev };
}

try {
  delete process.env.ADA_MCP_LAUNCHER_REGISTRY;
  delete process.env.PLAYWRIGHT_DOWNLOAD_HOST;
  assert.equal(
    resolveDefaultPlaywrightDownloadHost("https://registry.npmmirror.com"),
    "https://cdn.npmmirror.com/binaries/playwright"
  );
  assert.equal(
    resolveDefaultPlaywrightDownloadHost("https://registry.npmjs.org"),
    "https://cdn.playwright.dev"
  );

  assert.equal(
    shouldProbeNpmRegistry({
      launcherRegistryHint: "https://registry.npmmirror.com",
      persistedRegistry: "https://registry.npmmirror.com",
      force: false
    }),
    false
  );
  assert.equal(
    shouldProbeNpmRegistry({
      launcherRegistryHint: "",
      persistedRegistry: "",
      force: false
    }),
    true
  );

  assert.equal(shouldProbePlaywrightCdn({ force: false, hasHost: true }), false);
  assert.equal(shouldProbePlaywrightCdn({ force: false, hasHost: false }), false);
  assert.equal(shouldProbePlaywrightCdn({ force: true, hasHost: true }), true);

  console.log("download-probe-persist.test.ts ok");
} finally {
  restore();
}
