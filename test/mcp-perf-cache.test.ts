import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  invalidateDependencyHealthCache,
  type GetDependencyHealthOptions
} from "../packages/install-deps/src/index.ts";
import { invalidateRuntimePreflightCache } from "../apps/ada-mcp-server/src/mcp-runtime-preflight.ts";

describe("mcp perf cache exports", () => {
  it("invalidateDependencyHealthCache is callable", () => {
    invalidateDependencyHealthCache();
    assert.ok(true);
  });

  it("invalidateRuntimePreflightCache is callable", () => {
    invalidateRuntimePreflightCache();
    invalidateRuntimePreflightCache("web");
    invalidateRuntimePreflightCache("android");
    assert.ok(true);
  });

  it("GetDependencyHealthOptions shape supports harmony toggle", () => {
    const opts: GetDependencyHealthOptions = { includeHarmony: false, fresh: true };
    assert.equal(opts.includeHarmony, false);
    assert.equal(opts.fresh, true);
  });
});
