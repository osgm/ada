import test from "node:test";
import assert from "node:assert/strict";
import { shouldCreateCdpContext } from "../plugins/driver-playwright/src/runtime.ts";

test("shouldCreateCdpContext: default isolates with newContext", () => {
  const prev = process.env.ADA_PLAYWRIGHT_REUSE_CDP_CONTEXT;
  delete process.env.ADA_PLAYWRIGHT_REUSE_CDP_CONTEXT;
  try {
    assert.equal(shouldCreateCdpContext({}), true);
    assert.equal(shouldCreateCdpContext({ viewport: null }), true);
  } finally {
    if (prev === undefined) delete process.env.ADA_PLAYWRIGHT_REUSE_CDP_CONTEXT;
    else process.env.ADA_PLAYWRIGHT_REUSE_CDP_CONTEXT = prev;
  }
});

test("shouldCreateCdpContext: reuseCdpContext restores share behavior", () => {
  assert.equal(shouldCreateCdpContext({}, { reuseCdpContext: true }), false);
  assert.equal(shouldCreateCdpContext({ viewport: null }, { reuseCdpContext: true }), false);
  assert.equal(shouldCreateCdpContext({ locale: "zh-CN" }, { reuseCdpContext: true }), true);
});
