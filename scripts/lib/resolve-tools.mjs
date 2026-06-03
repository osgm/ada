/**
 * 解析仓库 tools/ 下的 adb / hdc（脚本探测与示例共用）
 */
import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./repo-root.mjs";

export function resolveToolBin(name) {
  const base = name === "hdc" ? (process.platform === "win32" ? "hdc.exe" : "hdc") : name;
  const local = path.join(repoRoot, "tools", base);
  if (fs.existsSync(local)) return local;
  return base;
}

function pathEnvKey() {
  if (process.platform === "win32") {
    return Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "Path";
  }
  return "PATH";
}

export function toolsPathEnv(extra = {}) {
  const toolsDir = path.join(repoRoot, "tools");
  const sep = path.delimiter;
  const pathKey = pathEnvKey();
  const prev = extra[pathKey] ?? extra.PATH ?? process.env[pathKey] ?? process.env.PATH ?? "";
  return {
    ...extra,
    [pathKey]: fs.existsSync(toolsDir) ? `${toolsDir}${sep}${prev}` : prev,
    ADA_TOOLS_DIR: toolsDir
  };
}

/** 将仓库 tools/ prepend 到当前进程 PATH（本地示例 / bridge 共用） */
export function applyToolsPath() {
  const toolsDir = path.join(repoRoot, "tools");
  if (!fs.existsSync(toolsDir)) return;
  const pathKey = pathEnvKey();
  const sep = path.delimiter;
  const prev = process.env[pathKey] ?? "";
  const normalized = path.normalize(toolsDir);
  const already = prev
    .split(sep)
    .filter(Boolean)
    .some((entry) => path.normalize(entry) === normalized);
  if (!already) {
    process.env[pathKey] = prev.length > 0 ? `${toolsDir}${sep}${prev}` : toolsDir;
  }
  process.env.ADA_TOOLS_DIR = toolsDir;
}
