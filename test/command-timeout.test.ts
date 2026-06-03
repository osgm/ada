import test from "node:test";
import assert from "node:assert/strict";
import {
  CommandTimeoutError,
  DEFAULT_COMMAND_TIMEOUT_MS,
  raceCommandTimeout,
  resolveCommandTimeoutMs,
  resolveLocatorTimeoutMs,
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

test("resolveLocatorTimeoutMs: caps and payload.timeoutMs", () => {
  assert.equal(resolveLocatorTimeoutMs({ locatorTimeoutMs: 2000 }), 2000);
  assert.equal(resolveLocatorTimeoutMs({ timeoutMs: 12_000 }), 8000);
  assert.equal(resolveLocatorTimeoutMs({}), 4000);
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
