/**
 * ~/.ada 全局安装锁：串行化并发 launcher 的 registry seed / mcp-server 安装阶段。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STALE_MS = 300_000;

function resolveAdaHome() {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".ada");
}

function lockFilePath() {
  return path.join(resolveAdaHome(), "ada-global-install.lock");
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

function tryAcquireLock(lockPath, phase) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    fs.writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: process.pid, at: Date.now(), phase: String(phase ?? "install") })}\n`,
      { flag: "wx" }
    );
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
      return tryAcquireLock(lockPath, phase);
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
 * @template T
 * @param {string} phase
 * @param {() => T | Promise<T>} task
 */
export async function runExclusiveAdaInstall(phase, task) {
  const lockPath = lockFilePath();
  const maxWait = Math.min(
    Math.max(Number(process.env.ADA_MCP_GLOBAL_INSTALL_LOCK_WAIT_MS ?? 120_000) || 120_000, 0),
    600_000
  );
  const start = Date.now();
  while (!tryAcquireLock(lockPath, phase)) {
    if (Date.now() - start >= maxWait) {
      throw new Error(`timeout waiting for ada global install lock (phase=${phase})`);
    }
    await sleep(200);
  }
  try {
    return await task();
  } finally {
    releaseLock(lockPath);
  }
}

/**
 * 等待其它 launcher 释放全局锁（不持锁）。
 * @param {number} [maxWaitMs]
 */
export async function waitForAdaGlobalInstallLock(maxWaitMs = 120_000) {
  const lockPath = lockFilePath();
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const cur = readLock(lockPath);
    if (!cur || Number(cur.pid) === process.pid) {
      return;
    }
    if (Date.now() - Number(cur.at) > STALE_MS || !isPidAlive(Number(cur.pid))) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore
      }
      return;
    }
    await sleep(200);
  }
}
