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
import { isMcpFastStartEnv } from "./probe-env.mjs";
import {
  detectBestRegistry,
  fetchPackageLatestVersion,
  fetchPackageVersionExists,
  normalizeRegistryUrl,
  registryCandidateList,
  resolveForcedRegistryUrl
} from "./registry-probe.mjs";
import {
  isSkipRegistryProbeEnv,
  readRegistryProbeCache,
  registryProbeCacheTtlMs,
  writeRegistryProbeCache
} from "./registry-probe-cache.mjs";
import { ensureWinConsoleUtf8 } from "./console-encoding.mjs";
import {
  clearLauncherInflight,
  detectConcurrentLauncher,
  writeLauncherInflight
} from "./launcher-inflight.mjs";
import { runExclusiveRegistryProbe } from "./launcher-probe-lock.mjs";
import {
  areMcpServerDepsPresent,
  isMcpServerCacheReady,
  mcpServerCacheDir,
  mcpServerCliPath,
  runExclusiveMcpServerInstall
} from "./win-mcp-server-cache.mjs";
import { mcpLog, mcpLogIfVerbose, mcpLogStartup, shouldMcpLog } from "./mcp-log.mjs";
import { runExclusiveAdaInstall, waitForAdaGlobalInstallLock } from "./ada-install-lock.mjs";
import { seedDepsInstallProbeState } from "./seed-deps-state.mjs";

const NPMJS_REGISTRY = "https://registry.npmjs.org";

function isTruthyEnv(name) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** npx 走 ~/.ada/mcp-server-run；ADA_MCP_DISABLE_NPX_INSTALL_CACHE=1 恢复原生 npx */
function shouldUseMcpServerInstallCache(runner) {
  return runner === "npx" && !isTruthyEnv("ADA_MCP_DISABLE_NPX_INSTALL_CACHE");
}

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
      mcpLog(
        "warn",
        `${label}@${version} below min ${MIN_MCP_SERVER_VERSION}, using ${MIN_MCP_SERVER_VERSION}`
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

  if (isMcpFastStartEnv()) {
    const v = MIN_MCP_SERVER_VERSION;
    return {
      spec: `${MCP_SERVER_PKG}@${v}`,
      version: v,
      source: "launcher-pin",
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

  mcpLog("warn", `cannot read ${MCP_SERVER_PKG} latest from registry, using @latest`);
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
    forward: normalizeMcpInstallDepsArgs(forward),
    forcedRegistry: forcedRegistry ? normalizeRegistryUrl(forcedRegistry) : ""
  };
}

/** 优先 MCP 握手：默认不把 --install-deps=all 传给子进程（改 playwright，后台再 ada_install_deps） */
function normalizeMcpInstallDepsArgs(forward) {
  if (isTruthyEnv("ADA_MCP_ALLOW_BOOTSTRAP_ALL")) {
    return forward;
  }
  let downgraded = false;
  const out = forward.map((arg) => {
    if (arg === "--install-deps=all") {
      downgraded = true;
      return "--install-deps=playwright";
    }
    if (arg.startsWith("--install-deps=all,")) {
      downgraded = true;
      return arg.replace("--install-deps=all", "--install-deps=playwright");
    }
    return arg;
  });
  if (downgraded) {
    mcpLog(
      "warn",
      "connect-first: --install-deps=all -> playwright (use ada_install_deps for mobile; ADA_MCP_ALLOW_BOOTSTRAP_ALL=1 to keep all)"
    );
  }
  return out;
}

async function resolveInstallRegistry(forcedRegistry) {
  const envForced = forcedRegistry || resolveForcedRegistryUrl();
  if (envForced) {
    return {
      best: envForced,
      probeResults: [],
      forced: true,
      fromCache: false
    };
  }
  const candidates = registryCandidateList();
  if (isSkipRegistryProbeEnv()) {
    const best = normalizeRegistryUrl(candidates[0] ?? NPMJS_REGISTRY);
    return {
      best,
      probeResults: [],
      forced: false,
      fromCache: false,
      skippedProbe: true
    };
  }
  const cached = readRegistryProbeCache(candidates, LAUNCHER_VERSION);
  if (cached) {
    return {
      best: cached.best,
      candidates,
      probeResults: cached.probeResults,
      forced: false,
      fromCache: true
    };
  }
  return runExclusiveRegistryProbe(async () => {
    const again = readRegistryProbeCache(candidates, LAUNCHER_VERSION);
    if (again) {
      return {
        best: again.best,
        candidates,
        probeResults: again.probeResults,
        forced: false,
        fromCache: true
      };
    }
    const probed = await detectBestRegistry(candidates);
    writeRegistryProbeCache(
      {
        best: probed.best,
        candidates,
        probeResults: probed.probeResults
      },
      LAUNCHER_VERSION
    );
    return { ...probed, forced: false, fromCache: false };
  });
}

/** 镜像 latest 滞后或缺包时，安装回退官方 npmjs（含 fast-start / launcher-pin，避免镜像未同步新版本） */
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
      mcpLog("warn", `mirror latest=${registryLatest}, install ${version} via ${NPMJS_REGISTRY}`);
    } else {
      mcpLog("warn", `${packageName}@${version} missing on ${reg}, install via ${NPMJS_REGISTRY}`);
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
    // --silent：不输出 Progress/resolved（pnpm 写 stderr，Cursor 会标成 error）
    return ["--silent", "dlx", pkgSpec, ...extra];
  }
  // Windows npx 对 scoped 包默认执行裸命令 `mcp-server`，.cmd shim 常无法解析（见 spawnMcpServer）
  if (process.platform === "win32") {
    return ["-y", "--quiet", "--package", pkgSpec, MCP_SERVER_BIN, ...extra];
  }
  return ["-y", "--quiet", pkgSpec, ...extra];
}

/** 压低 pnpm/npx 安装进度，避免 Host 把 stderr 当 MCP 错误 */
function runnerChildEnv(base) {
  return {
    ...base,
    npm_config_loglevel: base.npm_config_loglevel ?? "error",
    PNPM_REPORTER: base.PNPM_REPORTER ?? "silent"
  };
}

function runnerExecLabel(runner, args) {
  const cmd = runnerCommand(runner);
  return `${cmd} ${args.join(" ")}`;
}

/** 外层 Host 如何拉起 launcher（用于 auto 时对齐内层 runner） */
function detectOuterInvocation() {
  if (invokedViaNpx()) {
    return "npx";
  }
  if (invokedViaPnpm()) {
    return "pnpm";
  }
  return "node";
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
  const argvJoined = process.argv.join(" ");
  if (/[\\/]pnpm(?:\.cmd)?(?:\s|$)/i.test(argvJoined)) {
    return true;
  }
  if (/[\\/]pnpm-cache[\\/]dlx[\\/]/i.test(argvJoined)) {
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
  if (lifecycle === "npx" || lifecycle === "exec") {
    return true;
  }
  const argvJoined = process.argv.join(" ");
  if (/[\\/]npx(?:\.cmd)?(?:\s|$)/i.test(argvJoined)) {
    return true;
  }
  /** Host 用 `npx -y @ada-mcp/launcher` 时脚本在 npm _npx 缓存目录 */
  if (/[\\/]_npx[\\/]/i.test(argvJoined) || /[\\/]__npx[\\/]/i.test(argvJoined)) {
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

async function resolvePackageRunner(outerInvocation) {
  const raw = String(process.env.ADA_MCP_PACKAGE_RUNNER ?? "auto").trim().toLowerCase();
  if (raw === "pnpm" || raw === "npx") {
    return raw;
  }
  if (outerInvocation === "npx") {
    if (shouldUseMcpServerInstallCache("npx")) {
      const hintVer = process.env.ADA_MCP_SERVER_VERSION?.trim() || MIN_MCP_SERVER_VERSION;
      const hintSpec = `${MCP_SERVER_PKG}@${hintVer}`;
      if (isMcpServerCacheReady(mcpServerCacheDir(hintSpec), hintSpec)) {
        mcpLogIfVerbose("npx: reuse ~/.ada/mcp-server-run install cache");
        return "npx";
      }
    }
    if (process.platform === "win32" && !isTruthyEnv("ADA_MCP_FORCE_NPX")) {
      if (
        isTruthyEnv("ADA_MCP_WINDOWS_PREFER_PNPM") &&
        (await commandAvailable(runnerCommand("pnpm")))
      ) {
        mcpLogIfVerbose("Windows: ADA_MCP_WINDOWS_PREFER_PNPM=1, using pnpm dlx");
        return "pnpm";
      }
    }
    return "npx";
  }
  if (outerInvocation === "pnpm") {
    return "pnpm";
  }
  const pnpmOk = await commandAvailable(runnerCommand("pnpm"));
  if (pnpmOk) {
    return "pnpm";
  }
  const npxOk = await commandAvailable(runnerCommand("npx"));
  if (npxOk) {
    return "npx";
  }
  mcpLog("warn", "pnpm/npx not found on PATH, trying npx");
  return "npx";
}

/**
 * npx 稳定缓存：npm install 到 ~/.ada/mcp-server-run 后用 node 跑 dist/cli.cjs。
 * Windows 上 node.exe 必须直接 spawn（勿经 cmd /s /c，否则带空格路径会被错误加引号）。
 */
function writeMcpServerInstallPackageJson(tmpDir) {
  const body = {
    name: "ada-mcp-run",
    private: true,
    description: "ephemeral install root for npx install cache",
    overrides: {
      zod: "3.25.76",
      glob: "^13.0.0"
    }
  };
  fs.writeFileSync(path.join(tmpDir, "package.json"), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

function spawnNodeMcpServerCli(cli, extra, options) {
  const { cwd, env } = options;
  if (!fs.existsSync(cli)) {
    throw new Error(`mcp-server entry not found: ${cli}`);
  }
  const nodeExe = String(process.execPath ?? "node").replace(/^"(.+)"$/, "$1");
  return spawn(nodeExe, [cli, ...extra], {
    stdio: "inherit",
    cwd,
    env,
    shell: false,
    windowsHide: true
  });
}

async function spawnMcpServerViaNodeInstall(pkgSpec, extra, options) {
  const installDir = mcpServerCacheDir(pkgSpec);
  const cli = mcpServerCliPath(installDir);

  if (isMcpServerCacheReady(installDir, pkgSpec)) {
    mcpLogStartup(`npx install cache: reuse cached ${pkgSpec}`);
    return spawnNodeMcpServerCli(cli, extra, options);
  }

  await runExclusiveMcpServerInstall(
    installDir,
    async () => {
    if (isMcpServerCacheReady(installDir, pkgSpec)) {
      return;
    }
    fs.mkdirSync(installDir, { recursive: true });
    if (fs.existsSync(cli) && !areMcpServerDepsPresent(installDir)) {
      mcpLog("warn", `mcp-server install cache incomplete (missing deps), reinstalling ${pkgSpec}`);
      try {
        fs.rmSync(path.join(installDir, "node_modules"), { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    writeMcpServerInstallPackageJson(installDir);
    mcpLog("info", `npx install cache: npm install ${pkgSpec} (cache ${installDir})`);
    const installEnv = runnerChildEnv({
      ...options.env,
      npm_config_loglevel: "silent"
    });
    execRunnerSync(
      "npm",
      ["install", pkgSpec, "--omit=dev", "--no-fund", "--no-audit", "--loglevel=silent"],
      { cwd: installDir, env: installEnv, stdio: "inherit" }
    );
    if (!isMcpServerCacheReady(installDir, pkgSpec)) {
      throw new Error(`mcp-server install incomplete: ${cli}`);
    }
    },
    { isReady: () => isMcpServerCacheReady(installDir, pkgSpec) }
  );

  mcpLogStartup(`npx install cache: cached ${pkgSpec}`);
  return spawnNodeMcpServerCli(cli, extra, options);
}

function warnIfBadCwd(cwd) {
  if (process.platform === "win32" && /\\Windows\\System32$/i.test(path.normalize(cwd))) {
    mcpLog("warn", "cwd is C:\\Windows\\System32; run from user or project directory");
  }
}

/** 避免在 System32、磁盘根等目录写入 .npmrc；ADA_MCP_WRITE_PROJECT_NPMRC=1 强制写入 */
function isSafeProjectCwdForNpmrc(cwd) {
  if (isTruthyEnv("ADA_MCP_WRITE_PROJECT_NPMRC")) {
    return true;
  }
  const normalized = path.normalize(String(cwd ?? ""));
  if (!normalized) {
    return false;
  }
  if (process.platform === "win32") {
    if (/\\Windows\\System32$/i.test(normalized)) {
      return false;
    }
    if (/^[A-Za-z]:[\\/]?$/.test(normalized)) {
      return false;
    }
  }
  if (normalized === "/" || normalized === "\\") {
    return false;
  }
  try {
    if (fs.existsSync(path.join(cwd, "package.json"))) {
      return true;
    }
    if (fs.existsSync(path.join(cwd, ".git"))) {
      return true;
    }
    if (fs.existsSync(path.join(cwd, "pnpm-workspace.yaml"))) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function writeProjectNpmrc(cwd, registry) {
  if (!isSafeProjectCwdForNpmrc(cwd)) {
    mcpLogIfVerbose(`skip writing .npmrc (cwd not a project dir): ${cwd}`);
    return;
  }
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
    mcpLog(
      "warn",
      `launcher@${LAUNCHER_VERSION} behind registry latest=${latest}; try pnpm dlx ${LAUNCHER_PKG_NAME}@${latest}`
    );
  }
}

async function main() {
  ensureWinConsoleUtf8();
  writeLauncherInflight("start");
  const concurrent = detectConcurrentLauncher();
  if (concurrent) {
    mcpLog(
      "warn",
      `another launcher is active (pid ${concurrent.pid}); skip duplicate registry probe`
    );
    if (!process.env.ADA_MCP_SKIP_REGISTRY_PROBE?.trim()) {
      process.env.ADA_MCP_SKIP_REGISTRY_PROBE = "1";
    }
  }
  try {
    await mainLauncherBody();
  } finally {
    clearLauncherInflight();
  }
}

async function mainLauncherBody() {
  const { forward: extra, forcedRegistry } = parseLauncherArgv();
  const outerInvocation = detectOuterInvocation();
  const runner = await resolvePackageRunner(outerInvocation);
  const {
    best: probedBest,
    probeResults,
    forced: registryForced,
    fromCache: registryFromCache,
    skippedProbe: registrySkippedProbe
  } = await resolveInstallRegistry(forcedRegistry);

  if (shouldMcpLog("info")) {
    if (registryForced) {
      mcpLog("info", `registry forced: ${probedBest}`);
    } else if (registrySkippedProbe) {
      mcpLog("info", `registry probe skipped (ADA_MCP_SKIP_REGISTRY_PROBE): ${probedBest}`);
    } else if (registryFromCache) {
      mcpLog("info", `registry probe cache (${Math.round(registryProbeCacheTtlMs() / 60000)}m ttl): ${probedBest}`);
    } else if (isMcpFastStartEnv()) {
      mcpLog("info", `registry probe fast-start (parallel, capped): ${probedBest}`);
    } else {
      mcpLog("info", `registry probe: ${probedBest}`);
      for (const { candidate, latency, speedKBps, bytesRead } of probeResults) {
        if (speedKBps != null) {
          mcpLog("info", `  ${candidate} -> ${speedKBps.toFixed(0)} KB/s (${bytesRead}B/${latency}ms)`);
        } else {
          mcpLog("info", `  ${candidate} -> unreachable`);
        }
      }
    }
  }

  if (!isMcpFastStartEnv()) {
    await warnIfLauncherStale(probedBest);
  }
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

  await waitForAdaGlobalInstallLock();

  mcpLogStartup(
    `${LAUNCHER_PKG_NAME}@${LAUNCHER_VERSION} -> ${pkgSpec} (${mcpSource}${mcpVersion !== "latest" ? `, ${mcpVersion}` : ""})`
  );

  const cwd = process.cwd();
  warnIfBadCwd(cwd);
  writeProjectNpmrc(cwd, installRegistry);

  const childArgs = runnerArgs(runner, pkgSpec, extra);
  const cmd = runnerCommand(runner);
  const childEnv = runnerChildEnv({
    ...process.env,
    npm_config_registry: installRegistry,
    ADA_MCP_LAUNCHER_RAN: "1",
    ADA_MCP_LAUNCHER_REGISTRY: installRegistry,
    ADA_MCP_REGISTRY: process.env.ADA_MCP_REGISTRY?.trim() || installRegistry,
    ADA_MCP_OUTER_RUNNER: outerInvocation,
    ADA_MCP_PACKAGE_RUNNER: runner,
    ADA_MCP_LAUNCHER_VERSION: LAUNCHER_VERSION,
    ADA_MCP_SERVER_RESOLVED_VERSION: mcpVersion,
    ADA_MCP_FAST_START: process.env.ADA_MCP_FAST_START?.trim() || "1",
    ADA_MCP_SKIP_PREINSTALL_PROBE: process.env.ADA_MCP_SKIP_PREINSTALL_PROBE?.trim() || "1",
    ADA_MCP_LOG_LOCALE:
      process.env.ADA_MCP_LOG_LOCALE?.trim() ||
      (process.platform === "win32" ? "en" : "")
  });
  const runnerSwitch =
    outerInvocation !== runner
      ? `; inner=${runner} (Windows: pnpm dlx, not npx fallback — ADA_MCP_FORCE_NPX=1 to keep npx)`
      : "";
  mcpLogStartup(
    `host=${outerInvocation} runner=${runner}${runnerSwitch} | ${runnerExecLabel(runner, childArgs)} | npm_registry=${installRegistry}`
  );

  await runExclusiveAdaInstall("seed-deps-state", async () => {
    seedDepsInstallProbeState({
      registry: installRegistry,
      launcherVersion: LAUNCHER_VERSION
    });
  });

  writeLauncherInflight("spawn-mcp-server");
  const useMcpServerInstallCache = shouldUseMcpServerInstallCache(runner);
  const child = useMcpServerInstallCache
    ? await spawnMcpServerViaNodeInstall(pkgSpec, extra, { cwd, env: childEnv })
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
    const msg = error instanceof Error ? error.message : String(error);
    mcpLog(
      "error",
      `failed to start ${runner}: ${msg} (node=${process.execPath}; if path has spaces, upgrade launcher or use pnpm dlx)`
    );
    process.exit(1);
  });
}

main().catch((error) => {
  mcpLog("error", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
