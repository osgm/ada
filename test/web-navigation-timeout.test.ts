import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NAVIGATION_TIMEOUT_MS } from "@ada/driver-rpc";
import { resolveGotoOptions, gotoPage } from "../plugins/driver-playwright/src/web-navigation.ts";
import { resolveAutoWaitMs } from "../plugins/driver-playwright/src/playwright-locator.ts";
import { isRecoverableInteractionError } from "../plugins/driver-playwright/src/runtime.ts";

test("resolveGotoOptions uses navigation default >=60s", () => {
  const prev = process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS;
  delete process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS;
  const opts = resolveGotoOptions({});
  assert.equal(opts.waitUntil, "domcontentloaded");
  assert.equal(opts.timeout, DEFAULT_NAVIGATION_TIMEOUT_MS);
  assert.ok(opts.timeout >= 60_000);
  if (prev === undefined) delete process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS;
  else process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS = prev;
});

test("resolveAutoWaitMs defaults to 15s for slow hydration", () => {
  const prev = process.env.ADA_PLAYWRIGHT_AUTO_WAIT_MS;
  delete process.env.ADA_PLAYWRIGHT_AUTO_WAIT_MS;
  assert.equal(resolveAutoWaitMs({}), 15_000);
  assert.equal(resolveAutoWaitMs({ timeoutMs: 90_000 }), 45_000);
  if (prev === undefined) delete process.env.ADA_PLAYWRIGHT_AUTO_WAIT_MS;
  else process.env.ADA_PLAYWRIGHT_AUTO_WAIT_MS = prev;
});

test("gotoPage still succeeds when load event is slow", async () => {
  let loadWait = 0;
  const page = {
    async goto() {
      return undefined;
    },
    async waitForLoadState(_state: string, options?: { timeout?: number }) {
      loadWait = options?.timeout ?? 0;
      throw new Error("Timeout");
    }
  };
  await gotoPage(page, "https://example.com", {});
  assert.equal(loadWait, 15_000);
});

test("navigate / long precondition timeout is not recoverable (releases connection)", () => {
  const err = new Error("page.goto: Timeout 75000ms exceeded");
  assert.equal(isRecoverableInteractionError(err, "navigate"), false);
  assert.equal(isRecoverableInteractionError(err, "reload"), false);
  assert.equal(isRecoverableInteractionError(err, "click"), false);
  assert.equal(isRecoverableInteractionError(new Error("Timeout 2500ms exceeded"), "click"), true);
});
