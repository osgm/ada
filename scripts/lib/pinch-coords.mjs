/** 双指 pinch 坐标（与 packages/driver-rpc/src/pinch-coords.ts 同步） */
import { resolveSwipePoint } from "./swipe-coords.mjs";

function unitFromTo(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [0, 0];
  return [dx / len, dy / len];
}

export function resolvePinchDistance(distance, screen, relative) {
  const d = Math.max(0, Number(distance) || 0);
  if (relative === true) {
    return Math.round(d * Math.min(screen.width, screen.height));
  }
  return Math.round(d);
}

export function computePinchFingerEnds(finger1, finger2, distancePx, pinchIn) {
  const f1 = [Math.round(finger1[0]), Math.round(finger1[1])];
  const f2 = [Math.round(finger2[0]), Math.round(finger2[1])];
  const center = [Math.round((f1[0] + f2[0]) / 2), Math.round((f1[1] + f2[1]) / 2)];
  const d = Math.max(0, distancePx);
  const towardCenter1 = unitFromTo(f1, center);
  const towardCenter2 = unitFromTo(f2, center);
  const away1 = unitFromTo(center, f1);
  const away2 = unitFromTo(center, f2);
  const dir1 = pinchIn ? towardCenter1 : away1;
  const dir2 = pinchIn ? towardCenter2 : away2;
  return {
    finger1Start: f1,
    finger1End: [Math.round(f1[0] + dir1[0] * d), Math.round(f1[1] + dir1[1] * d)],
    finger2Start: f2,
    finger2End: [Math.round(f2[0] + dir2[0] * d), Math.round(f2[1] + dir2[1] * d)],
    center
  };
}

export function resolvePinchGesture(finger1, finger2, distance, screen, options) {
  const coordOpts = { relative: options.relative === true };
  const f1 = resolveSwipePoint(finger1, screen, coordOpts);
  const f2 = resolveSwipePoint(finger2, screen, coordOpts);
  const distancePx = resolvePinchDistance(distance, screen, coordOpts.relative);
  return computePinchFingerEnds(f1, f2, distancePx, options.pinchIn);
}

export function buildDualPointerPinchActions(ends, durationMs) {
  const ms = Math.max(50, Math.round(durationMs));
  return [
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: ends.finger1Start[0], y: ends.finger1Start[1] },
        { type: "pointerDown", button: 0 },
        { type: "pointerMove", duration: ms, x: ends.finger1End[0], y: ends.finger1End[1] },
        { type: "pointerUp", button: 0 }
      ]
    },
    {
      type: "pointer",
      id: "finger2",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: ends.finger2Start[0], y: ends.finger2Start[1] },
        { type: "pointerDown", button: 0 },
        { type: "pointerMove", duration: ms, x: ends.finger2End[0], y: ends.finger2End[1] },
        { type: "pointerUp", button: 0 }
      ]
    }
  ];
}
