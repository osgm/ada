import { uiHeuristicsFromEnv, type UiHeuristicsConfig } from "@ada/mobile-ui";

export function parseUiHeuristicsFromPayload(payload?: object): UiHeuristicsConfig | undefined {
  const p = (payload ?? {}) as Record<string, unknown>;
  const fromPayload =
    (p.uiHeuristics as UiHeuristicsConfig | undefined) ??
    (typeof p.custom === "object" && p.custom !== null
      ? ((p.custom as Record<string, unknown>).heuristics as UiHeuristicsConfig | undefined)
      : undefined);
  const fromEnv = uiHeuristicsFromEnv();
  if (!fromPayload && !fromEnv) return undefined;
  return { ...fromEnv, ...fromPayload };
}
