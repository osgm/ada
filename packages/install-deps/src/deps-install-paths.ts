import path from "node:path";
import fs from "node:fs/promises";
import {
  resolveGlobalAdaHomeSync as resolveGlobalAdaHomeFromCore,
  resolveUserHomeDirSync,
  resolveWorkspaceRoot as resolveWorkspaceRootCore
} from "@ada/core-runtime";
import {
  discoverPlaywrightBrowsersPath,
  isPlaywrightBrowsersAutoDiscoverEnabled
} from "./playwright-browsers-discovery.js";
import { depsLogLine } from "./log-locale.js";

const DEFAULT_CONFIG_RELATIVE = path.join("config", "default.yaml");

/** 定位含 config/default.yaml 的工作区根（与 ada-agent config 一致） */
export async function resolveWorkspaceRoot(startDir = process.cwd()): Promise<string> {
  return resolveWorkspaceRootCore(DEFAULT_CONFIG_RELATIVE, startDir);
}

/** MCP / launcher 传入的 Host 项目目录；否则当前 cwd */
export function resolveInstallContextCwd(): string {
  const init = process.env.INIT_CWD?.trim();
  if (init) {
    return init;
  }
  return process.cwd();
}

/** 全局 ADA 数据目录（默认当前用户 ~/.ada） */
export function resolveGlobalAdaHomeSync(): string {
  return resolveGlobalAdaHomeFromCore();
}

export async function resolveGlobalAdaHome(): Promise<string> {
  return resolveGlobalAdaHomeSync();
}

/** 确保 ~/.ada 存在并返回路径 */
export async function ensureGlobalAdaHome(): Promise<string> {
  const dir = resolveGlobalAdaHomeSync();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export {
  resolveAgentEffectiveConfigPathSync,
  resolveDeviceRegistryPathSync,
  resolvePlaywrightHostFilePathSync
} from "@ada/core-runtime";

/** 旧版 `.ada-agent/*` 路径（迁移读取用） */
export async function legacyAdaAgentDataCandidates(fileName: string): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (p: string) => {
    const n = path.normalize(p);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };

  add(path.join(resolveGlobalAdaHomeFromCore(), ".ada-agent", fileName));
  add(path.join(resolveUserHomeDirSync(), ".ada-agent", fileName));

  try {
    const ws = await resolveWorkspaceRoot(resolveInstallContextCwd());
    add(path.join(ws, ".ada-agent", fileName));
  } catch {
    // ignore
  }
  add(path.join(process.cwd(), ".ada-agent", fileName));
  add(path.join(process.cwd(), "..", ".ada-agent", fileName));
  return out;
}

/** 旧版工作区 `.ada-agent/deps-install-state.json`（迁移用） */
export async function legacyDepsStateFileCandidates(): Promise<string[]> {
  const legacy = await legacyAdaAgentDataCandidates("deps-install-state.json");
  const hostFile = path.join(resolveInstallContextCwd(), ".ada-mcp-playwright-host");
  return [...legacy, hostFile];
}

/** Agent / GUI / Web / MCP 共用的 npm 包装目录 */
export async function resolveDepsInstallRoot(): Promise<string> {
  const explicit = process.env.ADA_DEPS_INSTALL_ROOT?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  const adaHome = await resolveGlobalAdaHome();
  return path.join(adaHome, "deps");
}

/** 跨入口共享的安装状态文件 */
export function resolveDepsStateFilePathSync(): string {
  const explicit = process.env.ADA_DEPS_STATE_FILE?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  return path.join(resolveGlobalAdaHomeSync(), "deps-install-state.json");
}

export async function resolveDepsStateFilePath(): Promise<string> {
  return resolveDepsStateFilePathSync();
}

export type ResolvePlaywrightBrowsersPathOptions = {
  onLogLine?: (line: string) => void;
};

/**
 * Playwright 浏览器缓存目录（各入口共用）。
 * 未设置 PLAYWRIGHT_BROWSERS_PATH 时，默认扫描 Windows / macOS / Linux 常见 ms-playwright 路径并复用已有浏览器。
 */
export async function resolvePlaywrightBrowsersPath(
  options?: ResolvePlaywrightBrowsersPathOptions
): Promise<string> {
  const explicit = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }

  if (isPlaywrightBrowsersAutoDiscoverEnabled()) {
    const discovered = await discoverPlaywrightBrowsersPath();
    if (discovered) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = discovered.path;
      process.env.ADA_PLAYWRIGHT_BROWSERS_FROM = "auto-discover";
      options?.onLogLine?.(
        depsLogLine(
          `[deps] 复用已有 Playwright 浏览器目录: ${discovered.path} (${discovered.browserKinds.join(", ")})`,
          `[deps] reuse existing Playwright browsers: ${discovered.path} (${discovered.browserKinds.join(", ")})`
        )
      );
      return discovered.path;
    }
  }

  const adaHome = await resolveGlobalAdaHome();
  return path.join(adaHome, "playwright-browsers");
}

export async function ensureDepsInstallWorkspace(depsRoot: string): Promise<void> {
  await fs.mkdir(depsRoot, { recursive: true });
  const pkgPath = path.join(depsRoot, "package.json");
  try {
    await fs.access(pkgPath);
  } catch {
    await fs.writeFile(
      pkgPath,
      `${JSON.stringify(
        {
          name: "ada-deps-install",
          private: true,
          version: "0.0.0",
          description: "ADA shared dependency install workspace (Agent/GUI/Web/MCP)"
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }
}
