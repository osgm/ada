#!/usr/bin/env node
/**
 * 零依赖：探测最快 npm 镜像后执行 pnpm dlx / npx -y @ada-mcp/mcp-server
 * 未设置 ADA_MCP_SERVER_VERSION 时，从所选 registry 读取 mcp-server 的 latest 版本（与 pnpm dlx 无 @ 版本一致）
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import {
  detectBestRegistry,
  fetchPackageLatestVersion,
  fetchPackageVersionExists,
  normalizeRegistryUrl,
  registryCandidateList
} from "./registry-probe.mjs";

const NPMJS_REGISTRY = "https://registry.npmjs.org";

function readJsonFile(filePath) {
  let raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  return JSON.parse(raw);
}

const LAUNCHER_DIR = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER_PKG = readJsonFile(path.join(LAUNCHER_DIR, "package.json"));
const LAUNCHER_VERSION = String(LAUNCHER_PKG.version ?? "0.0.0");
const LAUNCHER_PKG_NAME = "@ada-mcp/launcher";

const MCP_SERVER_PKG = process.env.ADA_MCP_SERVER_PACKAGE?.trim() || "@ada-mcp/mcp-server";
/** mcp-server 包内 bin 名（Windows npx 会误调包名 mcp-server，需显式指定 ada-mcp 或 node 直连） */
const MCP_SERVER_BIN = "ada-mcp";
/** 与 launcher 包版本一致（发布约定：两包同号）；registry latest 更低时抬高到此版本 */
const MIN_MCP_SERVER_VERSION = LAUNCHER_VERSION;

function parseSemverParts(version) {
  const m = String(version)
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) {
    return [0, 0, 0];
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function semverLessThan(a, b) {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) {
      return pa[i] < pb[i];
    }
  }
  return false;
}

function applyMinMcpServerVersion(version, label) {
  if (!version || semverLessThan(version, MIN_MCP_SERVER_VERSION)) {
    if (version) {
      console.error(
        `[ada-mcp launcher][warn] ${label}@${version} 低于最低要求 ${MIN_MCP_SERVER_VERSION}，已改用 ${MIN_MCP_SERVER_VERSION}`
      );
    }
    return MIN_MCP_SERVER_VERSION;
  }
  return version;
}

async function resolveMcpServerSpec(registry) {
  const fromEnv = process.env.ADA_MCP_SERVER_VERSION?.trim();
  if (fromEnv) {
    const v = applyMinMcpServerVersion(fromEnv, "ADA_MCP_SERVER_VERSION");
    return {
      spec: `${MCP_SERVER_PKG}@${v}`,
      version: v,
      source: "env",
      registryLatest: undefined
    };
  }

  const latest = await fetchPackageLatestVersion(MCP_SERVER_PKG, registry);
  if (latest) {
    const v = applyMinMcpServerVersion(latest, "registry latest");
    return {
      spec: `${MCP_SERVER_PKG}@${v}`,
      version: v,
      source: "registry-latest",
      registryLatest: latest
    };
  }

  console.error(
    `[ada-mcp launcher][warn] 无法从 registry 读取 ${MCP_SERVER_PKG} latest，使用 @latest 标签`
  );
  return {
    spec: `${MCP_SERVER_PKG}@latest`,
    version: "latest",
    source: "tag-latest",
    registryLatest: undefined
  };
}

/**
 * 解析 launcher 参数：剥离 --registry（勿传给 mcp-server / 内层 pnpm dlx）。
 * pnpm dlx 不支持 `pnpm dlx --registry URL pkg`，应使用环境变量 ADA_MCP_REGISTRY。
 */
function parseLauncherArgv() {
  const argv = process.argv.slice(2);
  let start = 0;
  if (argv[0] === "dlx-bootstrap") {
    start = 1;
  }
  let forcedRegistry =
    process.env.ADA_MCP_REGISTRY?.trim() || process.env.ADA_NPM_REGISTRY?.trim() || "";
  const forward = [];
  for (let i = start; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--registry" || a === "-r") {
      forcedRegistry = argv[i + 1] ?? forcedRegistry;
      i += 1;
      continue;
    }
    if (a.startsWith("--registry=")) {
      forcedRegistry = a.slice("--registry=".length);
      continue;
    }
    forward.push(a);
  }
  return {
    forward,
    forcedRegistry: forcedRegistry ? normalizeRegistryUrl(forcedRegistry) : ""
  };
}

async function resolveInstallRegistry(forcedRegistry) {
  if (forcedRegistry) {
    return {
      best: forcedRegistry,
      probeResults: [],
      forced: true
    };
  }
  const candidates = registryCandidateList();
  const probed = await detectBestRegistry(candidates);
  return { ...probed, forced: false };
}

/** 镜像 latest 滞后或缺包时，安装回退官方 npmjs */
async function registryForPinnedVersion(registry, packageName, version, registryLatest) {
  if (!version || version === "latest") {
    return registry;
  }
  const reg = normalizeRegistryUrl(registry);
  const bumpedAboveMirrorLatest =
    registryLatest && semverLessThan(registryLatest, version);
  const missingOnMirror =
    reg !== NPMJS_REGISTRY && !(await fetchPackageVersionExists(packageName, version, reg));

  if (!bumpedAboveMirrorLatest && !missingOnMirror) {
    return registry;
  }
  if (reg === NPMJS_REGISTRY) {
    return registry;
  }
  if (await fetchPackageVersionExists(packageName, version, NPMJS_REGISTRY)) {
    if (bumpedAboveMirrorLatest) {
      console.error(
        `[ada-mcp launcher][warn] 镜像 latest=${registryLatest}，安装 ${version} 改用 ${NPMJS_REGISTRY}（pnpm 索引可能未同步）`
      );
    } else {
      console.error(
        `[ada-mcp launcher][warn] ${packageName}@${version} 在 ${reg} 不可用，安装改用 ${NPMJS_REGISTRY}`
      );
    }
    return NPMJS_REGISTRY;
  }
  return registry;
}

function runnerCommand(runner) {
  return runner === "pnpm" ? "pnpm" : "npx";
}

/** Windows 下勿对 .cmd 使用 shell:false（会 EINVAL）；经 cmd.exe /c 执行 */
function quoteCmdToken(token) {
  const s = String(token);
  if (!s) {
    return '""';
  }
  if (/[\s"&|<>^]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function win32CmdLine(executable, args) {
  const comspec = process.env.ComSpec || "cmd.exe";
  const line = [quoteCmdToken(executable), ...args.map(quoteCmdToken)].join(" ");
  return { comspec, line };
}

function spawnRunner(executable, args, options = {}) {
  const { stdio = "inherit", cwd, env } = options;
  const childEnv = env ?? process.env;
  if (process.platform === "win32") {
    const { comspec, line } = win32CmdLine(executable, args);
    return spawn(comspec, ["/d", "/s", "/c", line], {
      stdio,
      cwd,
      env: childEnv,
      shell: false,
      windowsHide: true
    });
  }
  return spawn(executable, args, {
    stdio,
    cwd,
    env: childEnv,
    shell: false
  });
}

/** 与 spawnRunner 相同：Windows 下经 cmd.exe /c，避免对 npm.cmd 直接 exec 触发 EINVAL */
function execRunnerSync(executable, args, options = {}) {
  const { stdio = "inherit", cwd, env } = options;
  const childEnv = env ?? process.env;
  if (process.platform === "win32") {
    const { comspec, line } = win32CmdLine(executable, args);
    return execFileSync(comspec, ["/d", "/s", "/c", line], {
      cwd,
      env: childEnv,
      stdio,
      windowsHide: true
    });
  }
  return execFileSync(executable, args, { cwd, env: childEnv, stdio });
}

function runnerArgs(runner, pkgSpec, extra) {
  if (runner === "pnpm") {
    return ["dlx", pkgSpec, ...extra];
  }
  // Windows npx 对 scoped 包默认执行裸命令 `mcp-server`，.cmd shim 常无法解析（见 spawnMcpServer）
  if (process.platform === "win32") {
    return ["-y", "--package", pkgSpec, MCP_SERVER_BIN, ...extra];
  }
  return ["-y", pkgSpec, ...extra];
}

function runnerExecLabel(runner, args) {
  const cmd = runnerCommand(runner);
  return `${cmd} ${args.join(" ")}`;
}

function invokedViaPnpm() {
  const execPath = String(process.env.npm_execpath ?? "");
  if (/pnpm/i.test(execPath)) {
    return true;
  }
  const ua = String(process.env.npm_config_user_agent ?? "");
  if (/pnpm\//i.test(ua)) {
    return true;
  }
  if (process.env.PNPM_HOME) {
    return true;
  }
  const argv1 = process.argv[1] ?? "";
  if (/[\\/]pnpm(?:\.cmd)?$/i.test(argv1)) {
    return true;
  }
  if (/[\\/]pnpm-cache[\\/]dlx[\\/]/i.test(argv1)) {
    return true;
  }
  return false;
}

function invokedViaNpx() {
  const execPath = String(process.env.npm_execpath ?? "");
  if (/npx/i.test(execPath) && !/pnpm/i.test(execPath)) {
    return true;
  }
  const lifecycle = String(process.env.npm_lifecycle_event ?? "");
  if (lifecycle === "npx") {
    return true;
  }
  const argv1 = process.argv[1] ?? "";
  if (/[\\/]npx(?:\.cmd)?$/i.test(argv1)) {
    return true;
  }
  return false;
}

function commandAvailable(command) {
  return new Promise((resolve) => {
    const child = spawnRunner(command, ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function resolvePackageRunner() {
  const raw = String(process.env.ADA_MCP_PACKAGE_RUNNER ?? "auto").trim().toLowerCase();
  if (raw === "pnpm" || raw === "npx") {
    return raw;
  }
  if (invokedViaPnpm()) {
    return "pnpm";
  }
  const pnpmOk = await commandAvailable(runnerCommand("pnpm"));
  // Windows：npx -y @ada-mcp/mcp-server 会报「mcp-server 不是内部或外部命令」；有 pnpm 时一律用 pnpm dlx
  if (process.platform === "win32" && pnpmOk) {
    return "pnpm";
  }
  if (invokedViaNpx()) {
    return "npx";
  }
  if (pnpmOk) {
    return "pnpm";
  }
  const npxOk = await commandAvailable(runnerCommand("npx"));
  if (npxOk) {
    return "npx";
  }
  console.error("[ada-mcp launcher] warn: pnpm/npx not found on PATH, trying npx");
  return "npx";
}

/**
 * Windows + npx：npx 无法可靠执行 bin，临时 npm install 后用 node 跑 dist/cli.cjs。
 */
function spawnMcpServerViaNodeInstall(pkgSpec, extra, options) {
  const { cwd, env } = options;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ada-mcp-run-"));
  console.error(`[ada-mcp launcher] Windows npx fallback: npm install ${pkgSpec} -> node cli.cjs`);
  execRunnerSync(
    "npm",
    ["install", pkgSpec, "--omit=dev", "--no-fund", "--no-audit", "--loglevel=error"],
    { cwd: tmpDir, env, stdio: "inherit" }
  );
  const cli = path.join(tmpDir, "node_modules", "@ada-mcp", "mcp-server", "dist", "cli.cjs");
  if (!fs.existsSync(cli)) {
    throw new Error(`mcp-server entry not found after install: ${cli}`);
  }
  return spawnRunner(process.execPath, [cli, ...extra], { cwd, env });
}

function warnIfBadCwd(cwd) {
  if (process.platform === "win32" && /\\Windows\\System32$/i.test(path.normalize(cwd))) {
    console.error(
      "[ada-mcp launcher][warn] 当前目录为 C:\\Windows\\System32，建议在用户目录或项目目录下运行（见接入手册排障）"
    );
  }
}

function writeProjectNpmrc(cwd, registry) {
  try {
    const npmrcPath = path.join(cwd, ".npmrc");
    let existing = "";
    try {
      existing = fs.readFileSync(npmrcPath, "utf8");
    } catch {
      // new
    }
    if (!existing.includes(`registry=${registry}`)) {
      fs.writeFileSync(npmrcPath, `${existing}registry=${registry}\n`, "utf8");
    }
  } catch {
    // ignore
  }
}

async function warnIfLauncherStale(registry) {
  const latest = await fetchPackageLatestVersion(LAUNCHER_PKG_NAME, registry);
  if (latest && semverLessThan(LAUNCHER_VERSION, latest)) {
    console.error(
      `[ada-mcp launcher][warn] 当前 launcher@${LAUNCHER_VERSION} 落后于 registry latest=${latest}（常见于 pnpm dlx 复用 @latest 缓存）。请执行: pnpm dlx ${LAUNCHER_PKG_NAME}@${latest} 或删除 pnpm-cache/dlx 下对应目录`
    );
  }
}

async function main() {
  console.error(`[ada-mcp launcher] ${LAUNCHER_PKG_NAME}@${LAUNCHER_VERSION}`);
  const { forward: extra, forcedRegistry } = parseLauncherArgv();
  const runner = await resolvePackageRunner();
  const { best: probedBest, probeResults, forced: registryForced } =
    await resolveInstallRegistry(forcedRegistry);

  if (registryForced) {
    console.error(`[ada-mcp launcher] registry forced (skip probe): ${probedBest}`);
  } else {
    console.error(`[ada-mcp launcher] registry probe selected: ${probedBest}`);
    for (const { candidate, latency, speedKBps, bytesRead } of probeResults) {
      if (speedKBps != null) {
        console.error(
          `[ada-mcp launcher]   ${candidate} -> ${speedKBps.toFixed(0)} KB/s (${bytesRead} bytes / ${latency}ms)`
        );
      } else {
        console.error(`[ada-mcp launcher]   ${candidate} -> fail`);
      }
    }
  }

  await warnIfLauncherStale(probedBest);

  const {
    spec: pkgSpec,
    version: mcpVersion,
    source: mcpSource,
    registryLatest
  } = await resolveMcpServerSpec(probedBest);
  const installRegistry = await registryForPinnedVersion(
    probedBest,
    MCP_SERVER_PKG,
    mcpVersion,
    registryLatest
  );
  console.error(
    `[ada-mcp launcher] ${LAUNCHER_PKG_NAME}@${LAUNCHER_VERSION} -> ${pkgSpec} (${mcpSource}${mcpVersion !== "latest" ? `, ${mcpVersion}` : ""})`
  );

  const cwd = process.cwd();
  warnIfBadCwd(cwd);
  writeProjectNpmrc(cwd, installRegistry);

  const childArgs = runnerArgs(runner, pkgSpec, extra);
  const cmd = runnerCommand(runner);
  const childEnv = {
    ...process.env,
    npm_config_registry: installRegistry,
    ADA_MCP_LAUNCHER_RAN: "1",
    ADA_MCP_PACKAGE_RUNNER: runner,
    ADA_MCP_LAUNCHER_VERSION: LAUNCHER_VERSION,
    ADA_MCP_SERVER_RESOLVED_VERSION: mcpVersion
  };
  console.error(
    `[ada-mcp launcher] runner=${runner} exec: ${runnerExecLabel(runner, childArgs)} (registry=${installRegistry} via env/.npmrc)`
  );

  const useWinNpxFallback = process.platform === "win32" && runner === "npx";
  const child = useWinNpxFallback
    ? spawnMcpServerViaNodeInstall(pkgSpec, extra, { cwd, env: childEnv })
    : spawnRunner(cmd, childArgs, {
        stdio: "inherit",
        cwd,
        env: childEnv
      });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
  child.on("error", (error) => {
    console.error(`[ada-mcp launcher] failed to start ${runner}:`, error);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error("[ada-mcp launcher]", error);
  process.exit(1);
});
