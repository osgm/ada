import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function resolveAdaHome() {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".ada");
}

function inflightFilePath() {
  return path.join(resolveAdaHome(), "launcher-inflight.json");
}

function isPidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function writeLauncherInflight(phase) {
  const file = inflightFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify({ pid: process.pid, startedAt: Date.now(), phase: String(phase ?? "start") })}\n`,
    "utf8"
  );
}

export function clearLauncherInflight() {
  try {
    fs.unlinkSync(inflightFilePath());
  } catch {
    // ignore
  }
}

/**
 * @returns {{ pid: number, startedAt: number, phase?: string } | null}
 */
export function detectConcurrentLauncher(maxAgeMs = 90_000) {
  let raw;
  try {
    raw = fs.readFileSync(inflightFilePath(), "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const pid = Number(parsed.pid);
  const startedAt = Number(parsed.startedAt);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt > maxAgeMs) {
    return null;
  }
  if (pid === process.pid) {
    return null;
  }
  if (!isPidAlive(pid)) {
    return null;
  }
  return { pid, startedAt, phase: parsed.phase };
}
