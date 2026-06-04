/**
 * launcher npm registry 测速结果缓存（默认 ~/.ada/launcher-registry-probe.json，TTL 1h）
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeRegistryUrl } from "./registry-probe.mjs";

const DEFAULT_TTL_MS = 60 * 60 * 1000;

function resolveGlobalAdaHome() {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".ada");
}

export function registryProbeCacheFilePath() {
  const explicit = process.env.ADA_MCP_REGISTRY_PROBE_CACHE_FILE?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  return path.join(resolveGlobalAdaHome(), "launcher-registry-probe.json");
}

export function registryProbeCacheTtlMs() {
  const raw = process.env.ADA_MCP_REGISTRY_PROBE_TTL_MS?.trim();
  if (!raw) {
    return DEFAULT_TTL_MS;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_TTL_MS;
}

export function isSkipRegistryProbeEnv() {
  const s = String(process.env.ADA_MCP_SKIP_REGISTRY_PROBE ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function candidatesKey(candidates) {
  return candidates.map((c) => normalizeRegistryUrl(c)).join(",");
}

/**
 * @param {string[]} candidates
 * @returns {{ best: string, probeResults: Array<{ candidate: string, latency: number|null, speedKBps: number|null, bytesRead: number|null }>, probedAt: string } | null}
 */
export function readRegistryProbeCache(candidates) {
  const file = registryProbeCacheFilePath();
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const probedAtMs = Date.parse(String(parsed.probedAt ?? ""));
  if (!Number.isFinite(probedAtMs)) {
    return null;
  }
  if (Date.now() - probedAtMs > registryProbeCacheTtlMs()) {
    return null;
  }
  if (parsed.candidatesKey !== candidatesKey(candidates)) {
    return null;
  }
  const best = normalizeRegistryUrl(String(parsed.best ?? ""));
  if (!best) {
    return null;
  }
  const probeResults = Array.isArray(parsed.probeResults) ? parsed.probeResults : [];
  return {
    best,
    probeResults,
    probedAt: new Date(probedAtMs).toISOString()
  };
}

/**
 * @param {{ best: string, candidates: string[], probeResults?: unknown[] }} payload
 */
export function writeRegistryProbeCache(payload) {
  const file = registryProbeCacheFilePath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const body = {
    version: 1,
    best: normalizeRegistryUrl(payload.best),
    candidatesKey: candidatesKey(payload.candidates),
    probeResults: payload.probeResults ?? [],
    probedAt: new Date().toISOString(),
    ttlMs: registryProbeCacheTtlMs()
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}
