import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NAVIGATION_TIMEOUT_MS } from "@ada/driver-rpc";
import { resolveGotoOptions } from "../plugins/driver-playwright/src/web-navigation.ts";
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

test("navigate / long precondition timeout is not recoverable (releases connection)", () => {
  const err = new Error("page.goto: Timeout 75000ms exceeded");
  assert.equal(isRecoverableInteractionError(err, "navigate"), false);
  assert.equal(isRecoverableInteractionError(err, "reload"), false);
  assert.equal(isRecoverableInteractionError(err, "click"), false);
  assert.equal(isRecoverableInteractionError(new Error("Timeout 2500ms exceeded"), "click"), true);
});
