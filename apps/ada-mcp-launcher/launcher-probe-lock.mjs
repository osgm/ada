import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STALE_MS = 120_000;

function resolveAdaHome() {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".ada");
}

function lockFilePath() {
  return path.join(resolveAdaHome(), "launcher-registry-probe.lock");
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

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function tryAcquireLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    fs.writeFileSync(lockPath, `${JSON.stringify({ pid: process.pid, at: Date.now() })}\n`, {
      flag: "wx"
    });
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code !== "EEXIST") {
      throw error;
    }
    const cur = readLock(lockPath);
    if (!cur || Date.now() - Number(cur.at) > STALE_MS || !isPidAlive(Number(cur.pid))) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore
      }
      return tryAcquireLock(lockPath);
    }
    return false;
  }
}

function releaseLock(lockPath) {
  try {
    const cur = readLock(lockPath);
    if (cur && Number(cur.pid) === process.pid) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // ignore
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 串行化 registry 测速，避免 Host 重连时并行 launcher 重复探测。
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export async function runExclusiveRegistryProbe(task) {
  const lockPath = lockFilePath();
  const maxWait = Math.min(
    Math.max(Number(process.env.ADA_MCP_REGISTRY_LOCK_WAIT_MS ?? 20_000) || 20_000, 0),
    120_000
  );
  const start = Date.now();
  while (!tryAcquireLock(lockPath)) {
    if (Date.now() - start >= maxWait) {
      process.env.ADA_MCP_SKIP_REGISTRY_PROBE =
        process.env.ADA_MCP_SKIP_REGISTRY_PROBE || "1";
      return task();
    }
    await sleep(150);
  }
  try {
    return await task();
  } finally {
    releaseLock(lockPath);
  }
}
