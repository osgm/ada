import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveInstallContextCwd } from "./deps-install-paths.js";
import { resolveGlobalAdaHomeSync } from "./deps-install-paths.js";
import { resolveWorkspaceRoot } from "./deps-install-paths.js";

const HDC_BIN = process.platform === "win32" ? "hdc.exe" : "hdc";

export type AdaToolsResolution = {
  toolsDir: string | null;
  hdcPath: string | null;
  pathPrepended: boolean;
  hdcPresent: boolean;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function toolsDirHasHdc(dir: string): Promise<boolean> {
  return fileExists(path.join(dir, HDC_BIN));
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of paths) {
    const normalized = path.normalize(raw);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function mcpServerEntryDir(): string | null {
  const entry = process.env.ADA_MCP_SERVER_ENTRY?.trim();
  if (!entry) {
    return null;
  }
  try {
    return path.dirname(path.resolve(entry));
  } catch {
    return null;
  }
}

/** 从若干起点向上查找 `<relativeDir>/` 目录（不要求已含 hdc） */
function walkUpToolsDirs(startDir: string, relativeDir: string, maxDepth = 10): string[] {
  const out: string[] = [];
  let dir = path.resolve(startDir);
  for (let i = 0; i < maxDepth; i += 1) {
    out.push(path.join(dir, relativeDir));
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return out;
}

async function workspaceToolsDirs(relativeDir: string, startDirs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const start of startDirs) {
    try {
      const root = await resolveWorkspaceRoot(start);
      out.push(path.join(root, relativeDir));
    } catch {
      // ignore
    }
  }
  return out;
}

/** 按优先级收集候选 tools 目录（去重，不要求 hdc 已存在） */
export async function collectToolsDirCandidates(options?: {
  cwd?: string;
  relativeDir?: string;
}): Promise<string[]> {
  const relativeDir = options?.relativeDir?.trim() || "tools";
  const startCwd = options?.cwd ?? resolveInstallContextCwd();
  const entryDir = mcpServerEntryDir();
  const execDir = path.dirname(process.execPath);
  const adaHomeTools = path.join(resolveGlobalAdaHomeSync(), relativeDir);

  const startDirs = uniquePaths(
    [
      process.env.ADA_TOOLS_DIR?.trim(),
      startCwd,
      process.env.INIT_CWD?.trim(),
      entryDir,
      process.cwd(),
      execDir && !execDir.includes("node") ? execDir : undefined
    ].filter((x): x is string => typeof x === "string" && x.length > 0)
  );

  const candidates = uniquePaths([
    ...(process.env.ADA_TOOLS_DIR?.trim() ? [path.resolve(process.env.ADA_TOOLS_DIR.trim())] : []),
    ...(await workspaceToolsDirs(relativeDir, startDirs)),
    ...startDirs.flatMap((dir) => walkUpToolsDirs(dir, relativeDir)),
    adaHomeTools
  ]);

  return candidates;
}

/** 解析含 hdc 的 tools 目录；找不到 hdc 时返回 null */
export async function resolveAdaToolsDir(options?: {
  cwd?: string;
  relativeDir?: string;
}): Promise<string | null> {
  for (const candidate of await collectToolsDirCandidates(options)) {
    if (await toolsDirHasHdc(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * 默认 tools 目录：优先含 hdc 的候选；否则取第一个已存在的目录；再否则取首个候选路径。
 */
export async function resolveDefaultToolsDir(options?: {
  cwd?: string;
  relativeDir?: string;
}): Promise<string | null> {
  const withHdc = await resolveAdaToolsDir(options);
  if (withHdc) {
    return withHdc;
  }
  const candidates = await collectToolsDirCandidates(options);
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      // not found
    }
  }
  return candidates[0] ?? null;
}

export function resolveHdcExecutable(toolsDir: string): string {
  return path.join(toolsDir, HDC_BIN);
}

function pathEnvKey(): string {
  if (process.platform === "win32") {
    return Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "Path";
  }
  return "PATH";
}

/** 将 tools 目录 prepend 到 PATH，并设置 ADA_TOOLS_DIR / HDC_HOME（默认指向 tools/） */
export async function applyAdaToolsToProcessEnv(options?: {
  cwd?: string;
  relativeDir?: string;
  onLogLine?: (line: string) => void;
}): Promise<AdaToolsResolution> {
  const explicitToolsDir = process.env.ADA_TOOLS_DIR?.trim();
  const toolsDir =
    (explicitToolsDir ? path.resolve(explicitToolsDir) : null) ??
    (await resolveAdaToolsDir(options)) ??
    (await resolveDefaultToolsDir(options));

  if (!toolsDir) {
    return { toolsDir: null, hdcPath: null, pathPrepended: false, hdcPresent: false };
  }

  const hdcPath = resolveHdcExecutable(toolsDir);
  const hdcPresent = await toolsDirHasHdc(toolsDir);
  process.env.ADA_TOOLS_DIR = toolsDir;
  process.env.HDC_HOME = toolsDir;

  const pathKey = pathEnvKey();
  const sep = process.platform === "win32" ? ";" : ":";
  const current = process.env[pathKey] ?? "";
  const normalizedTools = path.normalize(toolsDir);
  const already = current
    .split(sep)
    .filter(Boolean)
    .some((entry) => path.normalize(entry) === normalizedTools);

  let pathPrepended = false;
  if (!already) {
    process.env[pathKey] = current.length > 0 ? `${toolsDir}${sep}${current}` : toolsDir;
    pathPrepended = true;
  }

  const hdcNote = hdcPresent ? path.basename(hdcPath) : `${path.basename(hdcPath)}（未检测到，已仍设置 ADA_TOOLS_DIR）`;
  options?.onLogLine?.(
    `[harmony] 使用工具目录 ${toolsDir}（hdc=${hdcNote}${pathPrepended ? "，已加入 PATH" : ""}）`
  );

  return { toolsDir, hdcPath, pathPrepended, hdcPresent };
}

export async function probeHdc(
  hdcPath?: string,
  timeoutMs = 15_000
): Promise<{ ok: boolean; output: string; error?: string }> {
  const cmd = hdcPath ?? (process.env.ADA_TOOLS_DIR ? resolveHdcExecutable(process.env.ADA_TOOLS_DIR) : HDC_BIN);
  return new Promise((resolve) => {
    const child = spawn(cmd, ["list", "targets"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, output: out.trim(), error: "hdc list targets timeout" });
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const output = (out || err).trim();
      if (code === 0) {
        resolve({ ok: true, output });
        return;
      }
      resolve({
        ok: false,
        output,
        error: err.trim() || out.trim() || `hdc exited with ${code ?? "unknown"}`
      });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, output: "", error: String(error) });
    });
  });
}
