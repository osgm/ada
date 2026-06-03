/**
 * 内联 @ada/download-probe（零 npm 依赖；与 packages/download-probe 保持同步）
 * 同步：node ../../scripts/build/sync-download-probe-vendor.mjs
 */

/**
 * 通过 Range 拉取固定字节样本，按实际下载速度（KB/s）排序镜像。
 */
function parsePositiveInt(raw, fallback) {
    const parsed = raw ? Number(raw) : fallback;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
export function probeSampleBytes() {
    return parsePositiveInt(process.env.ADA_PROBE_DOWNLOAD_BYTES, 512 * 1024);
}
export function probeDownloadTimeoutMs() {
    return parsePositiveInt(process.env.ADA_PROBE_DOWNLOAD_TIMEOUT_MS, 20_000);
}
/** 拉取 url 的前 sampleBytes 字节，返回吞吐；失败返回 null */
export async function probeDownloadSample(url, options) {
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
        }
        finally {
            try {
                await reader.cancel();
            }
            catch {
                // ignore
            }
        }
        if (bytesRead < Math.min(sampleBytes / 8, 32 * 1024)) {
            return null;
        }
        const durationMs = Math.max(1, Date.now() - started);
        const speedKBps = bytesRead / 1024 / (durationMs / 1000);
        return { durationMs, bytesRead, speedKBps };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
/** 按 speedKBps 降序；相同时样本耗时更短优先 */
export function pickBestDownloadProbe(rows, priorityIndex) {
    const ok = rows.filter((r) => r.probe !== null);
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
export function formatDownloadProbeLine(prefix, candidate, probe) {
    if (!probe) {
        return `${prefix} ${candidate} -> fail`;
    }
    const mib = (probe.bytesRead / (1024 * 1024)).toFixed(2);
    return `${prefix} ${candidate} -> ${probe.speedKBps.toFixed(0)} KB/s（${mib} MiB / ${probe.durationMs}ms）`;
}
/** 对 URL 列表测速，返回最快项 */
export async function pickFastestProbeUrl(urls, onLogLine) {
    let best = null;
    for (const url of urls) {
        onLogLine?.(`[probe] 探测下载速度: ${url}`);
        const probe = await probeDownloadSample(url);
        if (!probe) {
            onLogLine?.(`[probe]   ${url} -> fail`);
            continue;
        }
        onLogLine?.(`[probe]   ${url} -> ${probe.speedKBps.toFixed(0)} KB/s（${(probe.bytesRead / (1024 * 1024)).toFixed(2)} MiB / ${probe.durationMs}ms）`);
        if (!best || probe.speedKBps > best.probe.speedKBps) {
            best = { url, probe };
        }
    }
    return best;
}
