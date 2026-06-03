import { spawn, spawnSync, type SpawnOptions, type SpawnSyncOptions } from "node:child_process";
import path from "node:path";

/** Windows：隐藏子进程控制台（CREATE_NO_WINDOW） */
export function withHiddenConsole<T extends SpawnOptions | SpawnSyncOptions>(options?: T): T {
  if (process.platform !== "win32") {
    return (options ?? {}) as T;
  }
  return {
    ...options,
    shell: false,
    windowsHide: true
  } as T;
}

export function spawnSyncHidden(command: string, args: string[], options?: SpawnSyncOptions) {
  return spawnSync(command, args, withHiddenConsole(options));
}

function quoteCmdToken(token: string): string {
  const s = String(token);
  if (!s) return '""';
  if (/[\s"&|<>^]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 仅 .cmd / .bat 需要经 cmd.exe /c（Node 直接 spawn .cmd 会 EINVAL） */
export function isWin32BatchFile(executable: string): boolean {
  const base = path.basename(executable).toLowerCase();
  return base.endsWith(".cmd") || base.endsWith(".bat");
}

const resolvedCommandPathCache = new Map<string, string | null>();

/** 解析 PATH 上命令的完整路径（Windows 用 where.exe，只查一次并缓存） */
export function resolveCommandPath(command: string): string | null {
  if (path.isAbsolute(command)) {
    return command;
  }
  if (resolvedCommandPathCache.has(command)) {
    return resolvedCommandPathCache.get(command) ?? null;
  }
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSyncHidden(checker, [command], { encoding: "utf8" });
  const stdout = result.stdout;
  const text = typeof stdout === "string" ? stdout : stdout ? stdout.toString("utf8") : "";
  const resolved = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  resolvedCommandPathCache.set(command, resolved ?? null);
  return resolved ?? null;
}

/**
 * 启动 detached 子进程。优先直接 spawn 可执行文件 + windowsHide；
 * 仅对 .cmd/.bat 使用 cmd.exe /c（避免对 node 进程多包一层 cmd 导致闪窗增多）。
 */
export function spawnDetachedHidden(
  executable: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}
): ReturnType<typeof spawn> {
  const { env, cwd } = options;
  const baseOpts = {
    cwd,
    env,
    detached: true,
    stdio: "ignore" as const
  };

  if (process.platform === "win32" && isWin32BatchFile(executable)) {
    const comspec = process.env.ComSpec || "cmd.exe";
    const line = [quoteCmdToken(executable), ...args.map(quoteCmdToken)].join(" ");
    return spawn(comspec, ["/d", "/s", "/c", line], {
      ...baseOpts,
      shell: false,
      windowsHide: true
    });
  }

  return spawn(executable, args, withHiddenConsole(baseOpts));
}
