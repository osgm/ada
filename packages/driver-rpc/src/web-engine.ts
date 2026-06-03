import type { WebEngine } from "@ada/contracts";

const WEB_ENGINES = new Set<WebEngine>(["playwright"]);

export function parseWebEngineFromPayload(_payload?: Record<string, unknown>): WebEngine {
  return "playwright";
}

export function isKnownWebEngine(value: string): value is WebEngine {
  return WEB_ENGINES.has(value as WebEngine);
}
