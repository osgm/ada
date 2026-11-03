import test from "node:test";
import assert from "node:assert/strict";
import {
  CommandTimeoutError,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_NAVIGATION_TIMEOUT_MS,
  NAVIGATION_COMMAND_TIMEOUT_BUFFER_MS,
  raceCommandTimeout,
  resolveBatchBudgetMs,
  resolveBatchStepTimeoutMs,
  resolveCommandTimeoutMs,
  resolveLocatorTimeoutMs,
  resolveNavigationTimeoutMs,
  resolveSubOperationTimeoutMs
} from "@ada/driver-rpc";

test("resolveCommandTimeoutMs: payload, env, default", () => {
  const prev = process.env.ADA_COMMAND_TIMEOUT_MS;
  delete process.env.ADA_COMMAND_TIMEOUT_MS;
  assert.equal(resolveCommandTimeoutMs({ commandTimeoutMs: 5000 }), 5000);
  assert.equal(resolveCommandTimeoutMs({}), DEFAULT_COMMAND_TIMEOUT_MS);
  process.env.ADA_COMMAND_TIMEOUT_MS = "60000";
  assert.equal(resolveCommandTimeoutMs({}), 60000);
  if (prev === undefined) delete process.env.ADA_COMMAND_TIMEOUT_MS;
  else process.env.ADA_COMMAND_TIMEOUT_MS = prev;
});

test("resolveNavigationTimeoutMs defaults to >=60s for login walls", () => {
  const prev = process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS;
  delete process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS;
  assert.equal(resolveNavigationTimeoutMs({}), DEFAULT_NAVIGATION_TIMEOUT_MS);
  assert.ok(DEFAULT_NAVIGATION_TIMEOUT_MS >= 60_000);
  assert.equal(resolveNavigationTimeoutMs({ navigationTimeoutMs: 90_000 }), 90_000);
  assert.equal(resolveNavigationTimeoutMs({ timeoutMs: 120_000 }), 120_000);
  process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS = "65000";
  assert.equal(resolveNavigationTimeoutMs({}), 65_000);
  if (prev === undefined) delete process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS;
  else process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS = prev;
});

test("resolveCommandTimeoutMs: navigate floors to navigation timeout + buffer", () => {
  const prevCmd = process.env.ADA_COMMAND_TIMEOUT_MS;
  const prevNav = process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS;
  delete process.env.ADA_COMMAND_TIMEOUT_MS;
  delete process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS;
  const expected = DEFAULT_NAVIGATION_TIMEOUT_MS + NAVIGATION_COMMAND_TIMEOUT_BUFFER_MS;
  assert.equal(resolveCommandTimeoutMs({}, "navigate"), expected);
  assert.equal(resolveCommandTimeoutMs({}, "click"), DEFAULT_COMMAND_TIMEOUT_MS);
  assert.equal(
    resolveCommandTimeoutMs({ navigationTimeoutMs: 90_000, commandTimeoutMs: 10_000 }, "navigate"),
    90_000 + NAVIGATION_COMMAND_TIMEOUT_BUFFER_MS
  );
  if (prevCmd === undefined) delete process.env.ADA_COMMAND_TIMEOUT_MS;
  else process.env.ADA_COMMAND_TIMEOUT_MS = prevCmd;
  if (prevNav === undefined) delete process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS;
  else process.env.ADA_WEB_NAVIGATION_TIMEOUT_MS = prevNav;
});

test("resolveLocatorTimeoutMs: caps and payload.timeoutMs", () => {
  assert.equal(resolveLocatorTimeoutMs({ locatorTimeoutMs: 2000 }), 2000);
  assert.equal(resolveLocatorTimeoutMs({ timeoutMs: 12_000 }), 8000);
  assert.equal(resolveLocatorTimeoutMs({}), 2500);
});

test("resolveSubOperationTimeoutMs", () => {
  assert.equal(resolveSubOperationTimeoutMs(30_000, 12_000, 0.5), 15_000);
});

test("raceCommandTimeout: rejects with CommandTimeoutError", async () => {
  await assert.rejects(
    () => raceCommandTimeout(new Promise(() => undefined), 50, "t"),
    CommandTimeoutError
  );
});

test("resolveBatchBudgetMs: explicit timeout and scaled default", () => {
  const prev = process.env.ADA_BATCH_TIMEOUT_MS;
  delete process.env.ADA_BATCH_TIMEOUT_MS;
  assert.equal(resolveBatchBudgetMs({ timeoutMs: 10_000, actionCount: 3, overheadMs: 500 }), 9_500);
  assert.equal(resolveBatchBudgetMs({ timeoutMs: 1_200, actionCount: 3, overheadMs: 500 }), 1_000);
  const scaled = resolveBatchBudgetMs({ actionCount: 2, overheadMs: 500 });
  assert.ok(scaled >= 44_500 && scaled <= 180_000);
  if (prev === undefined) delete process.env.ADA_BATCH_TIMEOUT_MS;
  else process.env.ADA_BATCH_TIMEOUT_MS = prev;
});

test("resolveBatchStepTimeoutMs: remaining + explicit min", () => {
  assert.equal(
    resolveBatchStepTimeoutMs({ remainingMs: 20_000, totalSteps: 4, explicitTimeoutMs: 8_000 }),
    8_000
  );
  assert.equal(resolveBatchStepTimeoutMs({ remainingMs: 2_000, totalSteps: 4, explicitTimeoutMs: 8_000 }), 2_000);
  assert.equal(resolveBatchStepTimeoutMs({ remainingMs: 40_000, totalSteps: 1 }), 40_000);
});
