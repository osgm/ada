import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { resolveWorkspaceRoot as resolveWorkspaceRootCore } from "@ada/core-runtime";

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

/** 全局 ADA 数据目录（默认 ~/.ada） */
export function resolveGlobalAdaHomeSync(): string {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".ada");
}

export async function resolveGlobalAdaHome(): Promise<string> {
  return resolveGlobalAdaHomeSync();
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

/** Playwright 浏览器缓存目录（各入口共用，避免重复下载） */
export async function resolvePlaywrightBrowsersPath(): Promise<string> {
  const explicit = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (explicit) {
    return path.resolve(explicit);
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

/** 旧版工作区 `.ada-agent/deps-install-state.json`（迁移用） */
export async function legacyDepsStateFileCandidates(): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (p: string) => {
    const n = path.normalize(p);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  try {
    const ws = await resolveWorkspaceRoot(resolveInstallContextCwd());
    add(path.join(ws, ".ada-agent", "deps-install-state.json"));
  } catch {
    // ignore
  }
  add(path.join(process.cwd(), ".ada-agent", "deps-install-state.json"));
  add(path.join(process.cwd(), "..", ".ada-agent", "deps-install-state.json"));
  return out;
}
