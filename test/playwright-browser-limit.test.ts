import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPlaywrightBrowserLimit,
  countActivePlaywrightBrowsers
} from "../plugins/driver-playwright/src/runtime.ts";

test("assertPlaywrightBrowserLimit respects ADA_PLAYWRIGHT_MAX_BROWSERS", () => {
  const prev = process.env.ADA_PLAYWRIGHT_MAX_BROWSERS;
  process.env.ADA_PLAYWRIGHT_MAX_BROWSERS = "0";
  try {
    assert.doesNotThrow(() => assertPlaywrightBrowserLimit());
    assert.equal(typeof countActivePlaywrightBrowsers(), "number");
  } finally {
    if (prev === undefined) delete process.env.ADA_PLAYWRIGHT_MAX_BROWSERS;
    else process.env.ADA_PLAYWRIGHT_MAX_BROWSERS = prev;
  }
});
