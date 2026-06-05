/**
 * 通过 Range 拉取固定字节样本，按实际下载速度（KB/s）排序镜像。
 */

import { probeLogLine, useEnglishAdaLogs } from "./log-locale.js";

export type DownloadProbeResult = {
  durationMs: number;
  bytesRead: number;
  /** 有效吞吐（KiB/s） */
  speedKBps: number;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number(raw) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function probeSampleBytes(): number {
  return parsePositiveInt(process.env.ADA_PROBE_DOWNLOAD_BYTES, 512 * 1024);
}

export function probeDownloadTimeoutMs(): number {
  return parsePositiveInt(process.env.ADA_PROBE_DOWNLOAD_TIMEOUT_MS, 20_000);
}

/** 拉取 url 的前 sampleBytes 字节，返回吞吐；失败返回 null */
export async function probeDownloadSample(
  url: string,
  options?: { sampleBytes?: number; timeoutMs?: number }
): Promise<DownloadProbeResult | null> {
  const sampleBytes = options?.sampleBytes ?? probeSampleBytes();
  const timeoutMs = options?.timeoutMs ?? probeDownloadTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: `bytes=0-${sampleBytes - 1}`, Accept: "*/*" },
      redirect: "follow",
      signal: controller.signal
    });
    if (response.status !== 200 && response.status !== 206) {
      return null;
    }
    const body = response.body;
    if (!body) {
      return null;
    }
    const reader = body.getReader();
    let bytesRead = 0;
    try {
      while (bytesRead < sampleBytes) {
        const { done, value } = await reader.read();
        if (done || !value?.length) {
          break;
        }
        bytesRead += value.length;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
    }
    if (bytesRead < Math.min(sampleBytes / 8, 32 * 1024)) {
      return null;
    }
    const durationMs = Math.max(1, Date.now() - started);
    const speedKBps = bytesRead / 1024 / (durationMs / 1000);
    return { durationMs, bytesRead, speedKBps };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 按 speedKBps 降序；相同时样本耗时更短优先 */
export function pickBestDownloadProbe<T extends { candidate: string; probe: DownloadProbeResult | null }>(
  rows: T[],
  priorityIndex: (candidate: string) => number
): T | null {
  const ok = rows.filter((r) => r.probe !== null) as Array<T & { probe: DownloadProbeResult }>;
  if (ok.length === 0) {
    return null;
  }
  ok.sort((a, b) => {
    if (b.probe.speedKBps !== a.probe.speedKBps) {
      return b.probe.speedKBps - a.probe.speedKBps;
    }
    if (a.probe.durationMs !== b.probe.durationMs) {
      return a.probe.durationMs - b.probe.durationMs;
    }
    return priorityIndex(a.candidate) - priorityIndex(b.candidate);
  });
  return ok[0] ?? null;
}

export function formatDownloadProbeLine(prefix: string, candidate: string, probe: DownloadProbeResult | null): string {
  if (!probe) {
    return `${prefix} ${candidate} -> fail`;
  }
  const mib = (probe.bytesRead / (1024 * 1024)).toFixed(2);
  const stats = useEnglishAdaLogs()
    ? `${probe.speedKBps.toFixed(0)} KB/s (${mib} MiB / ${probe.durationMs}ms)`
    : `${probe.speedKBps.toFixed(0)} KB/s（${mib} MiB / ${probe.durationMs}ms）`;
  return `${prefix} ${candidate} -> ${stats}`;
}

/** 对 URL 列表测速，返回最快项 */
export async function pickFastestProbeUrl(
  urls: string[],
  onLogLine?: (line: string) => void
): Promise<{ url: string; probe: DownloadProbeResult } | null> {
  let best: { url: string; probe: DownloadProbeResult } | null = null;
  for (const url of urls) {
    onLogLine?.(probeLogLine(`[probe] 探测下载速度: ${url}`, `[probe] probing download speed: ${url}`));
    const probe = await probeDownloadSample(url);
    if (!probe) {
      onLogLine?.(`[probe]   ${url} -> fail`);
      continue;
    }
    const mib = (probe.bytesRead / (1024 * 1024)).toFixed(2);
    onLogLine?.(
      probeLogLine(
        `[probe]   ${url} -> ${probe.speedKBps.toFixed(0)} KB/s（${mib} MiB / ${probe.durationMs}ms）`,
        `[probe]   ${url} -> ${probe.speedKBps.toFixed(0)} KB/s (${mib} MiB / ${probe.durationMs}ms)`
      )
    );
    if (!best || probe.speedKBps > best.probe.speedKBps) {
      best = { url, probe };
    }
  }
  return best;
}
