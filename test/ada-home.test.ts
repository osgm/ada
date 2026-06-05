import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  isFilesystemRootPath,
  resolveGlobalAdaHomeSync,
  resolveUserHomeDirSync
} from "@ada/core-runtime";

test("resolveUserHomeDirSync is not filesystem root", () => {
  const home = resolveUserHomeDirSync();
  assert.equal(isFilesystemRootPath(home), false);
  assert.ok(home.length > 1);
});

test("resolveGlobalAdaHomeSync lives under user home", () => {
  const adaHome = resolveGlobalAdaHomeSync();
  const userHome = resolveUserHomeDirSync();
  assert.equal(isFilesystemRootPath(adaHome), false);
  assert.ok(adaHome.startsWith(userHome));
  assert.ok(adaHome.endsWith(`${path.sep}.ada`) || adaHome.endsWith("/.ada"));
});

test("ADA_HOME=/ is rejected on unix", () => {
  if (process.platform === "win32") {
    return;
  }
  const prev = process.env.ADA_HOME;
  process.env.ADA_HOME = "/";
  try {
    const adaHome = resolveGlobalAdaHomeSync();
    assert.notEqual(adaHome, "/");
    assert.ok(adaHome.includes(".ada"));
  } finally {
    if (prev === undefined) {
      delete process.env.ADA_HOME;
    } else {
      process.env.ADA_HOME = prev;
    }
  }
});
