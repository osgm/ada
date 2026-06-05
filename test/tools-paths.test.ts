import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  isFilesystemRootToolsDir,
  joinWorkspaceToolsDir,
  normalizeToolsRelativeSegment,
  resolveSafeToolsDirForWrite
} from "@ada/install-deps";

test("normalizeToolsRelativeSegment strips leading slash", () => {
  assert.equal(normalizeToolsRelativeSegment("/tools"), "tools");
  assert.equal(normalizeToolsRelativeSegment("\\tools"), "tools");
  assert.equal(normalizeToolsRelativeSegment("tools"), "tools");
});

test("joinWorkspaceToolsDir never returns /tools on unix", () => {
  const joined = joinWorkspaceToolsDir("/", "tools");
  assert.notEqual(joined, path.join(path.parse("/").root, "tools"));
  assert.ok(joined.includes(".ada"));
});

test("isFilesystemRootToolsDir detects /tools", () => {
  if (process.platform === "win32") {
    assert.equal(isFilesystemRootToolsDir("C:\\tools"), true);
  } else {
    assert.equal(isFilesystemRootToolsDir("/tools"), true);
  }
  assert.equal(isFilesystemRootToolsDir(path.join("/Users", "me", "project", "tools")), false);
});

test("resolveSafeToolsDirForWrite redirects /tools to ada home", () => {
  const safe = resolveSafeToolsDirForWrite("/tools", "tools");
  assert.equal(isFilesystemRootToolsDir(safe), false);
  assert.ok(safe.endsWith(`${path.sep}tools`) || safe.endsWith("/tools"));
});
