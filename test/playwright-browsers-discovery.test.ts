import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  discoverPlaywrightBrowsersPath,
  inspectPlaywrightBrowsersDir,
  listPlaywrightBrowsersCandidateDirs
} from "@ada/install-deps";

test("inspectPlaywrightBrowsersDir accepts chromium-* folder", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ada-pw-disc-"));
  try {
    await fs.mkdir(path.join(root, "chromium-1234"), { recursive: true });
    const info = await inspectPlaywrightBrowsersDir(root);
    assert.ok(info);
    assert.equal(info.path, path.resolve(root));
    assert.deepEqual(info.browserKinds, ["chromium"]);
    assert.equal(info.entryCount, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("discoverPlaywrightBrowsersPath picks dir with chromium over empty ada cache", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ada-pw-disc-"));
  try {
    const adaCache = path.join(root, "ada-empty");
    const systemCache = path.join(root, "ms-playwright");
    await fs.mkdir(adaCache, { recursive: true });
    await fs.mkdir(path.join(systemCache, "chromium-9999"), { recursive: true });
    const found = await discoverPlaywrightBrowsersPath([adaCache, systemCache]);
    assert.ok(found);
    assert.equal(found.path, path.resolve(systemCache));
    assert.ok(found.browserKinds.includes("chromium"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("listPlaywrightBrowsersCandidateDirs includes platform ms-playwright path", () => {
  const dirs = listPlaywrightBrowsersCandidateDirs();
  assert.ok(dirs.length >= 2);
  if (process.platform === "win32") {
    assert.ok(dirs.some((d) => d.includes("ms-playwright")));
  } else if (process.platform === "darwin") {
    assert.ok(dirs.some((d) => d.includes("Library") && d.includes("ms-playwright")));
  } else {
    assert.ok(dirs.some((d) => d.includes(".cache") && d.includes("ms-playwright")));
  }
});
