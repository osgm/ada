export function parseBoundsString(bounds: string): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
} | null {
  const m = String(bounds ?? "").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!m) return null;
  const x1 = Number(m[1]);
  const y1 = Number(m[2]);
  const x2 = Number(m[3]);
  const y2 = Number(m[4]);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return {
    x1,
    y1,
    x2,
    y2,
    w: x2 - x1,
    h: y2 - y1,
    cx: Math.round((x1 + x2) / 2),
    cy: Math.round((y1 + y2) / 2)
  };
}

export function isTruthyAttr(v: unknown): boolean {
  return v === true || String(v).toLowerCase() === "true";
}
