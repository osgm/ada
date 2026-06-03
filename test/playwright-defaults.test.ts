import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlaywrightBringToFront, resolvePlaywrightHeadless } from "@ada/driver-rpc";

test("resolvePlaywrightHeadless: default visible (headed)", () => {
  const prev = process.env.ADA_PLAYWRIGHT_HEADLESS;
  delete process.env.ADA_PLAYWRIGHT_HEADLESS;
  assert.equal(resolvePlaywrightHeadless({}), false);
  assert.equal(resolvePlaywrightHeadless({ headless: true }), true);
  process.env.ADA_PLAYWRIGHT_HEADLESS = "true";
  assert.equal(resolvePlaywrightHeadless({}), true);
  if (prev === undefined) delete process.env.ADA_PLAYWRIGHT_HEADLESS;
  else process.env.ADA_PLAYWRIGHT_HEADLESS = prev;
});

test("resolvePlaywrightBringToFront: default true", () => {
  assert.equal(resolvePlaywrightBringToFront({}), true);
  assert.equal(resolvePlaywrightBringToFront({ bringToFront: false }), false);
});
