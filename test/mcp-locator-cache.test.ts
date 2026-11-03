import assert from "node:assert/strict";
import test from "node:test";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  applyLocatorWarmHint,
  clearLocatorHintCache,
  rememberLocatorSuccess
} from "../apps/ada-mcp-server/src/mcp-locator-cache.ts";

test("applyLocatorWarmHint shortens timeout after a successful locator", () => {
  clearLocatorHintCache();
  const base: CommandEnvelope = {
    requestId: "1",
    sessionId: "s1",
    platform: "web",
    command: "click",
    payload: { locator: { css: "#buy" }, locatorTimeoutMs: 4000 }
  };
  const ok: CommandResult = { requestId: "1", success: true, data: {} };
  rememberLocatorSuccess(base, ok);
  const warmed = applyLocatorWarmHint({ ...base, requestId: "2" });
  assert.equal(warmed.payload?.locatorWarm, true);
  assert.equal(warmed.payload?.locatorTimeoutMs, 1200);
  clearLocatorHintCache();
});

test("applyLocatorWarmHint no-ops without cache hit", () => {
  clearLocatorHintCache();
  const cmd: CommandEnvelope = {
    requestId: "1",
    sessionId: "s2",
    platform: "web",
    command: "click",
    payload: { locator: { css: "#miss" }, locatorTimeoutMs: 3000 }
  };
  const out = applyLocatorWarmHint(cmd);
  assert.equal(out.payload?.locatorWarm, undefined);
  assert.equal(out.payload?.locatorTimeoutMs, 3000);
});
