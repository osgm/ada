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

test("tapAtPointWithFallback uses drag when wda/tap/0 is unsupported", async () => {
  const calls: string[] = [];
  const wdaFetch = async (_method: string, url: string) => {
    calls.push(url);
    if (url.endsWith("/wda/tap/0") || url.endsWith("/wda/tap")) {
      return { ok: false, raw: { message: "unknown command" } };
    }
    if (url.endsWith("/wda/dragfromtoforduration")) {
      return { ok: true };
    }
    return { ok: false };
  };
  const mode = await tapAtPointWithFallback(wdaFetch, "http://127.0.0.1:8100", "sess-1", [10, 20]);
  assert.equal(mode, "drag-tap");
  assert.ok(calls[0]!.endsWith("/wda/tap/0"));
  assert.ok(calls.some((u) => u.endsWith("/wda/dragfromtoforduration")));
});

test("tapAtPointWithFallback falls back to W3C actions when drag fails", async () => {
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
  assert.equal(calls.length, 4);
});
