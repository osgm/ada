import type { CommandEnvelope } from "@ada/contracts";
import { normalizeCommandName } from "@ada/driver-rpc";

export type AdaPlatform = "web" | "android" | "ios" | "harmony";

export const ADA_PLATFORMS: readonly AdaPlatform[] = ["web", "android", "ios", "harmony"] as const;

export type SupportedCommand = CommandEnvelope["command"];

export const SUPPORTED_COMMANDS: readonly SupportedCommand[] = [
  "click",
  "type",
  "swipe",
  "pinch",
  "assertVisible",
  "screenshot",
  "navigate",
  "hover",
  "press",
  "select",
  "scroll",
  "forward",
  "newTab",
  "switchTab",
  "uploadFile",
  "dragDrop",
  "wait",
  "assertText",
  "getText",
  "back",
  "reload",
  "closeTab",
  "pressHome",
  "home",
  "launchApp",
  "exitApp",
  "recipe",
  "custom",
  "invoke",
  "deviceAdmin"
] as const;

const supportedCommandSet = new Set<string>(SUPPORTED_COMMANDS);

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
}

function suggestClosest(input: string, candidates: readonly string[]): string | null {
  const needle = input.trim().toLowerCase();
  if (!needle) return null;
  let best: { value: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = levenshtein(needle, candidate.toLowerCase());
    if (!best || distance < best.distance) {
      best = { value: candidate, distance };
    }
  }
  if (!best || best.distance > Math.max(3, Math.floor(needle.length / 2))) {
    return null;
  }
  return best.value;
}

function formatSuggestion(input: string, candidates: readonly string[]): string {
  const hit = suggestClosest(input, candidates);
  return hit ? ` Did you mean "${hit}"?` : "";
}

export interface NormalizePlatformOptions {
  /** Only for legacy task envelopes where web steps may omit platform */
  allowDefaultWeb?: boolean;
}

export function normalizePlatform(v: unknown, options?: NormalizePlatformOptions): AdaPlatform {
  if (v === undefined || v === null || v === "") {
    if (options?.allowDefaultWeb) {
      return "web";
    }
    throw new Error(`platform is required. Valid values: ${ADA_PLATFORMS.join("|")}`);
  }
  if (v === "web" || v === "android" || v === "ios" || v === "harmony") {
    return v;
  }
  throw new Error(
    `invalid platform: ${JSON.stringify(v)}. Valid values: ${ADA_PLATFORMS.join("|")}.${formatSuggestion(String(v), ADA_PLATFORMS)}`
  );
}

export function requireMobilePlatform(v: unknown): Exclude<AdaPlatform, "web"> {
  const platform = normalizePlatform(v);
  if (platform === "web") {
    throw new Error("mobile platform is required: android|ios|harmony");
  }
  return platform;
}

export function normalizeCommand(v: unknown): SupportedCommand {
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`command is required. Valid commands: ${SUPPORTED_COMMANDS.join(", ")}`);
  }
  const mapped = normalizeCommandName(v.trim());
  if (supportedCommandSet.has(mapped)) {
    return mapped as SupportedCommand;
  }
  throw new Error(
    `invalid command: ${JSON.stringify(v)}. Valid commands: ${SUPPORTED_COMMANDS.join(", ")}.${formatSuggestion(v, SUPPORTED_COMMANDS)}`
  );
}

export function isMobilePlatform(v: AdaPlatform): boolean {
  return v === "android" || v === "ios" || v === "harmony";
}
