import type { ScreenSize } from "@ada/mobile-ui";
import {
  resolveSwipePoint,
  type ResolveSwipeCoordsOptions,
  type SwipePointInput
} from "./swipe-coords.js";

export type PinchFingerEnds = {
  finger1Start: [number, number];
  finger1End: [number, number];
  finger2Start: [number, number];
  finger2End: [number, number];
  center: [number, number];
};

export type ResolvePinchOptions = ResolveSwipeCoordsOptions & {
  pinchIn: boolean;
};

function unitFromTo(from: [number, number], to: [number, number]): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [0, 0];
  return [dx / len, dy / len];
}

export function resolvePinchDistance(
  distance: number,
  screen: ScreenSize,
  relative?: boolean
): number {
  const d = Math.max(0, Number(distance) || 0);
  if (relative === true) {
    return Math.round(d * Math.min(screen.width, screen.height));
  }
  return Math.round(d);
}

/** 两指起点（像素）+ 径向位移 → 终点 */
export function computePinchFingerEnds(
  finger1: [number, number],
  finger2: [number, number],
  distancePx: number,
  pinchIn: boolean
): PinchFingerEnds {
  const f1: [number, number] = [Math.round(finger1[0]), Math.round(finger1[1])];
  const f2: [number, number] = [Math.round(finger2[0]), Math.round(finger2[1])];
  const center: [number, number] = [Math.round((f1[0] + f2[0]) / 2), Math.round((f1[1] + f2[1]) / 2)];
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

export function resolvePinchGesture(
  finger1: SwipePointInput,
  finger2: SwipePointInput,
  distance: number,
  screen: ScreenSize,
  options: ResolvePinchOptions
): PinchFingerEnds {
  const coordOpts = { relative: options.relative === true };
  const f1 = resolveSwipePoint(finger1, screen, coordOpts);
  const f2 = resolveSwipePoint(finger2, screen, coordOpts);
  const distancePx = resolvePinchDistance(distance, screen, coordOpts.relative);
  return computePinchFingerEnds(f1, f2, distancePx, options.pinchIn);
}
