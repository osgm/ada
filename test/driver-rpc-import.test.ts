import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCommandEnvelope,
  normalizeCommandName,
  MOBILE_RECIPE_ACTIONS
} from "@ada/driver-rpc";

test("@ada/driver-rpc main entry imports", () => {
  assert.equal(normalizeCommandName("home"), "pressHome");
  assert.deepEqual([...MOBILE_RECIPE_ACTIONS], ["dump_ui", "tap_search", "fill_search"]);
  const out = normalizeCommandEnvelope({
    requestId: "r1",
    sessionId: "s1",
    platform: "harmony",
    command: "recipe",
    payload: { action: "fill_search", text: "x" }
  });
  assert.equal(out.command, "custom");
});
