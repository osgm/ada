import type { PinchFingerEnds } from "@ada/driver-rpc";

export interface HypiumPointAction {
  down(point: { x: number; y: number }, duration?: number): HypiumPointAction;
  move_to(point: { x: number; y: number }, duration?: number): HypiumPointAction;
}

export interface HypiumPointActionCtor {
  new (samplingTime?: number): HypiumPointAction;
  mergeMultiPointAction(actions: HypiumPointAction[]): unknown;
}

export interface HypiumPointCtor {
  new (x: number, y: number): { x: number; y: number };
}

export interface HypiumPinchTypes {
  PointAction: HypiumPointActionCtor;
  Point: HypiumPointCtor;
}

export interface HarmonyPinchDriver {
  swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    speed?: number
  ): Promise<void>;
  injectMultiPointerAction?(matrix: unknown, speed?: number): Promise<void>;
}

/** 用 hypium PointAction 构建双指同步轨迹（Driver.injectMultiPointerAction） */
export function buildHarmonyPinchPointerMatrix(
  types: HypiumPinchTypes,
  ends: PinchFingerEnds,
  durationMs: number
): unknown {
  const { PointAction, Point } = types;
  const sampling = 15;
  const downMs = Math.min(80, Math.max(30, Math.floor(durationMs * 0.1)));
  const moveMs = Math.max(100, durationMs);

  const finger1 = new PointAction(sampling)
    .down(new Point(ends.finger1Start[0], ends.finger1Start[1]), downMs)
    .move_to(new Point(ends.finger1End[0], ends.finger1End[1]), moveMs);

  const finger2 = new PointAction(sampling)
    .down(new Point(ends.finger2Start[0], ends.finger2Start[1]), downMs)
    .move_to(new Point(ends.finger2End[0], ends.finger2End[1]), moveMs);

  return PointAction.mergeMultiPointAction([finger1, finger2]);
}

export type HarmonyPinchMode = "multiPointer" | "sequential";

/** 鸿蒙 pinch：优先 injectMultiPointerAction，否则顺序 swipe 兜底（勿并发 swipe，RPC 会死锁） */
export async function executeHarmonyPinch(
  driver: HarmonyPinchDriver,
  ends: PinchFingerEnds,
  durationMs: number,
  types?: HypiumPinchTypes
): Promise<{ mode: HarmonyPinchMode }> {
  if (typeof driver.injectMultiPointerAction === "function" && types) {
    const matrix = buildHarmonyPinchPointerMatrix(types, ends, durationMs);
    await driver.injectMultiPointerAction(matrix, durationMs);
    return { mode: "multiPointer" };
  }

  await driver.swipe(
    ends.finger1Start[0],
    ends.finger1Start[1],
    ends.finger1End[0],
    ends.finger1End[1],
    durationMs
  );
  await driver.swipe(
    ends.finger2Start[0],
    ends.finger2Start[1],
    ends.finger2End[0],
    ends.finger2End[1],
    durationMs
  );
  return { mode: "sequential" };
}
