import type { PinchFingerEnds } from "./pinch-coords.js";

/** W3C WebDriver actions：双指同步 pinch */
export function buildDualPointerPinchActions(ends: PinchFingerEnds, durationMs: number) {
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
