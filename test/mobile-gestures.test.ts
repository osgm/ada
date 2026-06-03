import assert from "node:assert/strict";
import test from "node:test";
import { resolveSwipeDurationMs, SWIPE_DURATION_MS } from "@ada/driver-rpc";
import {
  computePinchFingerEnds,
  resolvePinchDistance,
  resolvePinchGesture
} from "../scripts/lib/pinch-coords.mjs";
import {
  resolveSwipeEndpoints,
  resolveSwipePoint,
  SWIPE_POINT_PRESETS
} from "../scripts/lib/swipe-coords.mjs";

const screen = { width: 1080, height: 2400 };

test("resolveSwipePoint: default pixels", () => {
  assert.deepEqual(resolveSwipePoint([100, 200], screen), [100, 200]);
});

test("resolveSwipePoint: relative ratios", () => {
  assert.deepEqual(resolveSwipePoint([0.5, 0.5], screen, { relative: true }), [540, 1200]);
});

test("resolveSwipePoint: percent axis", () => {
  assert.deepEqual(resolveSwipePoint(["6%", "50%"], screen), [65, 1200]);
});

test("resolveSwipePoint: named placeholder", () => {
  assert.deepEqual(resolveSwipePoint("leftMiddle", screen, { relative: true }), [
    Math.round(0.06 * 1080),
    1200
  ]);
});

test("resolveSwipeEndpoints: preset keys", () => {
  const r = resolveSwipeEndpoints("rightMiddle", "leftMiddle", screen, { relative: true });
  assert.deepEqual(r.from, [
    Math.round(SWIPE_POINT_PRESETS.rightMiddle[0] * screen.width),
    Math.round(SWIPE_POINT_PRESETS.rightMiddle[1] * screen.height)
  ]);
});

test("resolveSwipeDurationMs: preset fast/slow", () => {
  assert.equal(resolveSwipeDurationMs({ swipePreset: "fast" }), SWIPE_DURATION_MS.fast);
  assert.equal(resolveSwipeDurationMs({ swipeSpeed: "slow" }), SWIPE_DURATION_MS.slow);
  assert.equal(resolveSwipeDurationMs({ swipePreset: "快" }), SWIPE_DURATION_MS.fast);
});

test("resolveSwipeDurationMs: durationMs beats speed", () => {
  assert.equal(resolveSwipeDurationMs({ durationMs: 150, speed: 800 }), 150);
});

test("resolveSwipeDurationMs: speed legacy for harmony", () => {
  assert.equal(resolveSwipeDurationMs({ speed: 500 }), 500);
});

test("resolvePinchDistance: pixels vs relative", () => {
  assert.equal(resolvePinchDistance(80, screen), 80);
  assert.equal(resolvePinchDistance(0.1, screen, true), Math.round(0.1 * 1080));
});

test("computePinchFingerEnds: pinchIn moves toward center", () => {
  const ends = computePinchFingerEnds([200, 1200], [880, 1200], 60, true);
  assert.ok(ends.finger1End[0] > ends.finger1Start[0]);
  assert.ok(ends.finger2End[0] < ends.finger2Start[0]);
});

test("resolvePinchGesture: relative ratio fingers", () => {
  const ends = resolvePinchGesture([0.2, 0.5], [0.8, 0.5], 0.06, screen, {
    relative: true,
    pinchIn: true
  });
  assert.deepEqual(ends.finger1Start, [216, 1200]);
  assert.deepEqual(ends.finger2Start, [864, 1200]);
  assert.ok(ends.finger1End[0] > ends.finger1Start[0]);
});
