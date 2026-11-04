import fs from "node:fs";
import path from "node:path";
import { asRecord } from "./mcp-utils.js";

/** 默认关；`ADA_MCP_ARTIFACTS=1` 或 args/payload.artifacts=true 开启 */
export function isArtifactsEnabled(args?: Record<string, unknown>): boolean {
  if (args?.artifacts === true) return true;
  if (args?.artifacts === false) return false;
  const payload = asRecord(args?.payload);
  if (payload.artifacts === true) return true;
  if (payload.artifacts === false) return false;
  const env = process.env.ADA_MCP_ARTIFACTS?.trim().toLowerCase();
  return env === "1" || env === "true" || env === "on" || env === "yes";
}

export function resolveArtifactRoot(): string {
  const fromEnv = process.env.ADA_MCP_ARTIFACT_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), ".ada", "artifacts");
}

function dayStamp(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export type ArtifactTimelineEntry = {
  at: string;
  tool?: string;
  sessionId?: string;
  platform?: string;
  command?: string;
  success?: boolean;
  summary?: string;
  type?: string;
  [key: string]: unknown;
};

/** 追加一行 timeline.jsonl；失败静默（不影响主流程） */
export function appendArtifactTimeline(
  entry: ArtifactTimelineEntry,
  args?: Record<string, unknown>
): { enabled: true; dir: string; file: string } | { enabled: false } {
  if (!isArtifactsEnabled(args)) {
    return { enabled: false };
  }
  try {
    const dir = path.join(resolveArtifactRoot(), dayStamp());
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "timeline.jsonl");
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n";
    fs.appendFileSync(file, line, "utf8");
    return { enabled: true, dir, file };
  } catch {
    return { enabled: false };
  }
}
