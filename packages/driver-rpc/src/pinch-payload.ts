import type { PinchFingerEnds } from "./pinch-coords.js";

function ensurePoint(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

export function readPinchEndsFromPayload(payload: Record<string, unknown>): PinchFingerEnds | null {
  const finger1Start = ensurePoint(payload.finger1);
  const finger2Start = ensurePoint(payload.finger2);
  const finger1End = ensurePoint(payload.finger1End);
  const finger2End = ensurePoint(payload.finger2End);
  if (!finger1Start || !finger2Start || !finger1End || !finger2End) return null;
  const center: [number, number] = [
    Math.round((finger1Start[0] + finger2Start[0]) / 2),
    Math.round((finger1Start[1] + finger2Start[1]) / 2)
  ];
  return { finger1Start, finger1End, finger2Start, finger2End, center };
}
