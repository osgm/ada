import assert from "node:assert/strict";
import test from "node:test";
import {
  MOBILE_RECIPE_ACTIONS,
  normalizeCommandEnvelope,
  normalizeCommandName,
  normalizePayload
} from "@ada/driver-rpc";

test("normalizeCommandName: aliases", () => {
  assert.equal(normalizeCommandName("terminateApp"), "exitApp");
  assert.equal(normalizeCommandName("fill"), "type");
  assert.equal(normalizeCommandName("tap"), "click");
  assert.equal(normalizeCommandName("home"), "pressHome");
});

test("normalizePayload: appId and durationMs canonical", () => {
  const p = normalizePayload({
    bundleId: "com.example.app",
    speed: 400,
    actionWaitMs: 20_000
  });
  assert.equal(p.appId, "com.example.app");
  assert.equal(p.bundleId, undefined);
  assert.equal(p.durationMs, 400);
  assert.equal(p.waitTimeoutMs, 20_000);
});

test("MOBILE_RECIPE_ACTIONS lists mobile observe/interact recipes", () => {
  assert.deepEqual([...MOBILE_RECIPE_ACTIONS], ["dump_ui", "tap_search", "fill_search", "tap_path"]);
});

test("normalizeCommandEnvelope: recipe expands to custom", () => {
  const out = normalizeCommandEnvelope({
    requestId: "r1",
    sessionId: "s1",
    platform: "harmony",
    command: "recipe",
    payload: { action: "fill_search", text: "AA" }
  });
  assert.equal(out.command, "custom");
  assert.equal((out.payload?.custom as { action?: string })?.action, "fill_search");
  assert.equal(out.payload?.text, "AA");
});
