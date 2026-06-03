import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHarmonyPinchPointerMatrix,
  executeHarmonyPinch
} from "../plugins/driver-harmony/src/harmony-pinch.ts";

class MockPoint {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

class MockPointAction {
  static mergeMultiPointAction(actions: MockPointAction[]) {
    return { fingers: actions.length, steps: actions.reduce((n, a) => n + a.moves, 0) };
  }
  moves = 0;
  down(_p: MockPoint, _ms?: number) {
    this.moves += 1;
    return this;
  }
  move_to(_p: MockPoint, _ms?: number) {
    this.moves += 1;
    return this;
  }
}

const ends = {
  finger1Start: [238, 912] as [number, number],
  finger1End: [293, 964] as [number, number],
  finger2Start: [842, 1488] as [number, number],
  finger2End: [787, 1436] as [number, number]
};

test("buildHarmonyPinchPointerMatrix: merges two finger paths", () => {
  const matrix = buildHarmonyPinchPointerMatrix(
    { PointAction: MockPointAction as never, Point: MockPoint as never },
    ends,
    500
  ) as { fingers: number; steps: number };
  assert.equal(matrix.fingers, 2);
  assert.ok(matrix.steps >= 2);
});

test("executeHarmonyPinch: uses injectMultiPointerAction when available", async () => {
  let injected = false;
  await executeHarmonyPinch(
    {
      swipe: async () => {
        throw new Error("should not swipe");
      },
      injectMultiPointerAction: async () => {
        injected = true;
      }
    },
    ends,
    500,
    { PointAction: MockPointAction as never, Point: MockPoint as never }
  );
  assert.equal(injected, true);
});

test("executeHarmonyPinch: sequential swipe fallback without multiPointer API", async () => {
  const swipes: string[] = [];
  const result = await executeHarmonyPinch(
    {
      swipe: async (x1, y1, x2, y2) => {
        swipes.push(`${x1},${y1}->${x2},${y2}`);
      }
    },
    ends,
    500
  );
  assert.equal(result.mode, "sequential");
  assert.equal(swipes.length, 2);
});
