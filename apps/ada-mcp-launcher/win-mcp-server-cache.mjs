/**
 * npx 稳定安装缓存：将 mcp-server 安装到 ~/.ada/mcp-server-run/<pkgSpec>，
 * 避免 npm _npx 并发 tar 损坏与重复全量安装。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOCK_STALE_MS = 300_000;

function resolveAdaHome() {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".ada");
}

/** @param {string} pkgSpec 例如 @ada-mcp/mcp-server@0.1.70 */
export function mcpServerCacheDir(pkgSpec) {
  const safe = String(pkgSpec)
    .trim()
    .replace(/@/g, "_at_")
    .replace(/[/\\]/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(resolveAdaHome(), "mcp-server-run", safe || "mcp-server");
}

export function mcpServerCliPath(installDir) {
  return path.join(installDir, "node_modules", "@ada-mcp", "mcp-server", "dist", "cli.cjs");
}

function installLockPath(installDir) {
  return path.join(installDir, ".install.lock");
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
    if (!cur || Date.now() - Number(cur.at) > LOCK_STALE_MS || !isPidAlive(Number(cur.pid))) {
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

/** @param {string} pkgSpec */
export function parsePkgSpecVersion(pkgSpec) {
  const s = String(pkgSpec).trim();
  const at = s.lastIndexOf("@");
  if (at <= 0) {
    return "";
  }
  const ver = s.slice(at + 1);
  if (!/^\d+\.\d+\.\d+/.test(ver)) {
    return "";
  }
  return ver;
}

/** 安装缓存：cli 可能已落盘，但 zod 等依赖尚未链接完毕 */
const CRITICAL_MCP_SERVER_DEPS = ["zod", "jimp", "@modelcontextprotocol/sdk", "express", "playwright"];

/** @param {string} installDir */
function criticalDepPackageJson(installDir, spec) {
  const root = path.join(installDir, "node_modules");
  if (spec.startsWith("@")) {
    const [scope, name] = spec.split("/");
    return path.join(root, scope, name, "package.json");
  }
  return path.join(root, spec, "package.json");
}

/** @param {string} installDir */
export function areMcpServerDepsPresent(installDir) {
  try {
    for (const spec of CRITICAL_MCP_SERVER_DEPS) {
      if (!fs.existsSync(criticalDepPackageJson(installDir, spec))) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** @param {string} installDir */
export function readInstalledMcpServerVersion(installDir) {
  try {
    const pkgJson = path.join(installDir, "node_modules", "@ada-mcp", "mcp-server", "package.json");
    const json = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
    return String(json.version ?? "").trim();
  } catch {
    return "";
  }
}

/** @param {string} installDir @param {string} pkgSpec */
export function isMcpServerCacheReady(installDir, pkgSpec) {
  const cli = mcpServerCliPath(installDir);
  if (!fs.existsSync(cli)) {
    return false;
  }
  if (!areMcpServerDepsPresent(installDir)) {
    return false;
  }
  const want = parsePkgSpecVersion(pkgSpec);
  if (!want) {
    return true;
  }
  return readInstalledMcpServerVersion(installDir) === want;
}

/**
 * @template T
 * @param {string} installDir
 * @param {() => T | Promise<T>} task
 * @param {{ isReady?: () => boolean }} [options]
 * @returns {Promise<T | void>}
 */
export async function runExclusiveMcpServerInstall(installDir, task, options) {
  const lockPath = installLockPath(installDir);
  const maxWait = Math.min(
    Math.max(Number(process.env.ADA_MCP_SERVER_INSTALL_LOCK_WAIT_MS ?? 120_000) || 120_000, 0),
    600_000
  );
  const start = Date.now();
  while (!tryAcquireLock(lockPath)) {
    if (options?.isReady?.()) {
      return;
    }
    if (Date.now() - start >= maxWait) {
      throw new Error(`timeout waiting for mcp-server install lock: ${installDir}`);
    }
    await sleep(200);
  }
  try {
    return await task();
  } finally {
    releaseLock(lockPath);
  }
}
