import test from "node:test";
import assert from "node:assert/strict";
import { buildSinglePointerTapActions, tapAtPointWithFallback } from "@ada/driver-ios";

test("buildSinglePointerTapActions emits pointer down/up at coordinates", () => {
  const actions = buildSinglePointerTapActions(120, 340);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]!.type, "pointer");
  const steps = actions[0]!.actions;
  assert.equal(steps[0]!.x, 120);
  assert.equal(steps[0]!.y, 340);
  assert.equal(steps[1]!.type, "pointerDown");
  assert.equal(steps[3]!.type, "pointerUp");
});

test("tapAtPointWithFallback prefers micro-drag before wda/tap", async () => {
  const calls: string[] = [];
  const wdaFetch = async (_method: string, url: string) => {
    calls.push(url);
    if (url.endsWith("/wda/dragfromtoforduration")) {
      return { ok: true };
    }
    return { ok: false };
  };
  const mode = await tapAtPointWithFallback(wdaFetch, "http://127.0.0.1:8100", "sess-1", [10, 20]);
  assert.equal(mode, "drag-tap");
  assert.ok(calls[0]!.endsWith("/wda/dragfromtoforduration"));
  assert.equal(calls.length, 1);
});

test("tapAtPointWithFallback falls back to W3C actions when earlier paths fail", async () => {
  const calls: string[] = [];
  const wdaFetch = async (_method: string, url: string, body?: unknown) => {
    calls.push(url);
    if (url.endsWith("/actions")) {
      assert.ok(Array.isArray((body as { actions?: unknown[] })?.actions));
      return { ok: true };
    }
    return { ok: false };
  };
  const mode = await tapAtPointWithFallback(wdaFetch, "http://127.0.0.1:8100", "sess-2", [5, 6]);
  assert.equal(mode, "actions-tap");
  // drag → touchAndHold → wda/tap/0 → wda/tap → actions
  assert.equal(calls.length, 5);
  assert.ok(calls[0]!.endsWith("/wda/dragfromtoforduration"));
  assert.ok(calls[1]!.endsWith("/wda/touchAndHold"));
  assert.ok(calls[2]!.endsWith("/wda/tap/0"));
  assert.ok(calls[3]!.endsWith("/wda/tap"));
  assert.ok(calls[4]!.endsWith("/actions"));
});
