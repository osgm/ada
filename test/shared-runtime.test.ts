import assert from "node:assert/strict";
import test from "node:test";
import {
  getSharedPluginHost,
  getSharedTaskExecutor,
  peekSharedRuntime,
  resetSharedRuntime
} from "../packages/agent-core/src/shared-runtime.ts";

test("shared runtime returns the same TaskExecutor and PluginHost instances", () => {
  resetSharedRuntime();
  const hostA = getSharedPluginHost();
  const execA = getSharedTaskExecutor();
  const hostB = getSharedPluginHost();
  const execB = getSharedTaskExecutor();
  assert.equal(hostA, hostB);
  assert.equal(execA, execB);
  const peeked = peekSharedRuntime();
  assert.equal(peeked.host, hostA);
  assert.equal(peeked.executor, execA);
  resetSharedRuntime();
  assert.equal(peekSharedRuntime().host, null);
  assert.equal(peekSharedRuntime().executor, null);
});
