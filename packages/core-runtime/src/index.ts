import fs from "node:fs/promises";
import path from "node:path";

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const lv = output[key];
    if (isObject(lv) && isObject(value)) {
      output[key] = deepMerge(lv, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export async function resolveWorkspaceRoot(configRelativePath: string, startDir = process.cwd()): Promise<string> {
  /** 打包后的可执行文件同目录下的 config/（release 布局） */
  const exeDir = path.dirname(process.execPath);
  if (exeDir && exeDir !== "." && exeDir.length > 1) {
    const besideExe = path.join(exeDir, configRelativePath);
    try {
      await fs.access(besideExe);
      return exeDir;
    } catch {
      // fall through
    }
  }

  let current = startDir;
  for (let i = 0; i < 10; i += 1) {
    const candidate = path.join(current, configRelativePath);
    try {
      await fs.access(candidate);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return startDir;
}

type LogLevel = "info" | "warn" | "error";

export function createJsonLogger(source: string): (level: LogLevel, payload: { event: string; details?: unknown }) => void {
  return (level, payload) => {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      source,
      ...payload
    });
    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  };
}
