import { createRequire } from "node:module";

type NodeRequire = ReturnType<typeof createRequire>;
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureDepsInstallWorkspace,
  resolveDepsInstallRoot,
  resolveInstallContextCwd,
  resolvePlaywrightBrowsersPath
} from "./deps-install-paths.js";
import { depsLogLine, wrapInstallDepsLogEmitter } from "./log-locale.js";

/** npm 包解析来源：系统全局 > 环境/工作区 > ~/.ada/deps */
export type PackageSource = "global" | "env" | "shared" | "none";

export interface ResolvedPackage {
  name: string;
  available: boolean;
  source: PackageSource;
  version?: string;
  modulesDir?: string;
}

interface ResolutionTier {
  source: PackageSource;
  req: NodeRequire;
  modulesDir: string;
}

let resolutionTiers: ResolutionTier[] = [];
let compositeRequire: NodeRequire | undefined;
let sharedDepsRoot: string | undefined;
let resolutionReady = false;

function shouldUseShell(command: string): boolean {
  return process.platform === "win32" && !path.isAbsolute(command) && !command.includes(path.sep);
}

function runCommandCapture(
  command: string,
  args: string[]
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: shouldUseShell(command),
      env: process.env,
      ...(process.platform === "win32" ? ({ windowsHide: true } as const) : {})
    });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trim() });
    });
    child.on("error", () => {
      resolve({ code: 1, stdout: "" });
    });
  });
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function getGlobalNpmModulesDir(): Promise<string | undefined> {
  const result = await runCommandCapture("npm", ["root", "-g"]);
  if (result.code === 0 && result.stdout) {
    return path.resolve(result.stdout);
  }
  return undefined;
}

function tryResolveModule(req: NodeRequire, packageName: string): string | undefined {
  try {
    return req.resolve(packageName);
  } catch {
    return undefined;
  }
}

function readPackageVersion(resolvedEntry: string): string | undefined {
  try {
    const pkgPath = resolvedEntry.endsWith("package.json")
      ? resolvedEntry
      : path.join(path.dirname(resolvedEntry), "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    return String((JSON.parse(raw) as { version?: unknown }).version ?? "").trim() || undefined;
  } catch {
    return undefined;
  }
}

function createCompositeRequire(tiers: ResolutionTier[]): NodeRequire {
  const resolveFromChain = (packageName: string, method: "resolve" | "load"): string | unknown => {
    let lastError: unknown;
    for (const { req } of tiers) {
      try {
        if (method === "resolve") {
          return req.resolve(packageName);
        }
        return req(packageName);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Cannot find module '${packageName}'`);
  };

  const composite = ((id: string) => resolveFromChain(id, "load")) as NodeRequire;
  composite.resolve = ((id: string, options?: { paths?: string[] }) =>
    resolveFromChain(id, "resolve") as string) as NodeRequire["resolve"];
  composite.resolve.paths = ((request: string) => []) as NodeRequire["resolve"]["paths"];
  return composite;
}

function prependNodePathDirs(dirs: string[]): void {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    const normalized = path.normalize(dir);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(normalized);
    }
  }
  const existing = (process.env.NODE_PATH ?? "").split(path.delimiter).filter(Boolean);
  const merged = [...unique.filter((d) => !existing.includes(d)), ...existing];
  process.env.NODE_PATH = merged.join(path.delimiter);
}

function isTruthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * 初始化包解析链：global npm → 工作区/INIT_CWD/NODE_PATH → ~/.ada/deps。
 * 全局或工作区已满足的包不会迁入共享目录（安装流程另判 needsSharedDepsInstall）。
 */
export async function ensurePackageResolution(onLogLine?: (line: string) => void): Promise<NodeRequire> {
  const log = wrapInstallDepsLogEmitter(onLogLine);
  if (compositeRequire && resolutionReady) {
    return compositeRequire;
  }

  resolutionTiers = [];
  const nodePathPrepend: string[] = [];
  const cwd = resolveInstallContextCwd();

  const globalRoot = await getGlobalNpmModulesDir();
  if (globalRoot && (await dirExists(globalRoot))) {
    try {
      const req = createRequire(path.join(globalRoot, "package.json"));
      resolutionTiers.push({ source: "global", req, modulesDir: globalRoot });
      nodePathPrepend.push(globalRoot);
      log?.(
        depsLogLine(`[deps] 系统全局 npm: ${globalRoot}`, `[deps] system global npm: ${globalRoot}`)
      );
    } catch {
      // ignore invalid global root
    }
  }

  const nodePathParts = (process.env.NODE_PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const part of nodePathParts) {
    if (!(await dirExists(part))) {
      continue;
    }
    try {
      const req = createRequire(path.join(part, "package.json"));
      if (!resolutionTiers.some((t) => t.modulesDir === part)) {
        resolutionTiers.push({ source: "env", req, modulesDir: part });
        nodePathPrepend.push(part);
      }
    } catch {
      // not a valid module root
    }
  }

  const legacyPkg = path.join(cwd, "package.json");
  try {
    await fs.access(legacyPkg);
    const legacyRequire = createRequire(legacyPkg);
    resolutionTiers.push({ source: "env", req: legacyRequire, modulesDir: cwd });
    const cwdNodeModules = path.join(cwd, "node_modules");
    if (await dirExists(cwdNodeModules)) {
      nodePathPrepend.push(cwdNodeModules);
    }
  } catch {
    resolutionTiers.push({
      source: "env",
      req: createRequire(path.join(cwd, "package.json")),
      modulesDir: cwd
    });
  }

  sharedDepsRoot = await resolveDepsInstallRoot();
  await ensureDepsInstallWorkspace(sharedDepsRoot);
  const sharedNodeModules = path.join(sharedDepsRoot, "node_modules");
  await fs.mkdir(sharedNodeModules, { recursive: true });
  const sharedReq = createRequire(path.join(sharedDepsRoot, "package.json"));
  resolutionTiers.push({ source: "shared", req: sharedReq, modulesDir: sharedNodeModules });
  nodePathPrepend.push(sharedNodeModules);

  compositeRequire = createCompositeRequire(resolutionTiers);
  prependNodePathDirs(nodePathPrepend);
  resolutionReady = true;

  if (!process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()) {
    const browsersPath = await resolvePlaywrightBrowsersPath({ onLogLine: log });
    process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
    await fs.mkdir(browsersPath, { recursive: true });
  }

  const order = resolutionTiers.map((t) => t.source).join(" > ");
  log?.(
    depsLogLine(`[deps] 包解析优先级: ${order}`, `[deps] package resolution order: ${order}`)
  );
  log?.(
    depsLogLine(
      `[deps] 共享安装目录（按需）: ${sharedDepsRoot}`,
      `[deps] shared install dir (on demand): ${sharedDepsRoot}`
    )
  );
  return compositeRequire;
}

export function depsRequire(): NodeRequire {
  if (!compositeRequire) {
    const cwd = resolveInstallContextCwd();
    return createRequire(path.join(cwd, "package.json"));
  }
  return compositeRequire;
}

export function resolvePackageInfo(packageName: string): ResolvedPackage {
  for (const tier of resolutionTiers) {
    const resolved = tryResolveModule(tier.req, packageName);
    if (resolved) {
      return {
        name: packageName,
        available: true,
        source: tier.source,
        version: readPackageVersion(resolved),
        modulesDir: tier.modulesDir
      };
    }
  }
  return { name: packageName, available: false, source: "none" };
}

export function isPackageAvailable(packageName: string): boolean {
  return resolvePackageInfo(packageName).available;
}

export function getPackageSource(packageName: string): PackageSource {
  return resolvePackageInfo(packageName).source;
}

/** 仅共享目录 ~/.ada/deps 是否已安装该包 */
export function hasPackageInSharedDeps(packageName: string): boolean {
  const tier = resolutionTiers.find((t) => t.source === "shared");
  if (!tier) {
    return false;
  }
  return Boolean(tryResolveModule(tier.req, packageName));
}

/**
 * 是否仍需向 ~/.ada/deps 安装。
 * 系统全局或工作区已满足时默认跳过（除非 ADA_DEPS_FORCE_SHARED=1 且 force）。
 */
export function needsSharedDepsInstall(packageName: string, force = false): boolean {
  const info = resolvePackageInfo(packageName);
  if (info.source === "global" || info.source === "env") {
    if (force && isTruthyEnv("ADA_DEPS_FORCE_SHARED")) {
      return true;
    }
    return false;
  }
  if (info.source === "shared") {
    return force;
  }
  return true;
}

export function formatPackageResolutionLine(packageName: string): string | undefined {
  const info = resolvePackageInfo(packageName);
  if (!info.available) {
    return undefined;
  }
  const ver = info.version ? `@${info.version}` : "";
  const from =
    info.source === "global"
      ? "系统全局 npm"
      : info.source === "env"
        ? "工作区/环境"
        : "共享目录 ~/.ada/deps";
  return `${packageName}${ver}（${from}）`;
}

export function getSharedDepsRoot(): string | undefined {
  return sharedDepsRoot;
}
