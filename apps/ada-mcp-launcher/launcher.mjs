#!/usr/bin/env node
/**
 * 零依赖：探测最快 npm 镜像后执行 pnpm dlx / npx -y @ada-mcp/mcp-server
 * 未设置 ADA_MCP_SERVER_VERSION 时，从所选 registry 读取 mcp-server 的 latest 版本（与 pnpm dlx 无 @ 版本一致）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  detectBestRegistry,
  fetchPackageLatestVersion,
  registryCandidateList
} from "./registry-probe.mjs";

const LAUNCHER_DIR = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER_PKG = JSON.parse(fs.readFileSync(path.join(LAUNCHER_DIR, "package.json"), "utf8"));
const LAUNCHER_VERSION = String(LAUNCHER_PKG.version ?? "0.0.0");
const LAUNCHER_PKG_NAME = "@ada-mcp/launcher";

const MCP_SERVER_PKG = process.env.ADA_MCP_SERVER_PACKAGE?.trim() || "@ada-mcp/mcp-server";
/** 低于此版本的 mcp-server 易出现 zod/v3、Playwright 404 等问题（registry latest 更低时抬高） */
const MIN_MCP_SERVER_VERSION = "0.1.24";

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
    return { spec: `${MCP_SERVER_PKG}@${v}`, version: v, source: "env" };
  }

  const latest = await fetchPackageLatestVersion(MCP_SERVER_PKG, registry);
  if (latest) {
    const v = applyMinMcpServerVersion(latest, "registry latest");
    return { spec: `${MCP_SERVER_PKG}@${v}`, version: v, source: "registry-latest" };
  }

  console.error(
    `[ada-mcp launcher][warn] 无法从 registry 读取 ${MCP_SERVER_PKG} latest，使用 @latest 标签`
  );
  return { spec: `${MCP_SERVER_PKG}@latest`, version: "latest", source: "tag-latest" };
}

function forwardArgs() {
  const argv = process.argv.slice(2);
  if (argv[0] === "dlx-bootstrap") {
    return argv.slice(1);
  }
  return argv;
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

function spawnRunner(executable, args, options = {}) {
  const { stdio = "inherit", cwd, env } = options;
  const childEnv = env ?? process.env;
  if (process.platform === "win32") {
    const comspec = process.env.ComSpec || "cmd.exe";
    const line = [quoteCmdToken(executable), ...args.map(quoteCmdToken)].join(" ");
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

function runnerArgs(runner, pkgSpec, extra) {
  if (runner === "pnpm") {
    return ["dlx", pkgSpec, ...extra];
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
  const argv1 = process.argv[1] ?? "";
  if (/[\\/]pnpm(?:\.cmd)?$/i.test(argv1)) {
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
  if (invokedViaNpx()) {
    return "npx";
  }
  const pnpmOk = await commandAvailable(runnerCommand("pnpm"));
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
  const runner = await resolvePackageRunner();
  const candidates = registryCandidateList();
  const { best, probeResults } = await detectBestRegistry(candidates);
  console.error(`[ada-mcp launcher] registry probe selected: ${best}`);
  for (const { candidate, latency } of probeResults) {
    console.error(`[ada-mcp launcher]   ${candidate} -> ${latency === null ? "fail" : `${latency}ms`}`);
  }

  await warnIfLauncherStale(best);

  const { spec: pkgSpec, version: mcpVersion, source: mcpSource } = await resolveMcpServerSpec(best);
  console.error(
    `[ada-mcp launcher] ${LAUNCHER_PKG_NAME}@${LAUNCHER_VERSION} -> ${pkgSpec} (${mcpSource}${mcpVersion !== "latest" ? `, ${mcpVersion}` : ""})`
  );

  const cwd = process.cwd();
  writeProjectNpmrc(cwd, best);

  const extra = forwardArgs();
  const childArgs = runnerArgs(runner, pkgSpec, extra);
  const cmd = runnerCommand(runner);
  console.error(
    `[ada-mcp launcher] runner=${runner} exec: ${runnerExecLabel(runner, childArgs)} (registry=${best} via env/.npmrc)`
  );

  const child = spawnRunner(cmd, childArgs, {
    stdio: "inherit",
    cwd,
    env: {
      ...process.env,
      npm_config_registry: best,
      ADA_MCP_LAUNCHER_RAN: "1",
      ADA_MCP_PACKAGE_RUNNER: runner,
      ADA_MCP_LAUNCHER_VERSION: LAUNCHER_VERSION,
      ADA_MCP_SERVER_RESOLVED_VERSION: mcpVersion
    }
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
