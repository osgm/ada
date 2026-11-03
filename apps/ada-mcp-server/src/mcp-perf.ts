import { mcpLog, shouldMcpLog } from "./mcp-log.js";

export const perfStats = new Map<string, number[]>();
const PERF_MAX_SAMPLES_PER_LABEL = 500;

function recordPerf(label: string, elapsedMs: number): void {
  const arr = perfStats.get(label) ?? [];
  arr.push(elapsedMs);
  if (arr.length > PERF_MAX_SAMPLES_PER_LABEL) {
    arr.splice(0, arr.length - PERF_MAX_SAMPLES_PER_LABEL);
  }
  perfStats.set(label, arr);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx] ?? 0;
}

export function buildPerfSummary(): Record<string, unknown> {
  const labels = Array.from(perfStats.keys()).sort();
  const items = labels.map((label) => {
    const samples = [...(perfStats.get(label) ?? [])].sort((a, b) => a - b);
    const count = samples.length;
    const total = samples.reduce((acc, n) => acc + n, 0);
    const avg = count > 0 ? total / count : 0;
    return {
      label,
      count,
      avgMs: Number(avg.toFixed(2)),
      p50Ms: percentile(samples, 50),
      p95Ms: percentile(samples, 95),
      maxMs: count > 0 ? samples[count - 1] : 0
    };
  });
  return {
    status: "ok",
    labels: items.length,
    samplesPerLabelMax: PERF_MAX_SAMPLES_PER_LABEL,
    items
  };
}

export async function withTiming<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    const elapsed = Date.now() - started;
    recordPerf(label, elapsed);
    if (shouldMcpLog("info") || process.env.ADA_MCP_PERF?.trim() === "1") {
      mcpLog("info", `perf ${label} ${elapsed}ms`);
    }
  }
}
