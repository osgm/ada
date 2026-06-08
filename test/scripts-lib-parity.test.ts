import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SWIPE_DURATION_MS,
  SWIPE_POINT_PRESETS,
  fillSearchPayloadFromArg,
  resolveSwipeDurationMs,
  resolveSwipePoint
} from "@ada/driver-rpc";
import { fillSearchPayloadFromArg as fillSearchFromScripts } from "../scripts/lib/fill-search-options.mjs";
import { SWIPE_DURATION_MS as SCRIPT_DURATION } from "../scripts/lib/swipe-duration.mjs";
import { SWIPE_POINT_PRESETS as SCRIPT_PRESETS, resolveSwipePoint as resolveSwipePointScripts } from "../scripts/lib/swipe-coords.mjs";
import { resolveSwipeDurationMs as resolveSwipeDurationMsScripts } from "../scripts/lib/swipe-duration.mjs";

const screen = { width: 1080, height: 2400 };

describe("scripts/lib vs @ada/driver-rpc parity", () => {
  it("presets match", () => {
    assert.deepEqual(SCRIPT_PRESETS, SWIPE_POINT_PRESETS);
    assert.deepEqual(SCRIPT_DURATION, SWIPE_DURATION_MS);
  });

  it("resolveSwipePoint agrees on named presets", () => {
    const cases = ["left", "right", "center"] as const;
    for (const name of cases) {
      assert.deepEqual(
        resolveSwipePointScripts(name, screen, { relative: true }),
        resolveSwipePoint(name, screen, { relative: true })
      );
    }
  });

  it("resolveSwipeDurationMs agrees on presets", () => {
    assert.equal(resolveSwipeDurationMsScripts({ swipePreset: "fast" }), resolveSwipeDurationMs({ swipePreset: "fast" }));
    assert.equal(
      resolveSwipeDurationMsScripts({ durationMs: 500 }),
      resolveSwipeDurationMs({ durationMs: 500 })
    );
  });

  it("fillSearchPayloadFromArg agrees", () => {
    const inputs: unknown[] = ["搜索", ["a", "b"], { entryHints: ["Go"], strict: true }];
    for (const input of inputs) {
      assert.deepEqual(fillSearchFromScripts(input as never), fillSearchPayloadFromArg(input as never));
    }
  });
});
