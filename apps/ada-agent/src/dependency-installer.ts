import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentConfig } from "./types.js";
import { log } from "./logger.js";
import { loadConfig, resolveWorkspaceRoot } from "./config.js";
import {
  ensureDepsInstallWorkspace,
  legacyDepsStateFileCandidates,
  resolveDepsInstallRoot,
  resolveDepsStateFilePath,
  resolveGlobalAdaHomeSync,
  resolvePlaywrightBrowsersPath
} from "./deps-install-paths.js";
import {
  depsRequire,
  ensurePackageResolution,
  formatPackageResolutionLine,
  getPackageSource,
  getSharedDepsRoot,
  isPackageAvailable,
  needsSharedDepsInstall,
  type PackageSource
} from "./deps-resolution.js";
import { applyAdaToolsToProcessEnv, probeHdc } from "./tools-paths.js";

export {
  legacyDepsStateFileCandidates,
  resolveDepsInstallRoot,
  resolveDepsStateFilePath,
  resolveGlobalAdaHome,
  resolveInstallContextCwd,
  resolvePlaywrightBrowsersPath
} from "./deps-install-paths.js";
import {
  ensureNativeWebDrivers,
  listChromedriverCfTVersions,
  listLocalChromedriverVersions,
  resolveNativeDrivers,
  resolveNativeDriversDir
} from "@ada/native-drivers";
import {
  CHINA_PLAYWRIGHT_HOST_PRIORITY,
  DEFAULT_NPM_REGISTRY_CANDIDATES,
  DEFAULT_PLAYWRIGHT_HOST_CANDIDATES,
  formatDownloadProbeLine,
  probeDownloadSample,
  type DownloadProbeResult
} from "@ada/download-probe";

const legacyRequire = createRequire(path.join(process.cwd(), "package.json"));

async function ensureSharedDepsModuleResolution(onLogLine?: (line: string) => void) {
  return ensurePackageResolution(onLogLine);
}

/** 与 @ada-mcp/mcp-server 依赖锁定一致；避免 pnpm add playwright 解析到镜像 latest（如 1.60）导致浏览器包 404 */
const PINNED_PLAYWRIGHT_VERSION = "1.59.1";
const PINNED_ZOD_VERSION = "3.25.76";
/** 与 dependency-installer 内 appium 驱动安装探测一致 */
const PINNED_APPIUM_VERSION = "3.3.1";
/** 与 @ada-mcp/mcp-server package.json 一致 */
const PINNED_SELENIUM_WEBDRIVER_VERSION = "4.34.0";
/** Harmony 自动化基线（与本地 command-line-tools 6.1.x 对齐） */
const PINNED_HYPIUM_DRIVER_VERSION = "6.1.210";

function playwrightInstallPackageSpec(): string {
  const fromEnv = process.env.ADA_PLAYWRIGHT_VERSION?.trim();
  return `playwright@${fromEnv || PINNED_PLAYWRIGHT_VERSION}`;
}

function appiumInstallPackageSpec(): string {
  const fromEnv = process.env.ADA_APPIUM_VERSION?.trim();
  return `appium@${fromEnv || PINNED_APPIUM_VERSION}`;
}

function seleniumWebdriverInstallPackageSpec(): string {
  const fromEnv = process.env.ADA_SELENIUM_WEBDRIVER_VERSION?.trim();
  return `selenium-webdriver@${fromEnv || PINNED_SELENIUM_WEBDRIVER_VERSION}`;
}

function hypiumDriverInstallPackageSpec(): string {
  const fromEnv = process.env.ADA_HYPIUM_DRIVER_VERSION?.trim();
  return `hypium-driver@${fromEnv || PINNED_HYPIUM_DRIVER_VERSION}`;
}

function packageNeededForScope(
  pkg: string,
  flags: { needPlaywright: boolean; needAppium: boolean; needSelenium: boolean; needHarmony: boolean }
): boolean {
  if (pkg === "playwright") return flags.needPlaywright;
  if (pkg === "appium") return flags.needAppium;
  if (pkg === "selenium-webdriver") return flags.needSelenium;
  if (pkg === "hypium-driver") return flags.needHarmony;
  return false;
}

function resolveInstallPackageSpecs(packages: string[]): string[] {
  const out: string[] = [];
  for (const pkg of packages) {
    if (pkg === "playwright") {
      out.push(playwrightInstallPackageSpec());
      continue;
    }
    if (pkg === "appium") {
      out.push(appiumInstallPackageSpec());
      continue;
    }
    if (pkg === "selenium-webdriver") {
      out.push(seleniumWebdriverInstallPackageSpec());
      continue;
    }
    if (pkg === "hypium-driver") {
      out.push(hypiumDriverInstallPackageSpec());
      continue;
    }
    if (pkg === "zod") {
      const fromEnv = process.env.ADA_ZOD_VERSION?.trim();
      out.push(`zod@${fromEnv || PINNED_ZOD_VERSION}`);
      continue;
    }
    out.push(pkg);
  }
  return out;
}

interface WorkspacePackageConflict {
  name: string;
  installed: string;
  expected: string;
  reason: string;
}

function skipConflictRemoval(): boolean {
  const v = process.env.ADA_DEPS_SKIP_CONFLICT_REMOVAL?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function readInstalledPackageVersion(packageName: string): string | undefined {
  try {
    const pkgPath = depsRequire().resolve(`${packageName}/package.json`);
    const raw = readFileSync(pkgPath, "utf8");
    return String((JSON.parse(raw) as { version?: unknown }).version ?? "").trim() || undefined;
  } catch {
    return undefined;
  }
}

function zodExportsV3Subpath(version: string): boolean {
  try {
    const pkgPath = depsRequire().resolve("zod/package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const exportsField = (JSON.parse(raw) as { exports?: Record<string, unknown> }).exports;
    if (exportsField && "./v3" in exportsField) {
      return true;
    }
  } catch {
    // fall through to semver heuristic
  }
  const major = Number(version.split(".")[0]);
  const minor = Number(version.split(".")[1]);
  if (major > 3) {
    return true;
  }
  return major === 3 && minor >= 25;
}

function detectWorkspacePackageConflicts(packages: string[]): WorkspacePackageConflict[] {
  const conflicts: WorkspacePackageConflict[] = [];
  const expectedPlaywright = process.env.ADA_PLAYWRIGHT_VERSION?.trim() || PINNED_PLAYWRIGHT_VERSION;
  const expectedZod = process.env.ADA_ZOD_VERSION?.trim() || PINNED_ZOD_VERSION;

  if (packages.includes("playwright") && isPackageAvailable("playwright")) {
    const installed = readInstalledPackageVersion("playwright");
    if (installed && installed !== expectedPlaywright) {
      conflicts.push({
        name: "playwright",
        installed,
        expected: expectedPlaywright,
        reason: "与 ADA 锁定的 Playwright 浏览器包版本不一致"
      });
    }
  }

  if (isPackageAvailable("@modelcontextprotocol/sdk") && isPackageAvailable("zod")) {
    const zodVer = readInstalledPackageVersion("zod");
    if (zodVer && !zodExportsV3Subpath(zodVer)) {
      conflicts.push({
        name: "zod",
        installed: zodVer,
        expected: expectedZod,
        reason: "当前 zod 不支持 zod/v3，与 @modelcontextprotocol/sdk 冲突"
      });
    }
  }

  return conflicts;
}

function packagesToRemoveForConflicts(conflicts: WorkspacePackageConflict[]): string[] {
  const names = new Set<string>();
  for (const c of conflicts) {
    names.add(c.name);
    if (c.name === "playwright") {
      names.add("playwright-core");
    }
  }
  return Array.from(names);
}

async function removeWorkspacePackages(names: string[], onLogLine?: (line: string) => void): Promise<boolean> {
  const unique = Array.from(new Set(names)).filter(Boolean);
  if (unique.length === 0) {
    return true;
  }
  const installCwd = getSharedDepsRoot() ?? (await resolveDepsInstallRoot());
  const timeoutMs = installStrategyTimeoutMs();
  const attempts: Array<{ tool: string; args: string[] }> = [
    { tool: "pnpm", args: ["remove", ...unique] },
    { tool: "npm", args: ["uninstall", ...unique] }
  ];
  for (const { tool, args } of attempts) {
    try {
      await runCommand(tool, args, { cwd: installCwd, timeoutMs, onLogLine });
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

/** 安装前卸载工作区中与锁定版本冲突的包，避免 pnpm add 无法降级 */
async function reconcileWorkspacePackageConflicts(
  packages: string[],
  onLogLine?: (line: string) => void
): Promise<string[]> {
  if (skipConflictRemoval()) {
    return [];
  }
  const conflicts = detectWorkspacePackageConflicts(packages);
  if (conflicts.length === 0) {
    return [];
  }
  for (const c of conflicts) {
    onLogLine?.(`[deps] 检测到冲突 ${c.name}@${c.installed}，目标 ${c.expected}（${c.reason}）`);
  }
  const toRemove = packagesToRemoveForConflicts(conflicts);
  onLogLine?.(`[deps] 正在卸载: ${toRemove.join(", ")}`);
  const removed = await removeWorkspacePackages(toRemove, onLogLine);
  if (!removed) {
    onLogLine?.("[deps][warn] 自动卸载未完成，请手动执行: pnpm remove " + toRemove.join(" "));
  } else {
    onLogLine?.("[deps] 冲突包已卸载，将安装锁定版本");
  }
  const extraInstall: string[] = [];
  if (conflicts.some((c) => c.name === "zod") && isPackageAvailable("@modelcontextprotocol/sdk")) {
    extraInstall.push("zod");
  }
  return extraInstall;
}

function shouldUseShell(command: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }
  return command === "npm" || command === "pnpm";
}

interface RunCommandOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs?: number;
  /** 当提供时，子进程 stdout/stderr 会回传为行（并同时仍向父进程终端输出时仅回传，不 inherit） */
  onLogLine?: (line: string) => void;
  /** 过滤子进程行（返回 false 则丢弃） */
  logFilter?: (line: string) => boolean;
}

function briefErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.split(/\r?\n/)[0]?.trim() || error.message;
  }
  return String(error).split(/\r?\n/)[0]?.trim() || String(error);
}

function stripAnsiCodes(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/** 去掉 CLI 行的 Error: × / Error: x 等前缀，供 [deps][warn] 人类可读输出 */
function stripCliErrorPrefix(message: string): string {
  let t = stripAnsiCodes(message).trim();
  t = t.replace(/^Error:\s*/i, "");
  while (/^[×x✖✗❌\u00d7\u2716\u2717]\s*/iu.test(t)) {
    t = t.replace(/^[×x✖✗❌\u00d7\u2716\u2717]\s*/iu, "");
  }
  return t.trim();
}

function isAppiumDriverAlreadyInstalledMessage(message: string): boolean {
  const raw = stripAnsiCodes(message).trim();
  return /already installed/i.test(raw) && /driver named/i.test(raw);
}

function formatDepsWarnLine(message: string): string {
  const body = stripCliErrorPrefix(message);
  return body ? `[deps][warn] ${body}` : "";
}

/** MCP 启动时用人可读行替代 JSON progress，减少 stderr 噪音 */
let depsHumanLog: ((line: string) => void) | undefined;

function depsVerboseEnabled(): boolean {
  return isTruthyEnv("ADA_DEPS_VERBOSE");
}

function shouldEmitPlaywrightCliLine(line: string): boolean {
  if (depsVerboseEnabled()) {
    const t = line.trim();
    return t.length > 0 && !/^\s*at\s/.test(t) && !t.includes("processTicksAndRejections");
  }
  const t = line.trim();
  if (!t) {
    return false;
  }
  if (/^\s*at\s/.test(line) || t.includes("coreBundle.js") || t.includes("processTicksAndRejections")) {
    return false;
  }
  if (t.includes("<Error>") || t.includes("NoSuchKey") || t.startsWith("<?xml")) {
    return false;
  }
  if (t.includes("Download failure, code=") && !t.startsWith("Error:")) {
    return false;
  }
  return true;
}

function summarizePlaywrightCliLine(line: string): string | null {
  const t = line.trim();
  if (/^Downloading Chrome for Testing/i.test(t) || /^Downloading chromium/i.test(t)) {
    const from = t.match(/\bfrom\s+(https?:\/\/\S+)/i)?.[1];
    return from ? `[playwright] 正在下载 Chromium（${from}）` : "[playwright] 正在下载 Chromium…";
  }
  if (/^Error:\s*Download failed:/i.test(t)) {
    const code = t.match(/\bcode[=\s]+(\d{3})\b/i)?.[1] ?? t.match(/returned code (\d{3})/i)?.[1];
    return code ? `[playwright][warn] 镜像返回 HTTP ${code}，将尝试下一个 CDN` : "[playwright][warn] 镜像下载失败，将尝试下一个 CDN";
  }
  if (/^Failed to install browsers/i.test(t) || /^Failed to download Chrome/i.test(t)) {
    return "[playwright][warn] 当前镜像未安装成功";
  }
  if (/^Progress:/i.test(t)) {
    const pct = t.match(/(\d{1,3})%/)?.[1];
    return pct ? `[playwright] 下载进度 ${pct}%` : "[playwright] 下载中…";
  }
  if (t.length > 200) {
    return `[playwright] ${t.slice(0, 120)}…`;
  }
  return t.startsWith("[playwright]") ? t : `[playwright] ${t}`;
}

function createPlaywrightInstallLogSink(onLogLine?: (line: string) => void): ((line: string) => void) | undefined {
  if (!onLogLine) {
    return undefined;
  }
  const seen = new Set<string>();
  let lastProgressEmitAt = 0;
  return (line: string) => {
    if (!shouldEmitPlaywrightCliLine(line)) {
      return;
    }
    if (depsVerboseEnabled()) {
      onLogLine(line.trimEnd());
      return;
    }
    const summary = summarizePlaywrightCliLine(line);
    if (!summary) {
      return;
    }
    const isProgress = /^Progress:/i.test(line.trim());
    if (isProgress) {
      const now = Date.now();
      if (now - lastProgressEmitAt < 12_000) {
        return;
      }
      lastProgressEmitAt = now;
    } else if (seen.has(summary)) {
      return;
    }
    seen.add(summary);
    onLogLine(summary);
  };
}

function runCommand(command: string, args: string[], options?: RunCommandOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onLogLine = options?.onLogLine;
    /** 始终管道输出，避免 Windows 上 inherit 弹出 cmd；无回调时丢弃数据防止缓冲区塞满 */
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"] as const,
      shell: shouldUseShell(command),
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      ...(process.platform === "win32" ? ({ windowsHide: true } as const) : {})
    });
    const timeoutMs = options?.timeoutMs;
    const timer =
      typeof timeoutMs === "number" && timeoutMs > 0
        ? setTimeout(() => {
            child.kill();
            reject(new Error(`Command timeout after ${timeoutMs}ms: ${command} ${args.join(" ")}`));
          }, timeoutMs)
        : undefined;

    let buf = "";
    function feed(chunk: Buffer): void {
      if (!onLogLine) {
        return;
      }
      buf += chunk.toString("utf8");
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? "";
      for (const line of parts) {
        const t = line.trimEnd();
        if (t.length > 0 && (options?.logFilter?.(t) ?? true)) {
          onLogLine(t);
        }
      }
    }
    if (onLogLine) {
      child.stdout?.on("data", feed);
      child.stderr?.on("data", feed);
    } else {
      child.stdout?.on("data", () => {});
      child.stderr?.on("data", () => {});
    }

    child.on("exit", (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      if (onLogLine && buf.trim().length > 0) {
        onLogLine(buf.trimEnd());
        buf = "";
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: ${command} ${args.join(" ")}`));
    });
    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(error);
    });
  });
}

function runCommandWithEnv(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return runCommand(command, args, { env });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function hasAnySubDirectory(targetPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory());
  } catch {
    return false;
  }
}

function runCommandCapture(
  command: string,
  args: string[],
  cwd?: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: shouldUseShell(command),
      cwd,
      env: process.env,
      ...(process.platform === "win32" ? ({ windowsHide: true } as const) : {})
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.on("error", (error) => {
      resolve({ code: 1, stdout: "", stderr: String(error) });
    });
  });
}

function commandLookupTool(): string {
  return process.platform === "win32" ? "where" : "which";
}

async function locateCommandPath(command: string): Promise<string | null> {
  const result = await runCommandCapture(commandLookupTool(), [command]);
  if (result.code !== 0) {
    return null;
  }
  const first = result.stdout
    .split(/\r?\n/)
    .map((x) => x.trim())
    .find(Boolean);
  return first ?? null;
}

function parseHarmonyHdcDownloadUrls(config?: AgentConfig): string[] {
  const byEnv = (
    process.env.ADA_HARMONY_HDC_DOWNLOAD_URLS ??
    process.env.ADA_HARMONY_HDC_DOWNLOAD_URL ??
    ""
  )
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const byConfig = Array.isArray(config?.dependencies?.harmonyHdcDownloadUrls)
    ? config!.dependencies!.harmonyHdcDownloadUrls!.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...byEnv, ...byConfig]));
}

async function downloadFileWithTimeout(
  url: string,
  outputPath: string,
  timeoutMs = 120_000
): Promise<{ ok: true; bytes: number } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length <= 0) {
      return { ok: false, error: "empty response body" };
    }
    await fs.writeFile(outputPath, buf);
    return { ok: true, bytes: buf.length };
  } catch (error) {
    return { ok: false, error: briefErrorMessage(error) };
  } finally {
    clearTimeout(timer);
  }
}

function hdcBinaryName(): string {
  return process.platform === "win32" ? "hdc.exe" : "hdc";
}

function normalizeDownloadUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "github.com" && parsed.pathname.includes("/blob/")) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length >= 5) {
        const owner = parts[0];
        const repo = parts[1];
        const branch = parts[3];
        const filePath = parts.slice(4).join("/");
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
      }
    }
  } catch {
    // keep original URL when parsing fails
  }
  return url;
}

function isZipDownloadUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return /\.zip$/i.test(pathname);
  } catch {
    return /\.zip(?:\?|$)/i.test(url);
  }
}

async function extractZipArchive(zipPath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  if (process.platform === "win32") {
    const escapedZip = zipPath.replace(/'/g, "''");
    const escapedDest = destDir.replace(/'/g, "''");
    await runCommand("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`
    ]);
    return;
  }
  await runCommand("unzip", ["-o", zipPath, "-d", destDir]);
}

async function findFileRecursive(dir: string, fileName: string): Promise<string | undefined> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isFile() && ent.name.toLowerCase() === fileName.toLowerCase()) {
      return full;
    }
    if (ent.isDirectory()) {
      const nested = await findFileRecursive(full, fileName);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

async function copyHarmonyToolBundle(sourceHdcPath: string, toolsDir: string): Promise<number> {
  const sourceDir = path.dirname(sourceHdcPath);
  await fs.mkdir(toolsDir, { recursive: true });
  let copied = 0;
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile()) {
      continue;
    }
    const src = path.join(sourceDir, ent.name);
    const dest = path.join(toolsDir, ent.name);
    await fs.copyFile(src, dest);
    if (process.platform !== "win32") {
      await fs.chmod(dest, 0o755).catch(() => undefined);
    }
    copied += 1;
  }
  return copied;
}

async function tryDownloadHarmonyHdcFromUrl(
  url: string,
  toolsDir: string,
  onLogLine?: (line: string) => void
): Promise<boolean> {
  const hdcName = hdcBinaryName();
  const hdcPath = path.join(toolsDir, hdcName);
  const resolvedUrl = normalizeDownloadUrl(url);
  onLogLine?.(`[harmony] 尝试下载 hdc: ${resolvedUrl}`);

  if (isZipDownloadUrl(resolvedUrl)) {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ada-harmony-hdc-"));
    const zipPath = path.join(tmpRoot, "hdc-tools.zip");
    const extractDir = path.join(tmpRoot, "extract");
    try {
      const fetched = await downloadFileWithTimeout(resolvedUrl, zipPath);
      if (!fetched.ok) {
        onLogLine?.(`[harmony][warn] ZIP 下载失败: ${fetched.error}`);
        return false;
      }
      onLogLine?.(`[harmony] ZIP 下载完成 (${fetched.bytes} bytes)，正在解压…`);
      await extractZipArchive(zipPath, extractDir);
      const foundHdc = await findFileRecursive(extractDir, hdcName);
      if (!foundHdc) {
        onLogLine?.(`[harmony][warn] ZIP 内未找到 ${hdcName}`);
        return false;
      }
      const copied = await copyHarmonyToolBundle(foundHdc, toolsDir);
      onLogLine?.(`[harmony] 已从 ZIP 解压并安装 hdc 及同目录工具 (${copied} 个文件) -> ${toolsDir}`);
      return await pathExists(hdcPath);
    } catch (error) {
      onLogLine?.(`[harmony][warn] ZIP 解压失败: ${briefErrorMessage(error)}`);
      return false;
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  const fetched = await downloadFileWithTimeout(resolvedUrl, hdcPath);
  if (!fetched.ok) {
    onLogLine?.(`[harmony][warn] 下载失败: ${fetched.error}`);
    return false;
  }
  if (process.platform !== "win32") {
    await fs.chmod(hdcPath, 0o755).catch(() => undefined);
  }
  onLogLine?.(`[harmony] hdc 下载完成: ${hdcPath} (${fetched.bytes} bytes)`);
  return true;
}

async function ensureHarmonyHdcInToolsDir(
  toolsDir: string,
  config: AgentConfig,
  onLogLine?: (line: string) => void
): Promise<void> {
  const hdcPath = path.join(toolsDir, hdcBinaryName());
  if (await pathExists(hdcPath)) {
    return;
  }
  await fs.mkdir(toolsDir, { recursive: true });

  const fromPath = await locateCommandPath(hdcBinaryName());
  if (fromPath && (await pathExists(fromPath))) {
    try {
      const copied = await copyHarmonyToolBundle(fromPath, toolsDir);
      if (await pathExists(hdcPath)) {
        onLogLine?.(
          `[harmony] 已从 PATH 复制 hdc 到 tools: ${hdcPath}${copied > 1 ? `（同目录 ${copied} 个文件）` : ""}`
        );
        return;
      }
    } catch (error) {
      onLogLine?.(`[harmony][warn] 从 PATH 复制 hdc 失败: ${briefErrorMessage(error)}`);
    }
  }

  const urls = parseHarmonyHdcDownloadUrls(config);
  if (urls.length === 0) {
    onLogLine?.(
      "[harmony][warn] 未配置 hdc 下载地址（ADA_HARMONY_HDC_DOWNLOAD_URLS / dependencies.harmonyHdcDownloadUrls），请手动下载 hdc 并放到 tools/（或设置 ADA_TOOLS_DIR）"
    );
    return;
  }
  for (const url of urls) {
    const ok = await tryDownloadHarmonyHdcFromUrl(url, toolsDir, onLogLine);
    if (ok) {
      return;
    }
  }
  onLogLine?.(
    `[harmony][warn] 自动下载 hdc 未成功。请手动下载并放入 ${hdcPath}（或设置 ADA_TOOLS_DIR 指向已包含 hdc 的目录）`
  );
}

function browserArg(config: AgentConfig): string {
  return config.dependencies.playwrightBrowser === "all" ? "" : config.dependencies.playwrightBrowser;
}

function playwrightInstallTargets(config: AgentConfig): string[] {
  const targets = config.dependencies.playwrightInstallTargets;
  if (Array.isArray(targets) && targets.length > 0) {
    const deduped = Array.from(new Set(targets.map((x) => String(x).toLowerCase())));
    if (deduped.includes("all")) {
      return [];
    }
    return deduped;
  }
  const legacy = browserArg(config);
  return legacy ? [legacy] : [];
}

/** 自检使用 chromium.launch()，仅装 chrome/msedge 通道不会下载内置 Chromium */
function expandPlaywrightInstallTargets(targets: string[]): string[] {
  if (targets.length === 0) {
    return targets;
  }
  const lower = targets.map((x) => x.toLowerCase());
  if (lower.includes("chromium") || lower.includes("firefox") || lower.includes("webkit")) {
    return lower;
  }
  const channelOnly = lower.every((x) => x === "chrome" || x === "msedge");
  if (channelOnly) {
    return ["chromium", ...lower];
  }
  return lower;
}

function resolveBundledPlaywrightCli(): { command: string; cliArgs: string[]; version: string } {
  const req = depsRequire();
  const pkgPath = req.resolve("playwright/package.json");
  const root = path.dirname(pkgPath);
  const raw = readFileSync(pkgPath, "utf8");
  const version = String((JSON.parse(raw) as { version?: unknown }).version ?? "");
  return { command: "node", cliArgs: [path.join(root, "cli.js")], version };
}

function isPlaywrightDirLockError(message: string): boolean {
  return /__dirlock|active lockfile/i.test(message);
}

/** 安装/更新前清除 playwright `__dirlock`（默认直接删除；仅 onlyIfStale 时保留未超时的锁） */
async function clearPlaywrightInstallLock(
  browsersPath: string,
  onLogLine?: (line: string) => void,
  options?: { onlyIfStale?: boolean }
): Promise<boolean> {
  const lockPath = path.join(browsersPath, "__dirlock");
  try {
    await fs.access(lockPath);
  } catch {
    return false;
  }
  if (options?.onlyIfStale) {
    const maxAgeMs = parsePositiveMs(process.env.ADA_PLAYWRIGHT_LOCK_MAX_AGE_MS, 10 * 60_000);
    try {
      const stat = await fs.stat(lockPath);
      if (Date.now() - stat.mtimeMs <= maxAgeMs) {
        onLogLine?.(
          `[playwright][warn] 检测到安装锁（可能另有安装进行中，未自动删除）。若已中断请删除: ${lockPath}`
        );
        return false;
      }
    } catch {
      // stat failed, try remove
    }
  }
  await fs.rm(lockPath, { recursive: true, force: true });
  onLogLine?.(`[playwright] 发现安装锁，已自动清除: ${lockPath}`);
  return true;
}

function resolveChromiumBrowserVersion(): string {
  try {
    const browsersPath = depsRequire().resolve("playwright-core/browsers.json");
    const raw = readFileSync(browsersPath, "utf8");
    const parsed = JSON.parse(raw) as { browsers?: Array<{ name?: string; browserVersion?: string }> };
    const chromium = parsed.browsers?.find((b) => b.name === "chromium");
    return String(chromium?.browserVersion ?? "").trim();
  } catch {
    return "";
  }
}

/** 本地无 playwright 时从 CDN 拉 browsers.json，供 CDN 下载测速 */
async function resolveChromiumBrowserVersionAsync(): Promise<string> {
  const fromEnv = process.env.ADA_PLAYWRIGHT_BROWSER_VERSION?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const local = resolveChromiumBrowserVersion();
  if (local) {
    return local;
  }
  const pwVersion = process.env.ADA_PLAYWRIGHT_VERSION?.trim() || PINNED_PLAYWRIGHT_VERSION;
  const sources = [
    `https://unpkg.com/playwright-core@${pwVersion}/browsers.json`,
    `https://cdn.jsdelivr.net/npm/playwright-core@${pwVersion}/browsers.json`
  ];
  for (const url of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        continue;
      }
      const parsed = (await response.json()) as {
        browsers?: Array<{ name?: string; browserVersion?: string }>;
      };
      const chromium = parsed.browsers?.find((b) => b.name === "chromium");
      const v = String(chromium?.browserVersion ?? "").trim();
      if (v) {
        return v;
      }
    } catch {
      // try next mirror
    }
  }
  return "";
}

function playwrightChromiumZipUrl(host: string, browserVersion: string): string {
  const h = normalizeHostUrl(host);
  const base =
    h.includes("cdn.npmmirror.com/binaries/playwright") || h.endsWith("/binaries/playwright")
      ? "https://cdn.npmmirror.com/binaries/playwright"
      : h.includes("npmmirror.com") && !h.includes("/mirrors/playwright")
        ? "https://npmmirror.com/mirrors/playwright"
        : h;
  const plat =
    process.platform === "darwin" ? "mac-arm64" : process.platform === "linux" ? "linux64" : "win64";
  const zip =
    plat === "mac-arm64"
      ? "chrome-mac-arm64.zip"
      : plat === "linux64"
        ? "chrome-linux64.zip"
        : "chrome-win64.zip";
  return `${base}/builds/cft/${browserVersion}/${plat}/${zip}`;
}

async function probePlaywrightBrowserDownload(
  host: string,
  browserVersion: string
): Promise<DownloadProbeResult | null> {
  let best: DownloadProbeResult | null = null;
  for (const base of playwrightProbeUrls(host)) {
    const url = playwrightChromiumZipUrl(base, browserVersion);
    const probe = await probeDownloadSample(url);
    if (probe && (!best || probe.speedKBps > best.speedKBps)) {
      best = probe;
    }
  }
  return best;
}

function npmRegistryPackagePath(packageName: string): string {
  const name = packageName.trim();
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash < 0) {
      return `/${encodeURIComponent(name)}`;
    }
    const scope = name.slice(0, slash);
    const pkg = name.slice(slash + 1);
    return `/${scope}%2F${pkg}`;
  }
  return `/${name}`;
}

function registryTarballUrl(registry: string, packageName: string, version: string): string {
  const base = normalizeRegistryUrl(registry);
  const pkg = packageName.trim() || "playwright";
  const ver = version.trim() || PINNED_PLAYWRIGHT_VERSION;
  const tarballName = pkg.includes("/") ? pkg.slice(pkg.indexOf("/") + 1) : pkg;
  return `${base}${npmRegistryPackagePath(pkg)}/-/${tarballName}-${ver}.tgz`;
}

function parseInstallSpec(spec: string): { packageName: string; version: string } {
  const trimmed = spec.trim();
  const at = trimmed.lastIndexOf("@");
  if (at > 0) {
    return {
      packageName: trimmed.slice(0, at).trim(),
      version: trimmed.slice(at + 1).trim()
    };
  }
  return {
    packageName: trimmed,
    version: process.env.ADA_PLAYWRIGHT_VERSION?.trim() || PINNED_PLAYWRIGHT_VERSION
  };
}

async function probeRegistryDownload(registry: string, sampleSpec = "playwright"): Promise<DownloadProbeResult | null> {
  const { packageName, version } = parseInstallSpec(sampleSpec);
  const url = registryTarballUrl(registry, packageName, version);
  return probeDownloadSample(url);
}

function requiredAppiumDrivers(config: AgentConfig): string[] {
  return Array.from(new Set(config.appium.requiredDrivers ?? []));
}

function isMacOsPlatform(): boolean {
  return process.platform === "darwin";
}

/** XCUITest 仅能在 macOS 上安装；Windows/Linux 跳过并提示 */
function filterAppiumDriversForPlatform(
  drivers: string[],
  onLogLine?: (line: string) => void
): string[] {
  const out: string[] = [];
  for (const driver of drivers) {
    const name = driver.toLowerCase().trim();
    if (name === "xcuitest" && !isMacOsPlatform()) {
      onLogLine?.(
        `[appium] 跳过 xcuitest：当前系统为 ${process.platform}，XCUITest 驱动仅支持 macOS（请在 Mac 上安装 iOS 自动化依赖）`
      );
      continue;
    }
    out.push(name);
  }
  return Array.from(new Set(out));
}

function npmProxyRegistry(): string {
  return process.env.ADA_NPM_PROXY_REGISTRY ?? DEFAULT_NPM_REGISTRY_CANDIDATES[0];
}

function pnpmProxyRegistry(): string {
  return process.env.ADA_PNPM_PROXY_REGISTRY ?? npmProxyRegistry();
}

function parsePositiveMs(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number(raw) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** npm/pnpm 装包、appium driver 等（默认 2 分钟） */
function installStrategyTimeoutMs(): number {
  return parsePositiveMs(process.env.ADA_INSTALL_STRATEGY_TIMEOUT_MS, 120_000);
}

/** `playwright install` 下载浏览器（默认 60 分钟；慢网可再加大 ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS） */
const DEFAULT_PLAYWRIGHT_INSTALL_TIMEOUT_MS = 3_600_000;

function playwrightInstallTimeoutMs(): number {
  return parsePositiveMs(process.env.ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS, DEFAULT_PLAYWRIGHT_INSTALL_TIMEOUT_MS);
}

/** 每个 CDN 镜像均使用完整超时（避免首个镜像慢速下载被 600s 截断后换源仍不够） */
function playwrightInstallAttemptTimeoutMs(_attemptIndex: number, baseTimeoutMs: number): number {
  return baseTimeoutMs;
}

function majorOf(versionLike: string): number | null {
  const text = versionLike.trim().replace(/^v/i, "");
  const major = Number(text.split(".")[0]);
  return Number.isFinite(major) ? major : null;
}

async function ensureNodeEnvironmentForInstall(onLogLine?: (line: string) => void): Promise<void> {
  const requiredNodeMajor = 22;
  const requiredNpmMajor = 10;
  const runtimeNode = process.versions.node;
  const runtimeMajor = majorOf(runtimeNode);

  /** 优先检查系统 PATH 的 node（而非打包运行时 process.versions.node） */
  const nodeVersion = await runCommandCapture("node", ["-v"]);
  if (nodeVersion.code === 0) {
    const nodeMajor = majorOf(nodeVersion.stdout);
    onLogLine?.(`[deps] Node 版本检测：系统=${nodeVersion.stdout}，内置=${runtimeNode}`);
    if (runtimeMajor !== null && nodeMajor !== null && nodeMajor > runtimeMajor) {
      onLogLine?.(
        `[deps][warn] 系统 Node.js 主版本（${nodeMajor}）高于内置主版本（${runtimeMajor}）。安装将继续，运行时以内置 Node 为准。`
      );
    }
    if (nodeMajor === null || nodeMajor < requiredNodeMajor) {
      onLogLine?.(
        `[deps][warn] 系统 Node.js 版本为 ${nodeVersion.stdout}（建议 >= ${requiredNodeMajor}），继续尝试安装。`
      );
    }
  } else {
    onLogLine?.(
      `[deps][warn] 未从 PATH 检测到 node，当前运行时 Node.js=${runtimeNode}（可执行程序内置），继续尝试安装。`
    );
  }

  const npmVersion = await runCommandCapture("npm", ["-v"]);
  if (npmVersion.code !== 0) {
    const message =
      "未检测到可用的 npm（PATH 中不可用）。请安装 Node.js 22+（含 npm）并重启终端后重试。";
    onLogLine?.(`[deps] ${message}`);
    throw new Error(`${message}\n${npmVersion.stderr || npmVersion.stdout}`.trim());
  }

  const npmMajor = majorOf(npmVersion.stdout);
  if (npmMajor === null || npmMajor < requiredNpmMajor) {
    onLogLine?.(
      `[deps][warn] 系统 npm 版本为 ${npmVersion.stdout}（建议 >= ${requiredNpmMajor}），继续尝试安装。`
    );
  }
}

function appiumDriverPackageName(driver: string): string | null {
  if (driver === "uiautomator2") {
    return "appium-uiautomator2-driver";
  }
  if (driver === "xcuitest") {
    return "appium-xcuitest-driver";
  }
  if (driver === "harmonyos") {
    return "appium-harmonyos-driver";
  }
  return null;
}

/** 社区驱动：不在 npm registry，需 Git 拉取后 `appium driver install --source=local` */
const HARMONYOS_DRIVER_GIT_DEFAULT = "https://github.com/zhihu/appium-harmonyos-driver.git";
const HARMONYOS_DRIVER_REF_DEFAULT = "main";

/** Appium 3 内置扩展名（`appium driver install <name>`），非 npm 包名 */
const APPIUM3_BUILTIN_DRIVER_NAMES = new Set([
  "uiautomator2",
  "xcuitest",
  "espresso",
  "mac2",
  "windows",
  "safari",
  "gecko",
  "chromium"
]);

function resolveAppiumDriverInstallTargets(
  driver: string,
  appiumMajor: number | null,
  compatibleSpecs: string[]
): string[] {
  const pkg = appiumDriverPackageName(driver);
  if (appiumMajor !== null && appiumMajor >= 3) {
    if (driver === "harmonyos") {
      return [];
    }
    if (!APPIUM3_BUILTIN_DRIVER_NAMES.has(driver)) {
      return pkg ? [pkg] : [driver];
    }
    const envOverride =
      driver === "uiautomator2"
        ? process.env.ADA_APPIUM_DRIVER_SPEC_UIAUTOMATOR2?.trim()
        : driver === "xcuitest"
          ? process.env.ADA_APPIUM_DRIVER_SPEC_XCUITEST?.trim()
          : "";
    if (envOverride) {
      return [envOverride, driver];
    }
    return [driver];
  }
  const baseTarget = pkg ?? driver;
  return compatibleSpecs.length > 0 ? compatibleSpecs : [baseTarget];
}

function buildAppiumDriverInstallArgs(target: string, appiumMajor: number | null): string[] {
  const useNpmPackageSpec =
    appiumMajor === null ||
    appiumMajor < 3 ||
    target.includes("@") ||
    target.startsWith("appium-") ||
    target.includes("/");
  if (useNpmPackageSpec) {
    return ["exec", "appium", "driver", "install", "--source=npm", target];
  }
  return ["exec", "appium", "driver", "install", target];
}

function harmonyOsDriverBuildTimeoutMs(): number {
  return parsePositiveMs(process.env.ADA_APPIUM_HARMONYOS_DRIVER_BUILD_TIMEOUT_MS, 600_000);
}

function degitSpecFromGitUrl(gitUrl: string, gitRef: string): string {
  const base = gitUrl.replace(/\.git$/i, "").replace(/^https?:\/\/github\.com\//i, "");
  return `${base}#${gitRef}`;
}

async function cloneHarmonyOsDriverRepo(
  gitUrl: string,
  gitRef: string,
  driverDir: string,
  onLogLine?: (line: string) => void
): Promise<boolean> {
  const parent = path.dirname(driverDir);
  await fs.mkdir(parent, { recursive: true });

  const gitProbe = await runCommandCapture("git", ["--version"]);
  if (gitProbe.code === 0) {
    let result = await runCommandCapture("git", ["clone", "--depth", "1", "--branch", gitRef, gitUrl, driverDir]);
    if (result.code !== 0) {
      onLogLine?.(`[appium][warn] git clone --branch ${gitRef} 失败，尝试默认分支…`);
      await fs.rm(driverDir, { recursive: true, force: true }).catch(() => undefined);
      result = await runCommandCapture("git", ["clone", "--depth", "1", gitUrl, driverDir]);
    }
    if (result.code === 0) {
      return true;
    }
    onLogLine?.(`[appium][warn] git clone 失败: ${result.stderr || result.stdout}`);
  } else {
    onLogLine?.("[appium] 未检测到 git，将尝试 npx degit 拉取驱动源码…");
  }

  const tmpName = `.harmonyos-driver-fetch-${Date.now()}`;
  const tmpDir = path.join(parent, tmpName);
  const degitSpec = degitSpecFromGitUrl(gitUrl, gitRef);
  try {
    await runCommand("npx", ["--yes", "degit", degitSpec, tmpName], {
      cwd: parent,
      timeoutMs: harmonyOsDriverBuildTimeoutMs(),
      onLogLine
    });
    await fs.rm(driverDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rename(tmpDir, driverDir);
    return true;
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    onLogLine?.(`[appium][warn] degit 拉取失败: ${briefErrorMessage(error)}`);
    return false;
  }
}

async function buildHarmonyOsDriverIfNeeded(
  driverDir: string,
  config: AgentConfig,
  onLogLine?: (line: string) => void
): Promise<void> {
  const builtMain = path.join(driverDir, "build", "index.js");
  if ((await pathExists(builtMain)) && process.env.ADA_APPIUM_HARMONYOS_DRIVER_REBUILD !== "1") {
    return;
  }
  const npmProxy = await detectBestRegistry(config, npmProxyRegistry(), "appium@3.3.1");
  const timeout = harmonyOsDriverBuildTimeoutMs();
  onLogLine?.("[appium] appium-harmonyos-driver: npm install …");
  await runCommand("npm", ["install", "--registry", npmProxy], {
    cwd: driverDir,
    timeoutMs: timeout,
    onLogLine
  });
  onLogLine?.("[appium] appium-harmonyos-driver: npm run build …");
  await runCommand("npm", ["run", "build"], { cwd: driverDir, timeoutMs: timeout, onLogLine });
}

async function ensureHarmonyOsDriverLocalSource(
  config: AgentConfig,
  onLogLine?: (line: string) => void
): Promise<string> {
  const explicitLocal = process.env.ADA_APPIUM_HARMONYOS_DRIVER_LOCAL?.trim();
  if (explicitLocal) {
    const resolved = path.resolve(explicitLocal);
    if (!(await pathExists(path.join(resolved, "package.json")))) {
      throw new Error(`ADA_APPIUM_HARMONYOS_DRIVER_LOCAL 无效（缺少 package.json）: ${resolved}`);
    }
    onLogLine?.(`[appium] 使用本地 harmonyos 驱动: ${resolved}`);
    await buildHarmonyOsDriverIfNeeded(resolved, config, onLogLine);
    return resolved;
  }

  const driverDir = path.join(resolveGlobalAdaHomeSync(), "appium-drivers", "appium-harmonyos-driver");
  const builtMain = path.join(driverDir, "build", "index.js");
  const hasPkg = await pathExists(path.join(driverDir, "package.json"));

  if (!hasPkg) {
    const gitUrl = process.env.ADA_APPIUM_HARMONYOS_DRIVER_GIT?.trim() || HARMONYOS_DRIVER_GIT_DEFAULT;
    const gitRef = process.env.ADA_APPIUM_HARMONYOS_DRIVER_REF?.trim() || HARMONYOS_DRIVER_REF_DEFAULT;
    onLogLine?.(
      `[appium] harmonyos 为社区驱动（npm 无 appium-harmonyos-driver 包），从 Git 获取: ${gitUrl} @ ${gitRef}`
    );
    const cloned = await cloneHarmonyOsDriverRepo(gitUrl, gitRef, driverDir, onLogLine);
    if (!cloned) {
      throw new Error(
        "无法拉取 appium-harmonyos-driver。请安装 git 或设置 ADA_APPIUM_HARMONYOS_DRIVER_LOCAL 指向已 clone 的驱动目录。"
      );
    }
  }

  await buildHarmonyOsDriverIfNeeded(driverDir, config, onLogLine);
  if (!(await pathExists(builtMain))) {
    throw new Error(`appium-harmonyos-driver 编译未完成，缺少 ${builtMain}`);
  }
  return driverDir;
}

async function installHarmonyOsAppiumDriver(
  config: AgentConfig,
  onLogLine?: (line: string) => void
): Promise<void> {
  const installCwd = getSharedDepsRoot() ?? (await resolveDepsInstallRoot());
  const npmProxy = await detectBestRegistry(config, npmProxyRegistry(), "appium@3.3.1");
  const localPath = await ensureHarmonyOsDriverLocalSource(config, onLogLine);
  const installArgs = ["exec", "appium", "driver", "install", "--source=local", localPath];
  onLogLine?.(`[appium] 执行: npm ${installArgs.join(" ")}`);

  let lastError: unknown = undefined;
  const strategies: Array<{ name: "npm" | "npm-proxy"; run: () => Promise<void> }> = [
    {
      name: "npm",
      run: () =>
        runCommand("npm", installArgs, {
          cwd: installCwd,
          timeoutMs: installStrategyTimeoutMs(),
          onLogLine
        })
    },
    {
      name: "npm-proxy",
      run: () =>
        runCommand("npm", installArgs, {
          cwd: installCwd,
          env: { npm_config_registry: npmProxy },
          timeoutMs: installStrategyTimeoutMs(),
          onLogLine
        })
    }
  ];

  for (const strategy of strategies) {
    try {
      await strategy.run();
      progress("appium.driver.install.done", { driver: "harmonyos", strategy: strategy.name, target: localPath });
      return;
    } catch (error) {
      lastError = error;
      onLogLine?.(`[deps][warn] Appium 驱动安装失败 (${strategy.name}): ${briefErrorMessage(error)}`);
    }
  }
  throw new Error(
    `Appium driver install failed after all strategies (harmonyos): ${briefErrorMessage(lastError)}`
  );
}

async function getAppiumMajorVersion(): Promise<number | null> {
  let version = "";
  try {
    const pkgPath = depsRequire().resolve("appium/package.json");
    const raw = await fs.readFile(pkgPath, "utf8");
    version = String((JSON.parse(raw) as { version?: unknown }).version ?? "");
  } catch {
    version = "";
  }
  if (!version) {
    return null;
  }
  const major = Number(version.trim().split(".")[0]);
  return Number.isFinite(major) ? major : null;
}

async function resolveCompatibleDriverSpecs(driver: string): Promise<string[]> {
  const major = await getAppiumMajorVersion();
  if (major === null || major >= 3) {
    return [];
  }
  const pkg = appiumDriverPackageName(driver);
  if (!pkg) {
    return [];
  }

  // Appium 2.x: prefer pinned major-compatible npm package spec (stable and fast).
  // These can be overridden by env for custom compatibility matrix.
  const preferred =
    driver === "uiautomator2"
      ? process.env.ADA_APPIUM_DRIVER_SPEC_UIAUTOMATOR2 ?? `${pkg}@2`
      : process.env.ADA_APPIUM_DRIVER_SPEC_XCUITEST ?? `${pkg}@7`;
  const fallbackRange =
    driver === "uiautomator2"
      ? process.env.ADA_APPIUM_DRIVER_RANGE_UIAUTOMATOR2 ?? "<3"
      : process.env.ADA_APPIUM_DRIVER_RANGE_XCUITEST ?? "<8";

  const specs = [preferred];
  const view = await runCommandCapture("npm", ["view", `${pkg}@${fallbackRange}`, "version"]);
  if (view.code === 0 && view.stdout) {
    const version = view.stdout.trim().split(/\r?\n/).pop()?.trim();
    if (version) {
      specs.push(`${pkg}@${version}`);
    }
  }
  return Array.from(new Set(specs));
}

const detectedBestRegistryByKey = new Map<string, string>();
let detectedBestPlaywrightHost: string | null = null;
let rankedPlaywrightHostsCache: string[] | null = null;

const PROGRESS_STEPS = [
  "deps.ensure.start",
  "registry.probe.start",
  "packages.install.start",
  "playwright.host.probe.start",
  "playwright.browser.install.start",
  "appium.driver.ensure.start",
  "deps.ensure.done"
] as const;

function stepMeta(stage: string): { stepLabel: string; stepIndex?: number; stepTotal?: number } {
  const idx = PROGRESS_STEPS.indexOf(stage as (typeof PROGRESS_STEPS)[number]);
  if (idx === -1) {
    return { stepLabel: "[*/*]" };
  }
  return {
    stepLabel: `[${idx + 1}/${PROGRESS_STEPS.length}]`,
    stepIndex: idx + 1,
    stepTotal: PROGRESS_STEPS.length
  };
}

const PROGRESS_HUMAN_LABELS: Record<string, string> = {
  "deps.ensure.start": "[deps] 开始检测依赖",
  "registry.probe.start": "[deps] 探测 npm 镜像下载速度…",
  "packages.install.start": "[deps] 安装 npm 包…",
  "packages.install.done": "[deps] npm 包安装完成",
  "playwright.host.probe.start": "[playwright] 探测浏览器 CDN 下载速度…",
  "playwright.browser.install.start": "[playwright] 安装浏览器…",
  "playwright.browser.install.done": "[playwright] 浏览器安装完成",
  "playwright.selfcheck.start": "[playwright] 自检…",
  "playwright.selfcheck.done": "[playwright] 自检完成",
  "appium.driver.ensure.start": "[appium] 安装驱动…",
  "appium.driver.ensure.done": "[appium] 驱动安装完成",
  "selenium.check.start": "[selenium] 检测原生驱动…",
  "selenium.check.done": "[selenium] 检测完成",
  "deps.ensure.done": "[deps] 依赖检测完成"
};

function formatProgressDetail(stage: string, details?: Record<string, unknown>): string | null {
  if (!details) {
    return null;
  }
  if (stage === "registry.probe.result") {
    const candidate = String(details.candidate ?? "");
    const probe = details.probe as DownloadProbeResult | null | undefined;
    return formatDownloadProbeLine("[deps] npm 镜像", candidate, probe ?? null);
  }
  if (stage === "playwright.host.probe.result") {
    const candidate = String(details.candidate ?? "");
    const probe = details.probe as DownloadProbeResult | null | undefined;
    return formatDownloadProbeLine("[playwright] CDN", candidate, probe ?? null);
  }
  if (stage === "packages.install.done") {
    const strategy = String(details.strategy ?? "");
    return strategy ? `[deps] 包安装完成（${strategy}）` : null;
  }
  if (stage === "playwright.browser.install.done") {
    const host = String(details.selectedHost ?? "");
    const attempt = details.attempt;
    return host ? `[playwright] 浏览器安装完成（${host}${attempt ? `，第 ${attempt} 个镜像` : ""}）` : null;
  }
  return null;
}

function structuredLogToHuman(
  level: "info" | "warn" | "error",
  payload: { event: string; details?: unknown }
): string | null {
  const { event, details } = payload;
  const d = (details && typeof details === "object" ? details : {}) as Record<string, unknown>;
  if (event === "deps.playwright.browser.install.host.fail") {
    return `[playwright][warn] 镜像 ${d.host} 失败 (${d.attempt}): ${d.message}`;
  }
  if (event === "deps.install.strategy.try") {
    return `[deps] 尝试安装策略: ${d.strategy}`;
  }
  if (event === "deps.install.strategy.ok") {
    return `[deps] 包安装成功: ${d.strategy}`;
  }
  if (event === "deps.install.strategy.fail") {
    const msg = stripCliErrorPrefix(String(d.message ?? ""));
    if (isAppiumDriverAlreadyInstalledMessage(msg)) {
      return null;
    }
    return `[deps][warn] 安装策略失败 (${d.strategy}): ${msg}`;
  }
  if (event === "appium.driver.install.strategy.fail") {
    const msg = stripCliErrorPrefix(String(d.message ?? ""));
    if (isAppiumDriverAlreadyInstalledMessage(msg)) {
      return null;
    }
    return `[deps][warn] Appium 驱动安装失败 (${d.strategy}): ${msg}`;
  }
  if (event === "deps.registry.auto-selected") {
    return `[deps] 选用 npm 镜像: ${d.selected}`;
  }
  if (event === "deps.playwright.host.auto-selected") {
    return `[playwright] CDN 测速排序: ${Array.isArray(d.ranked) ? (d.ranked as string[]).join(" -> ") : d.selected}`;
  }
  if (level === "warn" || level === "error") {
    const raw = String(d.message ?? d.detail ?? "");
    if (isAppiumDriverAlreadyInstalledMessage(raw)) {
      return null;
    }
    const warn = formatDepsWarnLine(raw);
    return warn || null;
  }
  if (depsVerboseEnabled()) {
    return `[deps] ${event}${Object.keys(d).length > 0 ? ` ${JSON.stringify(d)}` : ""}`;
  }
  return null;
}

function progress(stage: string, details?: Record<string, unknown>): void {
  if (depsHumanLog) {
    const label = PROGRESS_HUMAN_LABELS[stage];
    if (label) {
      depsHumanLog(label);
    }
    const detail = formatProgressDetail(stage, details);
    if (detail) {
      depsHumanLog(detail);
    }
    return;
  }
  const meta = stepMeta(stage);
  depsStructuredLog("info", {
    event: "deps.progress",
    details: {
      stage,
      ...meta,
      ...(details ?? {})
    }
  });
}

/** MCP 引导：warn/error 仍输出人可读行；完整 JSON 需 ADA_DEPS_VERBOSE=1 或非 MCP 路径 */
function depsStructuredLog(level: "info" | "warn" | "error", payload: { event: string; details?: unknown }): void {
  if (depsHumanLog) {
    const human = structuredLogToHuman(level, payload);
    if (human) {
      depsHumanLog(human);
    }
    return;
  }
  log(level, payload);
}

function normalizeRegistryUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function registryCandidates(config: AgentConfig, baseProxy: string): string[] {
  const primary = normalizeRegistryUrl(baseProxy);
  const fromConfig = Array.isArray(config.dependencies.npmRegistryCandidates)
    ? config.dependencies.npmRegistryCandidates.map((x) => normalizeRegistryUrl(String(x).trim())).filter(Boolean)
    : [];
  const configured = fromConfig.length > 0 ? fromConfig : [...DEFAULT_NPM_REGISTRY_CANDIDATES];
  const extra = process.env.ADA_REGISTRY_CANDIDATES
    ? process.env.ADA_REGISTRY_CANDIDATES.split(",").map((x) => normalizeRegistryUrl(x.trim())).filter(Boolean)
    : [];
  const ordered = [primary, ...configured, ...extra];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of ordered) {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function registryPriorityIndex(candidates: string[], registry: string): number {
  const idx = candidates.indexOf(normalizeRegistryUrl(registry));
  return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
}

async function detectBestRegistry(
  config: AgentConfig,
  baseProxy: string,
  sampleSpec = `playwright@${PINNED_PLAYWRIGHT_VERSION}`
): Promise<string> {
  const candidates = registryCandidates(config, baseProxy);
  const cacheKey = `${normalizeRegistryUrl(baseProxy)}|${sampleSpec}|${candidates.join(",")}`;
  const cached = detectedBestRegistryByKey.get(cacheKey);
  if (cached) {
    return cached;
  }
  progress("registry.probe.start", { candidates, sampleSpec });
  const probeResults: Array<{ candidate: string; probe: DownloadProbeResult | null }> = [];
  for (const candidate of candidates) {
    progress("registry.probe.try", { candidate, sampleSpec });
    const probe = await probeRegistryDownload(candidate, sampleSpec);
    progress("registry.probe.result", { candidate, probe, sampleSpec });
    probeResults.push({ candidate, probe });
  }
  let best = candidates[0] ?? normalizeRegistryUrl(baseProxy);
  let bestSpeed = -1;
  let bestPriority = Number.POSITIVE_INFINITY;
  for (const { candidate, probe } of probeResults) {
    if (!probe) continue;
    const priority = registryPriorityIndex(candidates, candidate);
    if (probe.speedKBps > bestSpeed || (probe.speedKBps === bestSpeed && priority < bestPriority)) {
      best = candidate;
      bestSpeed = probe.speedKBps;
      bestPriority = priority;
    }
  }

  detectedBestRegistryByKey.set(cacheKey, best);
  depsStructuredLog("info", {
    event: "deps.registry.auto-selected",
    details: {
      selected: best,
      candidates
    }
  });
  return best;
}

function playwrightDownloadHost(config: AgentConfig): string {
  return process.env.PLAYWRIGHT_DOWNLOAD_HOST ?? config.dependencies.playwrightDownloadHost;
}

function normalizeHostUrl(url: string): string {
  return url.replace(/\/$/, "");
}

const PLAYWRIGHT_HOST_FALLBACK = DEFAULT_PLAYWRIGHT_HOST_CANDIDATES[0];

function playwrightProbeUrls(host: string): string[] {
  const h = normalizeHostUrl(host);
  if (h.includes("npmmirror.com/mirrors/playwright")) {
    return [h, "https://cdn.npmmirror.com/binaries/playwright"];
  }
  return [h];
}

function isTruthyEnv(name: string): boolean {
  const s = String(process.env[name] ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/** preinstall 写入的官方 CDN 不应在 install-deps 阶段置顶（国内常极慢）；用户 shell 显式设置除外 */
function playwrightHostConfiguredByUser(config: AgentConfig): string {
  if (process.env.ADA_PLAYWRIGHT_HOST_FROM_PREINSTALL === "1") {
    return "";
  }
  const raw = process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim() || playwrightDownloadHost(config).trim();
  return raw ? normalizeHostUrl(raw) : "";
}

function preferPlaywrightHostsForNpmRegistry(ranked: string[], _npmRegistry: string): string[] {
  if (!isTruthyEnv("ADA_PLAYWRIGHT_PREFER_CN_MIRROR")) {
    return ranked;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...CHINA_PLAYWRIGHT_HOST_PRIORITY, ...ranked]) {
    const n = normalizeHostUrl(url);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function playwrightHostCandidates(config: AgentConfig): string[] {
  const configured = playwrightHostConfiguredByUser(config);
  const fromConfig = Array.isArray(config.dependencies.playwrightHostCandidates)
    ? config.dependencies.playwrightHostCandidates.map((x) => normalizeHostUrl(String(x).trim())).filter(Boolean)
    : [];
  const configuredList = fromConfig.length > 0 ? fromConfig : [...DEFAULT_PLAYWRIGHT_HOST_CANDIDATES];
  const extra = process.env.ADA_PLAYWRIGHT_HOST_CANDIDATES
    ? process.env.ADA_PLAYWRIGHT_HOST_CANDIDATES.split(",").map((x) => normalizeHostUrl(x.trim())).filter(Boolean)
    : [];
  const ordered = configured ? [configured, ...configuredList, ...extra] : [...configuredList, ...extra];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of ordered) {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function playwrightHostPriorityIndex(candidates: string[], host: string): number {
  const idx = candidates.indexOf(normalizeHostUrl(host));
  return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
}

async function rankPlaywrightHosts(config: AgentConfig): Promise<string[]> {
  if (rankedPlaywrightHostsCache) {
    return rankedPlaywrightHostsCache;
  }
  const candidates = playwrightHostCandidates(config);
  const browserVersion = await resolveChromiumBrowserVersionAsync();
  progress("playwright.host.probe.start", { candidates, browserVersion: browserVersion || undefined });
  const probeResults: Array<{
    candidate: string;
    probe: DownloadProbeResult | null;
    priority: number;
  }> = [];
  for (const candidate of candidates) {
    progress("playwright.host.probe.try", { candidate });
    const probe = browserVersion ? await probePlaywrightBrowserDownload(candidate, browserVersion) : null;
    progress("playwright.host.probe.result", {
      candidate,
      probe,
      browserVersion: browserVersion || undefined
    });
    probeResults.push({
      candidate,
      probe,
      priority: playwrightHostPriorityIndex(candidates, candidate)
    });
  }

  const pool = probeResults.filter((x) => x.probe !== null);
  pool.sort((a, b) => {
    const ap = a.probe!;
    const bp = b.probe!;
    if (bp.speedKBps !== ap.speedKBps) {
      return bp.speedKBps - ap.speedKBps;
    }
    if (ap.durationMs !== bp.durationMs) {
      return ap.durationMs - bp.durationMs;
    }
    return a.priority - b.priority;
  });

  const ranked = pool.map((x) => x.candidate);
  for (const candidate of candidates) {
    if (!ranked.includes(candidate)) {
      ranked.push(candidate);
    }
  }
  const result = ranked.length > 0 ? ranked : [...candidates];
  rankedPlaywrightHostsCache = result;
  return result;
}

async function detectBestPlaywrightHost(config: AgentConfig): Promise<string> {
  if (detectedBestPlaywrightHost) {
    return detectedBestPlaywrightHost;
  }

  const ranked = await rankPlaywrightHosts(config);
  const best = ranked[0] ?? PLAYWRIGHT_HOST_FALLBACK;
  detectedBestPlaywrightHost = best;
  depsStructuredLog("info", {
    event: "deps.playwright.host.auto-selected",
    details: {
      selected: best,
      ranked,
      candidates: playwrightHostCandidates(config)
    }
  });
  return best;
}

async function runInstallWithPriority(
  config: AgentConfig,
  packages: string[],
  onLogLine?: (line: string) => void
): Promise<void> {
  const installCwd = getSharedDepsRoot() ?? (await resolveDepsInstallRoot());
  await ensureDepsInstallWorkspace(installCwd);
  const extraFromReconcile = await reconcileWorkspacePackageConflicts(packages, onLogLine);
  const allPackages = Array.from(new Set([...packages, ...extraFromReconcile]));
  const specs = resolveInstallPackageSpecs(allPackages);
  const sampleSpec = specs[0] ?? `playwright@${PINNED_PLAYWRIGHT_VERSION}`;
  const npmProxy = await detectBestRegistry(config, npmProxyRegistry(), sampleSpec);
  const pnpmProxy = await detectBestRegistry(config, pnpmProxyRegistry(), sampleSpec);
  progress("packages.install.start", { packages: specs, npmProxy, pnpmProxy, installCwd, sampleSpec });
  if (packages.includes("playwright")) {
    onLogLine?.(
      `[deps] playwright 将安装锁定版本 ${specs.find((s) => s.startsWith("playwright@")) ?? playwrightInstallPackageSpec()}（避免镜像 latest 与浏览器包不同步）`
    );
  }
  if (packages.includes("appium")) {
    onLogLine?.(`[deps] appium 将安装锁定版本 ${specs.find((s) => s.startsWith("appium@")) ?? appiumInstallPackageSpec()}`);
  }
  if (packages.includes("hypium-driver")) {
    onLogLine?.(
      `[deps] hypium-driver 将安装锁定版本 ${specs.find((s) => s.startsWith("hypium-driver@")) ?? hypiumDriverInstallPackageSpec()}`
    );
  }
  onLogLine?.(
    `[deps] 在线安装包: ${specs.join(" ")} (registry 探测: npm=${npmProxy}, pnpm=${pnpmProxy}；顺序: pnpm -> pnpm-proxy -> npm -> npm-proxy)`
  );
  // 国内网络环境优先尝试 pnpm + 代理，再回退 npm + 代理。
  const strategies: Array<{
    name: "npm" | "npm-proxy" | "pnpm" | "pnpm-proxy";
    run: () => Promise<void>;
  }> = [
    {
      name: "pnpm",
      run: () =>
        runCommand("pnpm", ["add", ...specs], {
          cwd: installCwd,
          timeoutMs: installStrategyTimeoutMs(),
          onLogLine
        })
    },
    {
      name: "pnpm-proxy",
      run: () =>
        runCommand("pnpm", ["add", ...specs, "--registry", pnpmProxy], {
          cwd: installCwd,
          timeoutMs: installStrategyTimeoutMs(),
          onLogLine
        })
    },
    {
      name: "npm",
      run: () =>
        runCommand("npm", ["install", ...specs], {
          cwd: installCwd,
          timeoutMs: installStrategyTimeoutMs(),
          onLogLine
        })
    },
    {
      name: "npm-proxy",
      run: () =>
        runCommand("npm", ["install", ...specs, "--registry", npmProxy], {
          cwd: installCwd,
          timeoutMs: installStrategyTimeoutMs(),
          onLogLine
        })
    },
  ];

  let lastError: unknown = undefined;
  for (const strategy of strategies) {
    try {
      onLogLine?.(`[deps] 尝试 ${strategy.name} 安装包…`);
      depsStructuredLog("info", { event: "deps.install.strategy.try", details: { strategy: strategy.name, packages } });
      await strategy.run();
      depsStructuredLog("info", { event: "deps.install.strategy.ok", details: { strategy: strategy.name } });
      progress("packages.install.done", { strategy: strategy.name });
      return;
    } catch (error) {
      lastError = error;
      depsStructuredLog("warn", {
        event: "deps.install.strategy.fail",
        details: { strategy: strategy.name, message: error instanceof Error ? error.message : String(error) }
      });
    }
  }
  onLogLine?.(
    `[deps][warn] 包安装未成功（${specs.join(" ")}）: ${briefErrorMessage(lastError)}；MCP 仍将启动，可稍后重试或配置 registry`
  );
}

async function runAppiumDriverInstallWithPriority(
  config: AgentConfig,
  driver: string,
  onLogLine?: (line: string) => void
): Promise<void> {
  const installCwd = getSharedDepsRoot() ?? (await resolveDepsInstallRoot());
  const npmProxy = await detectBestRegistry(config, npmProxyRegistry(), "appium@3.3.1");
  progress("appium.driver.install.start", { driver, npmProxy });
  onLogLine?.(`[appium] 安装驱动: ${driver}`);

  if (driver === "harmonyos") {
    await installHarmonyOsAppiumDriver(config, onLogLine);
    return;
  }

  const compatibleSpecs = await resolveCompatibleDriverSpecs(driver);
  const appiumMajor = await getAppiumMajorVersion();
  if (appiumMajor !== null && appiumMajor >= 3) {
    onLogLine?.(`[appium] 检测到 Appium ${appiumMajor}.x，使用内置驱动名安装（如 uiautomator2）`);
  }
  const uniqueTargets = resolveAppiumDriverInstallTargets(driver, appiumMajor, compatibleSpecs);
  let lastError: unknown = undefined;
  for (const target of uniqueTargets) {
    const installArgs = buildAppiumDriverInstallArgs(target, appiumMajor);
    onLogLine?.(`[appium] 执行: npm ${installArgs.join(" ")}`);

    // Appium 有时会在“已安装”场景下输出 Error 并以非 0 退出码结束。
    // 这里提前把这类输出改写成 warn，并在退出后将其视为成功。
    let alreadyInstalledSeen = false;
    let alreadyInstalledWarnLogged = false;
    const onAppiumDriverLogLine = (line: string) => {
      const t = stripAnsiCodes(line).trimEnd();
      if (!t) {
        return;
      }
      // 已安装：只打一条 warn，绝不透传原始 "Error: × ..." 行
      if (isAppiumDriverAlreadyInstalledMessage(t)) {
        alreadyInstalledSeen = true;
        if (!alreadyInstalledWarnLogged) {
          alreadyInstalledWarnLogged = true;
          const normalized = stripCliErrorPrefix(t);
          onLogLine?.(`[deps][warn] ${normalized}。检测到安装后无需再次安装${driver}。`);
        }
        return;
      }
      if (/^Error:\s*/i.test(t)) {
        const warn = formatDepsWarnLine(t);
        if (warn) {
          onLogLine?.(warn);
        }
        return;
      }
      if (/^dbug\s+Appium/i.test(t)) {
        return;
      }
      onLogLine?.(t);
    };

    const strategies: Array<{
      name: "npm" | "npm-proxy";
      run: () => Promise<void>;
    }> = [
      {
        name: "npm",
        run: () =>
          runCommand("npm", installArgs, {
            cwd: installCwd,
            timeoutMs: installStrategyTimeoutMs(),
            onLogLine: onAppiumDriverLogLine
          })
      },
      {
        name: "npm-proxy",
        run: () =>
          runCommand("npm", installArgs, {
            cwd: installCwd,
            env: { npm_config_registry: npmProxy },
            timeoutMs: installStrategyTimeoutMs(),
            onLogLine: onAppiumDriverLogLine
          })
      }
    ];

    for (const strategy of strategies) {
      try {
        depsStructuredLog("info", {
          event: "appium.driver.install.strategy.try",
          details: { strategy: strategy.name, driver, target }
        });
        await strategy.run();
        depsStructuredLog("info", {
          event: "appium.driver.install.strategy.ok",
          details: { strategy: strategy.name, driver, target }
        });
        progress("appium.driver.install.done", { driver, strategy: strategy.name, target });
        return;
      } catch (error) {
        // 这类场景 Appium 会输出 already installed，但 exit code 非 0；我们将其视为成功。
        if (alreadyInstalledSeen) {
          progress("appium.driver.install.done", { driver, strategy: strategy.name, target });
          return;
        }
        lastError = error;
        depsStructuredLog("warn", {
          event: "appium.driver.install.strategy.fail",
          details: {
            strategy: strategy.name,
            driver,
            target,
            message: error instanceof Error ? error.message : String(error)
          }
        });
      }
    }
  }

  // Fallback: if Appium driver install failed, try python pip for uiautomator2 (non-blocking).
  if (driver === "uiautomator2") {
    await tryPipInstallUiautomator2(onLogLine);
  }

  throw new Error(
    `Appium driver install failed after all strategies (${driver}): ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function tryPipInstallUiautomator2(onLogLine?: (line: string) => void): Promise<void> {
  onLogLine?.("[appium][warn] uiautomator2 驱动安装失败，尝试使用 pip 安装 python-uiautomator2（不保证可替代 Appium 驱动）…");
  const pythonVersion = await runCommandCapture("python", ["--version"]);
  if (pythonVersion.code !== 0) {
    const py3Version = await runCommandCapture("python3", ["--version"]);
    if (py3Version.code !== 0) {
      onLogLine?.("[appium][warn] 未检测到 python/python3，跳过 pip 安装 uiautomator2。");
      return;
    }
    await tryPipInstallWithPython("python3", onLogLine);
    return;
  }
  await tryPipInstallWithPython("python", onLogLine);
}

async function tryPipInstallWithPython(pythonCmd: string, onLogLine?: (line: string) => void): Promise<void> {
  try {
    onLogLine?.(`[pip] 检测到 ${pythonCmd}，开始安装: ${pythonCmd} -m pip install -U uiautomator2`);
    await runCommand(pythonCmd, ["-m", "pip", "install", "-U", "uiautomator2"], {
      timeoutMs: 15 * 60_000,
      onLogLine
    });
    onLogLine?.("[pip] uiautomator2 安装完成。");
  } catch (error) {
    onLogLine?.(`[pip][warn] uiautomator2 安装失败（已忽略）: ${briefErrorMessage(error)}`);
  }
}

async function verifyPlaywrightSelfTest(onLogLine?: (line: string) => void): Promise<boolean> {
  onLogLine?.("[playwright] 自检：启动 Chromium");
  try {
    const moduleName = ["play", "wright"].join("");
    const p = depsRequire()(moduleName) as typeof import("playwright");
    const b = await p.chromium.launch({ headless: true });
    try {
      const c = await b.newContext();
      const page = await c.newPage();
      await page.goto("about:blank");
    } finally {
      await b.close();
    }
    onLogLine?.("[playwright] 自检通过");
    return true;
  } catch (error) {
    onLogLine?.(`[playwright][warn] 自检未通过: ${briefErrorMessage(error)}`);
    return false;
  }
}

async function installPlaywrightBrowser(
  config: AgentConfig,
  onLogLine?: (line: string) => void,
  options?: { force?: boolean }
): Promise<boolean> {
  const rawTargets = playwrightInstallTargets(config);
  const targets = expandPlaywrightInstallTargets(rawTargets);
  if (rawTargets.length > 0 && targets.length > rawTargets.length) {
    onLogLine?.(
      "[playwright] 配置仅含 chrome/msedge 通道，已自动加入 chromium（自检需 Playwright 内置浏览器）"
    );
  }
  progress("playwright.browser.install.start", { targets: targets.length > 0 ? targets : ["all"] });
  onLogLine?.("[playwright] 开始在线安装浏览器");
  const { command, cliArgs, version } = resolveBundledPlaywrightCli();
  const installArgs = [...cliArgs, "install"];
  if (options?.force) {
    installArgs.push("--force");
  }
  if (targets.length > 0) {
    installArgs.push(...targets);
  }
  const npmRegistry = await detectBestRegistry(config, npmProxyRegistry());
  let rankedHosts = await rankPlaywrightHosts(config);
  rankedHosts = preferPlaywrightHostsForNpmRegistry(rankedHosts, npmRegistry);
  const baseTimeoutMs = playwrightInstallTimeoutMs();
  onLogLine?.(
    `[playwright] 每个 CDN 镜像安装超时 ${Math.round(baseTimeoutMs / 1000)}s（共 ${rankedHosts.length} 个镜像；可调 ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS，默认 ${Math.round(DEFAULT_PLAYWRIGHT_INSTALL_TIMEOUT_MS / 1000)}s）`
  );
  if (isTruthyEnv("ADA_PLAYWRIGHT_PREFER_CN_MIRROR")) {
    onLogLine?.("[playwright] ADA_PLAYWRIGHT_PREFER_CN_MIRROR=1，安装顺序优先 npmmirror CDN");
  }
  const installCwd = getSharedDepsRoot() ?? (await resolveDepsInstallRoot());
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? (await resolvePlaywrightBrowsersPath());
  await clearPlaywrightInstallLock(browsersPath, onLogLine);
  let lastHost = "";
  for (let i = 0; i < rankedHosts.length; i++) {
    const host = rankedHosts[i]!;
    const attemptTimeoutMs = playwrightInstallAttemptTimeoutMs(i, baseTimeoutMs);
    lastHost = host;
    if (i > 0) {
      onLogLine?.(`[playwright] 换镜像 (${i + 1}/${rankedHosts.length}): ${host}`);
    } else {
      onLogLine?.(
        `[playwright] playwright@${version}，CDN ${host}（${i + 1}/${rankedHosts.length}），目标 ${targets.length ? targets.join(",") : "chromium"}`
      );
    }
    const runInstallOnce = () =>
      runCommand(command, installArgs, {
        cwd: installCwd,
        env: { PLAYWRIGHT_DOWNLOAD_HOST: host, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
        timeoutMs: attemptTimeoutMs,
        onLogLine: createPlaywrightInstallLogSink(onLogLine)
      });
    try {
      await runInstallOnce();
      progress("playwright.browser.install.done", { selectedHost: host, attempt: i + 1 });
      onLogLine?.(`[playwright] 浏览器安装完成（${host}）`);
      return true;
    } catch (error) {
      const msg = briefErrorMessage(error);
      if (isPlaywrightDirLockError(msg)) {
        onLogLine?.("[playwright] 安装锁冲突，清除 __dirlock 后重试当前镜像…");
        await clearPlaywrightInstallLock(browsersPath, onLogLine);
        try {
          await runInstallOnce();
          onLogLine?.(`[playwright] 浏览器安装完成（${host}，清除锁后重试成功）`);
          return true;
        } catch (retryError) {
          onLogLine?.(`[playwright][warn] 清除锁后仍失败: ${briefErrorMessage(retryError)}`);
        }
      } else {
        onLogLine?.(`[playwright][warn] 镜像 ${host} 失败: ${msg}`);
      }
      depsStructuredLog("warn", {
        event: "deps.playwright.browser.install.host.fail",
        details: {
          host,
          attempt: i + 1,
          message: briefErrorMessage(error)
        }
      });
    }
  }
  onLogLine?.(
    `[playwright][warn] 浏览器未安装完成（已尝试 ${rankedHosts.length} 个 CDN）。国内建议: set PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright 并增大 ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS=3600000（或 5400000）；或手动: npx playwright@${PINNED_PLAYWRIGHT_VERSION} install chromium`
  );
  if (lastHost) {
    onLogLine?.(`[playwright][warn] 最后尝试: ${lastHost}`);
  }
  return false;
}

async function checkPlaywrightLaunchable(): Promise<boolean> {
  try {
    const moduleName = ["play", "wright"].join("");
    const p = depsRequire()(moduleName) as typeof import("playwright");
    const b = await p.chromium.launch({ headless: true });
    await b.close();
    return true;
  } catch {
    return false;
  }
}

async function verifyAppiumCommand(): Promise<void> {
  try {
    const pkgPath = depsRequire().resolve("appium/package.json");
    const raw = await fs.readFile(pkgPath, "utf8");
    const version = String((JSON.parse(raw) as { version?: unknown }).version ?? "");
    if (!version) {
      throw new Error("appium version check failed");
    }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "appium version check failed");
  }
}

async function getInstalledAppiumDrivers(): Promise<string[]> {
  const installCwd = getSharedDepsRoot() ?? (await resolveDepsInstallRoot());
  const check = await runCommandCapture(
    "npm",
    ["exec", "appium", "driver", "list", "--installed", "--json"],
    installCwd
  );
  if (check.code === 0 && check.stdout) {
    try {
      const parsed = JSON.parse(check.stdout) as Record<string, unknown>;
      const names = Object.keys(parsed);
      return names;
    } catch {
      // fall through to text parser
    }
  }

  const fallback = await runCommandCapture(
    "npm",
    ["exec", "appium", "driver", "list", "--installed"],
    installCwd
  );
  if (fallback.code !== 0) {
    return [];
  }
  const lines = fallback.stdout.split(/\r?\n/).map((x) => x.trim());
  const names: string[] = [];
  for (const line of lines) {
    const m = line.match(/^[-*]\s+([a-zA-Z0-9_-]+)\b/);
    if (m?.[1]) {
      names.push(m[1].toLowerCase());
    }
  }
  return Array.from(new Set(names));
}

async function ensureAppiumDrivers(
  config: AgentConfig,
  onLogLine?: (line: string) => void
): Promise<string[]> {
  const required = filterAppiumDriversForPlatform(requiredAppiumDrivers(config), onLogLine);
  if (required.length === 0) {
    return [];
  }

  const installed = (await getInstalledAppiumDrivers()).map((x) => x.toLowerCase());
  const missing = required.filter((x) => !installed.includes(x.toLowerCase()));
  for (const driver of missing) {
    await runAppiumDriverInstallWithPriority(config, driver, onLogLine);
  }
  return missing;
}

export type InstallScope =
  | "all"
  | "playwright"
  | "selenium"
  | "appium"
  | "drivers"
  | "mobile"
  | "android"
  | "ios"
  | "harmony";

const PW_INSTALL_TARGETS = new Set([
  "chromium",
  "chrome",
  "firefox",
  "webkit",
  "msedge",
  "all"
]);

function filterPlaywrightTargetsOverride(raw: string[] | undefined): string[] | undefined {
  if (!raw?.length) {
    return undefined;
  }
  const list = raw
    .map((x) => String(x).toLowerCase().trim())
    .filter((x) => PW_INSTALL_TARGETS.has(x));
  return list.length > 0 ? list : undefined;
}

function normalizeAppiumDriverTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    const x = String(t).toLowerCase().trim();
    if (x === "android" || x === "uiautomator2") {
      out.push("uiautomator2");
    } else if (x === "ios" || x === "xcuitest") {
      out.push("xcuitest");
    } else if (x === "harmony" || x === "harmonyos") {
      out.push("harmonyos");
    }
  }
  return Array.from(new Set(out));
}

function configWithPlaywrightTargets(config: AgentConfig, targets: string[]): AgentConfig {
  return {
    ...config,
    dependencies: {
      ...config.dependencies,
      playwrightInstallTargets: targets as AgentConfig["dependencies"]["playwrightInstallTargets"]
    }
  };
}

export interface EnsureInstallOptions {
  only?: InstallScope;
  force?: boolean;
  /** 安装过程逐行输出（用于引导页 SSE） */
  onLogLine?: (line: string) => void;
  /** 覆盖本次 Playwright 浏览器安装目标（如 chromium,chrome），不写入配置文件 */
  playwrightInstallTargetsOverride?: string[];
  /** 覆盖本次要安装的 Appium 驱动（uiautomator2 / xcuitest / harmonyos）；传 [] 表示只处理 Appium 包、不装驱动 */
  appiumRequiredDriversOverride?: string[];
  /** 原生驱动目录（默认 dirver） */
  nativeDriversDir?: string;
  /** geckodriver 版本：0.36.0 | latest | skip */
  geckodriverVersion?: string;
  /** chromedriver 主版本：137 | 135 | latest | match-chrome | skip */
  chromedriverVersion?: string;
}

export interface InstallSummary {
  scope: InstallScope;
  force: boolean;
  elapsedMs: number;
  requestedDrivers: string[];
  installedPackages: string[];
  skippedPackages: string[];
  installedDrivers: string[];
  skippedDrivers: string[];
  nativeDriversDir?: string;
  geckodriverPath?: string;
  chromedriverPath?: string;
  availableChromedriverMajors?: string[];
}

interface InstallState {
  playwrightReady?: boolean;
  appiumReady?: boolean;
  driversReady?: boolean;
  seleniumChecked?: boolean;
  geckodriverOk?: boolean;
  chromedriverOk?: boolean;
  androidHome?: string;
  appiumHome?: string;
  /** 已成功完成的安装 scope（playwright / appium / drivers 等） */
  installedScopes?: string[];
  /** 已安装的 Playwright 浏览器目标（排序后逗号拼接） */
  playwrightTargetsKey?: string;
  playwrightVersion?: string;
  depsInstallRoot?: string;
  /** 测速选出的最快 npm registry（Agent/GUI/MCP 子进程复用） */
  bestNpmRegistry?: string;
  /** registry 测速缓存键（候选列表指纹） */
  probeRegistryCacheKey?: string;
  /** 测速排序后的 Playwright CDN 列表 */
  rankedPlaywrightHosts?: string[];
  /** 首选 Playwright CDN（rankedPlaywrightHosts[0]） */
  bestPlaywrightDownloadHost?: string;
  /** 最近一次测速完成时间（ISO） */
  probedAt?: string;
  updatedAt?: string;
}

function probeCacheTtlMs(): number {
  return parsePositiveMs(process.env.ADA_DEPS_PROBE_CACHE_TTL_MS, 7 * 24 * 60 * 60 * 1000);
}

function isProbeStateFresh(state: InstallState): boolean {
  if (!state.probedAt?.trim()) {
    return false;
  }
  const t = Date.parse(state.probedAt);
  if (!Number.isFinite(t)) {
    return false;
  }
  return Date.now() - t < probeCacheTtlMs();
}

function shouldReprobeDownloads(): boolean {
  return isTruthyEnv("ADA_DEPS_REPROBE");
}

function buildRegistryProbeCacheKey(config: AgentConfig, baseProxy: string, sampleSpec: string): string {
  return `${normalizeRegistryUrl(baseProxy)}|${sampleSpec}|${registryCandidates(config, baseProxy).join(",")}`;
}

function applyPersistedProbeEnv(state: InstallState): void {
  const reg = state.bestNpmRegistry?.trim();
  if (reg) {
    process.env.npm_config_registry = reg;
  }
  const pw = state.bestPlaywrightDownloadHost?.trim();
  if (pw && !process.env.PLAYWRIGHT_DOWNLOAD_HOST?.trim()) {
    process.env.PLAYWRIGHT_DOWNLOAD_HOST = pw;
  }
}

function hydrateProbeCacheFromState(
  state: InstallState,
  config: AgentConfig,
  baseProxy: string,
  sampleSpec: string
): void {
  if (!isProbeStateFresh(state) || shouldReprobeDownloads()) {
    return;
  }
  const cacheKey = buildRegistryProbeCacheKey(config, baseProxy, sampleSpec);
  if (state.probeRegistryCacheKey === cacheKey && state.bestNpmRegistry) {
    detectedBestRegistryByKey.set(cacheKey, state.bestNpmRegistry);
  }
  if (state.rankedPlaywrightHosts && state.rankedPlaywrightHosts.length > 0) {
    rankedPlaywrightHostsCache = [...state.rankedPlaywrightHosts];
    detectedBestPlaywrightHost = state.bestPlaywrightDownloadHost ?? state.rankedPlaywrightHosts[0] ?? null;
  }
  applyPersistedProbeEnv(state);
}

async function syncProbeSelectionsToState(state: InstallState, config: AgentConfig): Promise<void> {
  const baseProxy = npmProxyRegistry();
  const sampleSpec = playwrightInstallPackageSpec();
  const cacheKey = buildRegistryProbeCacheKey(config, baseProxy, sampleSpec);
  const reg = detectedBestRegistryByKey.get(cacheKey);
  if (reg) {
    state.probeRegistryCacheKey = cacheKey;
    state.bestNpmRegistry = reg;
  }
  if (rankedPlaywrightHostsCache && rankedPlaywrightHostsCache.length > 0) {
    state.rankedPlaywrightHosts = [...rankedPlaywrightHostsCache];
    state.bestPlaywrightDownloadHost = detectedBestPlaywrightHost ?? rankedPlaywrightHostsCache[0];
  }
  if (state.bestNpmRegistry || (state.rankedPlaywrightHosts && state.rankedPlaywrightHosts.length > 0)) {
    state.probedAt = new Date().toISOString();
    applyPersistedProbeEnv(state);
  }
}

/** 从 ~/.ada/deps-install-state.json 恢复测速结果到当前进程（MCP skip-install 时仍可用最快镜像） */
export async function applyPersistedDownloadProbeFromState(onLogLine?: (line: string) => void): Promise<void> {
  await ensureSharedDepsModuleResolution(onLogLine);
  const state = await loadInstallState();
  if (!isProbeStateFresh(state)) {
    return;
  }
  const config = await loadConfig();
  hydrateProbeCacheFromState(state, config, npmProxyRegistry(), playwrightInstallPackageSpec());
  if (state.bestNpmRegistry || state.bestPlaywrightDownloadHost) {
    onLogLine?.(
      `[deps] 复用已测速镜像: registry=${state.bestNpmRegistry ?? "(none)"} playwright=${state.bestPlaywrightDownloadHost ?? "(none)"}`
    );
  }
}

function playwrightTargetsKey(
  config: AgentConfig,
  override?: string[] | undefined
): string {
  const raw = override?.length ? override : playwrightInstallTargets(config);
  return expandPlaywrightInstallTargets(raw).sort().join(",");
}

function mergeInstalledScope(state: InstallState, scope: InstallScope): void {
  const set = new Set(state.installedScopes ?? []);
  if (scope === "all") {
    set.add("playwright");
    set.add("appium");
    set.add("drivers");
    set.add("selenium");
    set.add("harmony");
  } else {
    set.add(scope);
  }
  state.installedScopes = Array.from(set);
}

function scopeMarkedReady(state: InstallState, scope: InstallScope): boolean {
  const installed = new Set((state.installedScopes ?? []).map((x) => x.toLowerCase()));
  if (scope === "playwright") {
    return Boolean(state.playwrightReady) || installed.has("playwright") || installed.has("all");
  }
  if (scope === "appium") {
    return Boolean(state.appiumReady) || installed.has("appium") || installed.has("all");
  }
  if (scope === "harmony") {
    return installed.has("harmony") || installed.has("all");
  }
  if (scope === "drivers" || scope === "mobile" || scope === "android" || scope === "ios") {
    return Boolean(state.driversReady) || installed.has("drivers") || installed.has(scope) || installed.has("all");
  }
  return false;
}

async function commandOnPath(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const checker = process.platform === "win32" ? "where" : "which";
    const child = spawn(checker, [command], {
      stdio: "ignore",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function ensureSeleniumNativeDrivers(
  config: AgentConfig,
  options: EnsureInstallOptions | undefined,
  onLogLine?: (line: string) => void
): Promise<{
  geckodriverOk: boolean;
  chromedriverOk: boolean;
  seleniumWebdriverInstalled: boolean;
  driversDir: string;
  geckodriverPath?: string;
  chromedriverPath?: string;
}> {
  const root = await resolveWorkspaceRoot(process.cwd());
  const driversDir = path.resolve(
    root,
    options?.nativeDriversDir ?? config.dependencies.nativeDriversDir ?? "dirver"
  );
  const seleniumWebdriverInstalled = isPackageAvailable("selenium-webdriver");
  if (seleniumWebdriverInstalled) {
    onLogLine?.("[selenium] npm 包 selenium-webdriver 已安装（~/.ada/deps 或工作区）");
  } else {
    onLogLine?.(
      `[selenium] npm 包 selenium-webdriver 未安装 — 请执行 install-deps --only=selenium 或 --install-deps=all（将安装 ${seleniumWebdriverInstallPackageSpec()}）`
    );
  }

  const geckoVer = options?.geckodriverVersion ?? config.dependencies.geckodriverVersion ?? "latest";
  const chromeVer = options?.chromedriverVersion ?? config.dependencies.chromedriverVersion ?? "latest";

  try {
    const catalog = await listChromedriverCfTVersions();
    onLogLine?.(
      `[selenium] 可选 chromedriver 主版本（chrome-for-testing）: ${catalog
        .slice(0, 12)
        .map((x) => x.major)
        .join(", ")}${catalog.length > 12 ? "…" : ""}`
    );
  } catch (error) {
    onLogLine?.(
      `[selenium] 无法拉取 chromedriver 版本列表: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const resolved = await ensureNativeWebDrivers({
    workspaceRoot: root,
    driversDir,
    force: options?.force,
    geckodriverVersion: geckoVer,
    chromedriverVersion: chromeVer,
    onLogLine
  });

  return {
    geckodriverOk: resolved.geckodriverOk,
    chromedriverOk: resolved.chromedriverOk,
    seleniumWebdriverInstalled,
    driversDir,
    geckodriverPath: resolved.geckodriverPath,
    chromedriverPath: resolved.chromedriverPath
  };
}

interface InstallEnvHomes {
  androidHome: string;
  appiumHome: string;
  androidFromSystem: boolean;
  appiumFromSystem: boolean;
}

function installScopeNeedsMobileEnv(only: InstallScope): boolean {
  return (
    only === "all" ||
    only === "appium" ||
    only === "drivers" ||
    only === "mobile" ||
    only === "android" ||
    only === "ios"
  );
}

function installScopeNeedsHarmonyHdc(only: InstallScope): boolean {
  if (only === "harmony") {
    return true;
  }
  return only === "all";
}

async function pathIsExistingDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function prepareInstallHomes(
  onLogLine?: (line: string) => void,
  options?: { requireMobileEnv?: boolean; config?: AgentConfig; only?: InstallScope }
): Promise<InstallEnvHomes> {
  const root = await resolveWorkspaceRoot(process.cwd());
  const toolsRelative =
    options?.config?.dependencies?.toolsDir?.trim() ||
    process.env.ADA_TOOLS_RELATIVE_DIR?.trim() ||
    "tools";

  await applyAdaToolsToProcessEnv({
    cwd: root,
    relativeDir: toolsRelative,
    onLogLine
  });

  if (options?.config && options.only && installScopeNeedsHarmonyHdc(options.only)) {
    const toolsDirForDownload = process.env.ADA_TOOLS_DIR?.trim() || path.join(root, toolsRelative);
    await ensureHarmonyHdcInToolsDir(toolsDirForDownload, options.config, onLogLine);
    await applyAdaToolsToProcessEnv({
      cwd: root,
      relativeDir: toolsRelative,
      onLogLine
    });
    const toolsDir = process.env.ADA_TOOLS_DIR?.trim();
    const hdcPath = toolsDir
      ? path.join(toolsDir, process.platform === "win32" ? "hdc.exe" : "hdc")
      : undefined;
    if (!toolsDir || !hdcPath) {
      onLogLine?.(
        "[harmony][warn] 未找到 tools/hdc：请将 DevEco / Command Line Tools 中的 hdc 放入项目 tools/，或设置 ADA_TOOLS_DIR"
      );
    } else {
      const probe = await probeHdc(hdcPath);
      if (probe.ok) {
        const summary =
          probe.output
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean)
            .join("; ") || "（无在线设备）";
        onLogLine?.(`[harmony] hdc list targets: ${summary}`);
      } else {
        onLogLine?.(`[harmony][warn] hdc 不可用: ${probe.error ?? probe.output}`);
      }
    }
  }
  const projectAndroidHome = path.join(root, "ANDROID_HOME");
  const projectAppiumHome = path.join(root, "APPIUM_HOME");
  const envAndroid = (process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "").trim();
  const envAppium = (process.env.APPIUM_HOME ?? "").trim();
  const requireMobile = options?.requireMobileEnv === true;

  let androidFromSystem = false;
  let appiumFromSystem = false;
  let androidHome = projectAndroidHome;
  let appiumHome = projectAppiumHome;

  if (envAndroid) {
    if (await pathIsExistingDirectory(envAndroid)) {
      androidFromSystem = true;
      androidHome = envAndroid;
      onLogLine?.(`[deps] 使用系统环境变量 ANDROID_HOME=${envAndroid}`);
    } else {
      onLogLine?.(`[deps][warn] 系统 ANDROID_HOME / ANDROID_SDK_ROOT 指向的目录不存在: ${envAndroid}`);
      onLogLine?.(`[deps][warn] 请修正系统环境变量，或删除错误配置后重试。`);
      onLogLine?.(`[deps] 安装过程将使用项目默认目录: ${projectAndroidHome}`);
    }
  } else {
    onLogLine?.("[deps][warn] 未检测到系统环境变量 ANDROID_HOME 或 ANDROID_SDK_ROOT。");
    onLogLine?.(
      "[deps][warn] 请在系统/终端配置 ANDROID_HOME（指向 Android SDK 根目录，且包含 platform-tools）。"
    );
    onLogLine?.(`[deps] 安装过程将使用项目默认目录: ${projectAndroidHome}`);
  }

  if (envAppium) {
    if (await pathIsExistingDirectory(envAppium)) {
      appiumFromSystem = true;
      appiumHome = envAppium;
      onLogLine?.(`[deps] 使用系统环境变量 APPIUM_HOME=${envAppium}`);
    } else {
      onLogLine?.(`[deps][warn] 系统 APPIUM_HOME 指向的目录不存在: ${envAppium}`);
      onLogLine?.(`[deps][warn] 请修正系统环境变量，或删除错误配置后重试。`);
      onLogLine?.(`[deps] 安装过程将使用项目默认目录: ${projectAppiumHome}`);
    }
  } else {
    onLogLine?.("[deps][warn] 未检测到系统环境变量 APPIUM_HOME。");
    onLogLine?.("[deps][warn] 请在系统/终端配置 APPIUM_HOME（Appium 驱动与扩展的安装目录）。");
    onLogLine?.(`[deps] 安装过程将使用项目默认目录: ${projectAppiumHome}`);
  }

  if (requireMobile && !androidFromSystem && !appiumFromSystem) {
    onLogLine?.(
      "[deps][warn] 当前安装包含 Appium/移动端能力，建议在完成 install-deps 前配置系统 ANDROID_HOME 与 APPIUM_HOME。"
    );
  }

  await fs.mkdir(projectAndroidHome, { recursive: true });
  await fs.mkdir(projectAppiumHome, { recursive: true });
  if (androidHome !== projectAndroidHome) {
    await fs.mkdir(androidHome, { recursive: true }).catch(() => undefined);
  }
  if (appiumHome !== projectAppiumHome) {
    await fs.mkdir(appiumHome, { recursive: true }).catch(() => undefined);
  }

  process.env.ANDROID_HOME = androidHome;
  process.env.ANDROID_SDK_ROOT = androidHome;
  process.env.APPIUM_HOME = appiumHome;

  onLogLine?.(`[deps] 环境目录: ANDROID_HOME=${androidHome} APPIUM_HOME=${appiumHome}`);

  return {
    androidHome,
    appiumHome,
    androidFromSystem,
    appiumFromSystem
  };
}

function resolveRequestedDrivers(config: AgentConfig, only: InstallScope): string[] {
  const configured = requiredAppiumDrivers(config).map((x) => x.toLowerCase());
  const uniqueConfigured = Array.from(new Set(configured));

  if (only === "all" || only === "appium" || only === "drivers" || only === "mobile") {
    return uniqueConfigured;
  }
  if (only === "android") {
    return Array.from(new Set(["uiautomator2", ...uniqueConfigured.filter((x) => x === "uiautomator2")]));
  }
  if (only === "ios") {
    return Array.from(new Set(["xcuitest", ...uniqueConfigured.filter((x) => x === "xcuitest")]));
  }
  return [];
}

async function loadInstallState(): Promise<InstallState> {
  const globalFile = await resolveDepsStateFilePath();
  try {
    await fs.mkdir(path.dirname(globalFile), { recursive: true });
    const raw = await fs.readFile(globalFile, "utf8");
    return JSON.parse(raw) as InstallState;
  } catch {
    for (const legacy of await legacyDepsStateFileCandidates()) {
      try {
        const raw = await fs.readFile(legacy, "utf8");
        const parsed = JSON.parse(raw) as InstallState;
        await saveInstallState(parsed);
        return parsed;
      } catch {
        // try next legacy path
      }
    }
    return {};
  }
}

async function saveInstallState(state: InstallState): Promise<void> {
  state.depsInstallRoot = getSharedDepsRoot() ?? (await resolveDepsInstallRoot());
  state.updatedAt = new Date().toISOString();
  const file = await resolveDepsStateFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
}

export async function ensureDriverDependencies(config: AgentConfig, options?: EnsureInstallOptions): Promise<InstallSummary> {
  const previousHumanLog = depsHumanLog;
  depsHumanLog = options?.onLogLine;
  try {
    return await ensureDriverDependenciesImpl(config, options);
  } catch (error) {
    options?.onLogLine?.(`[deps][warn] 依赖安装异常已忽略: ${briefErrorMessage(error)}`);
    const only = options?.only ?? "all";
    return {
      scope: only,
      force: options?.force ?? false,
      elapsedMs: 0,
      requestedDrivers: [],
      installedPackages: [],
      skippedPackages: [],
      installedDrivers: [],
      skippedDrivers: []
    };
  } finally {
    depsHumanLog = previousHumanLog;
  }
}

async function ensureDriverDependenciesImpl(
  config: AgentConfig,
  options?: EnsureInstallOptions
): Promise<InstallSummary> {
  const startedAt = Date.now();
  const only = options?.only ?? "all";
  const force = options?.force === true;
  const onLogLine = options?.onLogLine;
  const pwOverride = filterPlaywrightTargetsOverride(options?.playwrightInstallTargetsOverride);
  const configForPlaywright = pwOverride?.length ? configWithPlaywrightTargets(config, pwOverride) : config;
  await ensureSharedDepsModuleResolution(onLogLine);
  const state = await loadInstallState();
  hydrateProbeCacheFromState(state, config, npmProxyRegistry(), playwrightInstallPackageSpec());
  if (isProbeStateFresh(state) && !shouldReprobeDownloads()) {
    onLogLine?.(
      `[deps] 复用已缓存测速: registry=${state.bestNpmRegistry ?? "(待测)"} playwright=${state.bestPlaywrightDownloadHost ?? "(待测)"}`
    );
  }
  const needPlaywright = only === "all" || only === "playwright";
  const needSelenium = only === "all" || only === "selenium";
  const needAppium =
    only === "all" || only === "appium" || only === "drivers" || only === "mobile" || only === "android" || only === "ios";
  const needHarmony = only === "all" || only === "harmony";
  const homes = await prepareInstallHomes(onLogLine, {
    requireMobileEnv: installScopeNeedsMobileEnv(only),
    config,
    only
  });
  progress("deps.ensure.start");
  onLogLine?.("[deps] 开始检测 / 安装依赖…");
  await ensureNodeEnvironmentForInstall(onLogLine);
  const missing: string[] = [];
  const requestedDrivers = filterAppiumDriversForPlatform(
    options?.appiumRequiredDriversOverride !== undefined
      ? normalizeAppiumDriverTokens(options.appiumRequiredDriversOverride)
      : resolveRequestedDrivers(config, only),
    onLogLine
  );
  const needDrivers = requestedDrivers.length > 0;
  const installedPackages: string[] = [];
  const installedDrivers: string[] = [];
  const skippedDrivers: string[] = [];
  const pwTargetsKey = playwrightTargetsKey(configForPlaywright, pwOverride);
  const scopeFlags = { needPlaywright, needAppium, needSelenium, needHarmony };

  if (only === "all") {
    const appiumDriverHint = needDrivers
      ? requestedDrivers.join(", ")
      : "（配置 appium.requiredDrivers 或检查当前平台是否可装）";
    onLogLine?.(
      `[deps] scope=all：Playwright（npm+浏览器）、Selenium（selenium-webdriver+原生驱动）、Appium（${appiumInstallPackageSpec()}+驱动: ${appiumDriverHint}）、Harmony（${hypiumDriverInstallPackageSpec()}+hdc）`
    );
  }

  if (
    !force &&
    needPlaywright &&
    !needAppium &&
    !needSelenium &&
    !needDrivers &&
    isPackageAvailable("playwright") &&
    state.playwrightReady &&
    (!state.playwrightTargetsKey || state.playwrightTargetsKey === pwTargetsKey) &&
    (await checkPlaywrightLaunchable())
  ) {
    onLogLine?.("[deps] 共享安装状态：Playwright 已就绪，跳过重复下载/部署");
    mergeInstalledScope(state, "playwright");
    state.playwrightTargetsKey = pwTargetsKey;
    await saveInstallState(state);
    return {
      scope: only,
      force,
      elapsedMs: Date.now() - startedAt,
      requestedDrivers: [],
      installedPackages: [],
      skippedPackages: ["playwright"],
      installedDrivers: [],
      skippedDrivers: []
    };
  }

  const trackedPackages = ["playwright", "appium", "selenium-webdriver", "hypium-driver"] as const;
  for (const pkg of trackedPackages) {
    if (!packageNeededForScope(pkg, scopeFlags)) {
      continue;
    }
    if (needsSharedDepsInstall(pkg, force)) {
      missing.push(pkg);
    } else {
      const line = formatPackageResolutionLine(pkg);
      if (line) {
        onLogLine?.(`[deps] 已满足，跳过迁入共享目录: ${line}`);
      }
    }
  }

  let packagesToInstall = missing.filter((pkg) => packageNeededForScope(pkg, scopeFlags));
  /** --force：仅对已在 ~/.ada/deps 中的包或 ADA_DEPS_FORCE_SHARED 时重装 */
  if (force) {
    for (const pkg of trackedPackages) {
      if (!packageNeededForScope(pkg, scopeFlags)) {
        continue;
      }
      if (needsSharedDepsInstall(pkg, true)) {
        packagesToInstall.push(pkg);
      }
    }
    packagesToInstall = Array.from(new Set(packagesToInstall));
  }
  if (packagesToInstall.length > 0) {
    progress("deps.package.missing", { missing, installing: packagesToInstall });
    onLogLine?.(`[deps] 将安装到共享目录 ~/.ada/deps: ${packagesToInstall.join(", ")}`);
    await runInstallWithPriority(config, packagesToInstall, onLogLine);
    installedPackages.push(...packagesToInstall);
  } else {
    progress("deps.package.ok", { missing: [] });
    onLogLine?.("[deps] npm 依赖已就绪（系统全局 / 工作区 / 共享目录），跳过在线装包");
    depsStructuredLog("info", { event: "deps.check.ok", details: { missing: [] } });
  }

  if (needHarmony) {
    if (isPackageAvailable("hypium-driver")) {
      mergeInstalledScope(state, "harmony");
      onLogLine?.("[harmony] hypium-driver 已就绪（driver-harmony 直连 hdc）");
    } else {
      onLogLine?.(
        `[harmony][warn] hypium-driver 未安装 — 请执行 install-deps --only=harmony 或 --install-deps=all（将安装 ${hypiumDriverInstallPackageSpec()}）`
      );
    }
  }

  if (isPackageAvailable("playwright") && needPlaywright) {
    progress("playwright.selfcheck.start");
    const launchOk = await checkPlaywrightLaunchable();
    const reinstallForTargets = force && Boolean(pwOverride?.length);
    /** GUI/CLI 显式传入浏览器目标时，应执行 `playwright install …`（与仅 Chromium 可启动无关） */
    const userRequestedBrowserTargets = Boolean(pwOverride?.length);
    const stateTargetsMatch = !state.playwrightTargetsKey || state.playwrightTargetsKey === pwTargetsKey;
    const skipBrowserInstall =
      !force &&
      !userRequestedBrowserTargets &&
      !reinstallForTargets &&
      state.playwrightReady &&
      stateTargetsMatch &&
      launchOk;
    if (skipBrowserInstall) {
      progress("playwright.selfcheck.skip.cache", { cached: true, healthy: true, shared: true });
      onLogLine?.("[deps] 共享安装状态：Playwright 浏览器已就绪，跳过 playwright install");
    } else if (!launchOk || reinstallForTargets || userRequestedBrowserTargets || force) {
      depsStructuredLog("warn", {
        event: "deps.playwright.browser.missing",
        details: {
          action: "install-playwright-browser",
          targets:
            configForPlaywright.dependencies.playwrightInstallTargets?.length > 0
              ? configForPlaywright.dependencies.playwrightInstallTargets
              : [configForPlaywright.dependencies.playwrightBrowser],
          forceOverride: reinstallForTargets || force
        }
      });
      if (force) {
        onLogLine?.(
          userRequestedBrowserTargets
            ? "[playwright] --force：重新安装当前勾选的浏览器通道"
            : "[playwright] --force：按配置文件中的目标重新安装浏览器"
        );
      }
      const browserInstalled = await installPlaywrightBrowser(configForPlaywright, onLogLine, {
        /** 首次安装不要用 --force，避免与残留 __dirlock/半包冲突；仅用户 --force 或显式重装目标时强制 */
        force: force || reinstallForTargets
      });
      if (browserInstalled) {
        progress("playwright.selfcheck.verify");
        state.playwrightReady = await verifyPlaywrightSelfTest(onLogLine);
        state.playwrightTargetsKey = pwTargetsKey;
        state.playwrightVersion = process.env.ADA_PLAYWRIGHT_VERSION?.trim() || PINNED_PLAYWRIGHT_VERSION;
        mergeInstalledScope(state, "playwright");
        progress("playwright.selfcheck.done");
      } else {
        state.playwrightReady = false;
      }
    } else if (!force && state.playwrightReady && stateTargetsMatch) {
      progress("playwright.selfcheck.skip.cache", { cached: true, healthy: true });
    } else {
      progress("playwright.selfcheck.verify");
      state.playwrightReady = await verifyPlaywrightSelfTest(onLogLine);
      state.playwrightTargetsKey = pwTargetsKey;
      mergeInstalledScope(state, "playwright");
      progress("playwright.selfcheck.done");
    }
  }
  if (needSelenium) {
    progress("selenium.check.start");
    onLogLine?.("[selenium] 检测 Selenium WebDriver 与原生驱动…");
    const sel = await ensureSeleniumNativeDrivers(config, options, onLogLine);
    state.seleniumChecked = true;
    state.geckodriverOk = sel.geckodriverOk;
    state.chromedriverOk = sel.chromedriverOk;
    progress("selenium.check.done", sel);
  }

  if (needAppium && !isPackageAvailable("appium")) {
    onLogLine?.(
      "[appium][warn] Appium npm 包未安装，将跳过 Appium 自检与驱动安装；可重试 --install-deps=appium 或 --install-deps=all"
    );
  } else if (needAppium && needDrivers) {
    onLogLine?.(`[appium] 将检测/安装驱动: ${requestedDrivers.join(", ")}`);
  }

  if (isPackageAvailable("appium") && needAppium) {
    try {
      progress("appium.selfcheck.start");
      await verifyAppiumCommand();
      if (!force && state.appiumReady && scopeMarkedReady(state, "appium")) {
        progress("appium.selfcheck.skip.cache", { cached: true, healthy: true });
        onLogLine?.("[deps] 共享安装状态：Appium 已就绪，跳过自检");
      } else {
        state.appiumReady = true;
        mergeInstalledScope(state, needAppium && only !== "all" ? only : "appium");
      }
    } catch (error) {
      onLogLine?.(`[appium][warn] ${briefErrorMessage(error)}`);
    }
  }
  if (isPackageAvailable("appium") && needDrivers) {
    const installedBefore = (await getInstalledAppiumDrivers()).map((x) => x.toLowerCase());
    const required = requestedDrivers;
    const missingBefore = required.filter((x) => !installedBefore.includes(x));
    if (missingBefore.length === 0 && !force && state.driversReady && scopeMarkedReady(state, "drivers")) {
      progress("appium.driver.ensure.skip.cache", { cached: true, healthy: true });
      onLogLine?.("[deps] 共享安装状态：Appium 驱动已齐全，跳过安装");
      skippedDrivers.push(...required);
    } else {
      progress("appium.driver.ensure.start", { requiredDrivers: required, missingBefore, scope: only });
      const scopedConfig: AgentConfig = {
        ...config,
        appium: {
          ...config.appium,
          requiredDrivers: required as AgentConfig["appium"]["requiredDrivers"]
        }
      };
      try {
        await ensureAppiumDrivers(scopedConfig, onLogLine);
        installedDrivers.push(...missingBefore);
        skippedDrivers.push(...required.filter((x) => !missingBefore.includes(x)));
        state.driversReady = true;
        mergeInstalledScope(state, "drivers");
        progress("appium.driver.ensure.done");
      } catch (error) {
        onLogLine?.(`[appium][warn] 驱动安装未完成: ${briefErrorMessage(error)}`);
      }
    }
  }

  if (only === "all") {
    mergeInstalledScope(state, "all");
  }

  state.androidHome = homes.androidHome;
  state.appiumHome = homes.appiumHome;
  if (needPlaywright || installedPackages.length > 0) {
    if (needPlaywright) {
      await rankPlaywrightHosts(config);
    }
    await syncProbeSelectionsToState(state, config);
  }
  await saveInstallState(state);
  const installedPkgs = Array.from(new Set(installedPackages));
  progress("deps.ensure.done", { installedPackages: installedPkgs, missingDetected: missing });
  depsStructuredLog("info", { event: "deps.install.completed", details: { installedPackages: installedPkgs } });
  const requestedPackages = ["playwright", "appium", "selenium-webdriver", "hypium-driver"].filter((pkg) =>
    packageNeededForScope(pkg, scopeFlags)
  );
  let nativeDriversDir: string | undefined;
  let geckodriverPath: string | undefined;
  let chromedriverPath: string | undefined;
  let availableChromedriverMajors: string[] | undefined;
  if (needSelenium) {
    const root = await resolveWorkspaceRoot(process.cwd());
    nativeDriversDir = path.resolve(
      root,
      options?.nativeDriversDir ?? config.dependencies.nativeDriversDir ?? "dirver"
    );
    availableChromedriverMajors = await listLocalChromedriverVersions(nativeDriversDir);
    const resolved = await resolveNativeDrivers({
      workspaceRoot: root,
      driversDir: nativeDriversDir,
      selection: {
        geckodriverVersion: options?.geckodriverVersion ?? config.dependencies.geckodriverVersion,
        chromedriverVersion: options?.chromedriverVersion ?? config.dependencies.chromedriverVersion
      }
    });
    geckodriverPath = resolved.geckodriverPath;
    chromedriverPath = resolved.chromedriverPath;
  }

  const summary: InstallSummary = {
    scope: only,
    force,
    elapsedMs: Date.now() - startedAt,
    requestedDrivers,
    installedPackages: Array.from(new Set(installedPackages)),
    skippedPackages: requestedPackages.filter((pkg) => !installedPackages.includes(pkg)),
    installedDrivers: Array.from(new Set(installedDrivers)),
    skippedDrivers: Array.from(new Set(skippedDrivers)),
    nativeDriversDir,
    geckodriverPath,
    chromedriverPath,
    availableChromedriverMajors
  };
  return summary;
}

export type { PackageSource } from "./deps-resolution.js";

export async function getDependencyHealth(
  config?: Pick<AgentConfig, "appium" | "dependencies" | "monitoring">
): Promise<{
  playwrightInstalled: boolean;
  playwrightLaunchOk: boolean;
  hypiumDriverInstalled: boolean;
  seleniumWebdriverInstalled: boolean;
  geckodriverOk: boolean;
  chromedriverOk: boolean;
  appiumInstalled: boolean;
  appiumCliOk: boolean;
  appiumDriversOk: boolean;
  missingAppiumDrivers: string[];
  harmonyToolsDir: string | null;
  hdcReachable: boolean;
  hdcTargetsSummary: string;
  packageSources: {
    playwright: PackageSource;
    appium: PackageSource;
    seleniumWebdriver: PackageSource;
    hypiumDriver: PackageSource;
  };
}> {
  await ensureSharedDepsModuleResolution();
  const root = await resolveWorkspaceRoot(process.cwd());
  const toolsRelative =
    config?.dependencies?.toolsDir?.trim() || process.env.ADA_TOOLS_RELATIVE_DIR?.trim() || "tools";
  const tools = await applyAdaToolsToProcessEnv({ cwd: root, relativeDir: toolsRelative });
  let hdcReachable = false;
  let hdcTargetsSummary = "";
  if (tools.hdcPath) {
    const probe = await probeHdc(tools.hdcPath);
    hdcReachable = probe.ok;
    hdcTargetsSummary = probe.ok
      ? probe.output
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean)
          .join("; ") || "(no devices)"
      : probe.error ?? probe.output;
  }
  const playwrightInstalled = isPackageAvailable("playwright");
  let playwrightLaunchOk = false;
  const hypiumDriverInstalled = isPackageAvailable("hypium-driver");
  const appiumInstalled = isPackageAvailable("appium");
  const packageSources = {
    playwright: getPackageSource("playwright"),
    appium: getPackageSource("appium"),
    seleniumWebdriver: getPackageSource("selenium-webdriver"),
    hypiumDriver: getPackageSource("hypium-driver")
  };
  let appiumCliOk = false;
  let appiumDriversOk = false;
  let missingAppiumDrivers: string[] = [];

  if (playwrightInstalled) {
    playwrightLaunchOk = await checkPlaywrightLaunchable();
  }
  if (appiumInstalled) {
    try {
      const pkgPath = depsRequire().resolve("appium/package.json");
      const raw = await fs.readFile(pkgPath, "utf8");
      const version = String((JSON.parse(raw) as { version?: unknown }).version ?? "");
      appiumCliOk = version.length > 0;
    } catch {
      appiumCliOk = false;
    }
    if (appiumCliOk) {
      const installed = (await getInstalledAppiumDrivers()).map((x) => x.toLowerCase());
      const required = filterAppiumDriversForPlatform(
        config?.appium?.requiredDrivers && config.appium.requiredDrivers.length > 0
          ? config.appium.requiredDrivers.map((x) => x.toLowerCase())
          : ["uiautomator2", "xcuitest"]
      );
      missingAppiumDrivers = required.filter((x) => !installed.includes(x));
      appiumDriversOk = missingAppiumDrivers.length === 0;
    }
  }

  const driversDir = await resolveNativeDriversDir(root);
  const native = await resolveNativeDrivers({ workspaceRoot: root, driversDir });
  const seleniumWebdriverInstalled = isPackageAvailable("selenium-webdriver");
  const geckodriverOk = native.geckodriverOk;
  const chromedriverOk = native.chromedriverOk;

  return {
    playwrightInstalled,
    playwrightLaunchOk,
    hypiumDriverInstalled,
    seleniumWebdriverInstalled,
    geckodriverOk,
    chromedriverOk,
    appiumInstalled,
    appiumCliOk,
    appiumDriversOk,
    missingAppiumDrivers,
    harmonyToolsDir: tools.toolsDir,
    hdcReachable,
    hdcTargetsSummary,
    packageSources
  };
}
