type WdaFetchResult = { ok: boolean; raw?: Record<string, unknown> };

export type WdaTapFetch = (
  method: string,
  url: string,
  body?: unknown
) => Promise<WdaFetchResult>;

/** W3C single-finger tap at viewport coordinates (fallback when wda/tap/0 is missing). */
export function buildSinglePointerTapActions(x: number, y: number) {
  return [
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x, y },
        { type: "pointerDown", button: 0 },
        { type: "pause", duration: 50 },
        { type: "pointerUp", button: 0 }
      ]
    }
  ];
}

/** Coordinate tap with fallbacks for WDA builds that omit /wda/tap/0. */
export async function tapAtPointWithFallback(
  wdaFetch: WdaTapFetch,
  sessionUrl: string,
  sessionId: string,
  point: [number, number]
): Promise<"wda-tap" | "drag-tap" | "actions-tap"> {
  const [x, y] = point;
  const tapRes = await wdaFetch("POST", `${sessionUrl}/session/${sessionId}/wda/tap/0`, { x, y });
  if (tapRes.ok) return "wda-tap";

  const tapLegacy = await wdaFetch("POST", `${sessionUrl}/session/${sessionId}/wda/tap`, { x, y });
  if (tapLegacy.ok) return "wda-tap";

  const dragRes = await wdaFetch("POST", `${sessionUrl}/session/${sessionId}/wda/dragfromtoforduration`, {
    fromX: x,
    fromY: y,
    toX: x,
    toY: y,
    duration: 0.05
  });
  if (dragRes.ok) return "drag-tap";

  const actionsRes = await wdaFetch("POST", `${sessionUrl}/session/${sessionId}/actions`, {
    actions: buildSinglePointerTapActions(x, y)
  });
  if (actionsRes.ok) return "actions-tap";

  throw new Error(JSON.stringify(tapRes.raw ?? {}));
}
