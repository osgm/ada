import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolvePlaywrightHeadless } from "./playwright-defaults.js";
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export type CdpBrowserFamily = "chromium" | "firefox";

export interface CdpEndpointParts {
  url: string;
  host: string;
  port: number;
}

export interface CdpAutoLaunchPlan {
  url: string;
  port: number;
  browser: CdpBrowserFamily;
  autoLaunch: boolean;
  executablePath: string;
  channel: string;
  userDataDir: string;
  headless: boolean;
  extraArgs: string[];
}

export interface CdpSpawnHandle {
  pid: number;
  browser: CdpBrowserFamily;
  port: number;
  url: string;
  executablePath: string;
  /** 自动分配的 profile（Chrome CDP 无 userDataDir 时创建） */
  userDataDir?: string;
}

const spawnRegistry = new Map<number, CdpSpawnHandle>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickBool(payload: Record<string, unknown>, options: Record<string, unknown>, key: string, envKey?: string): boolean | undefined {
  if (typeof payload[key] === "boolean") return payload[key] as boolean;
  if (typeof options[key] === "boolean") return options[key] as boolean;
  if (envKey && process.env[envKey] === "true") return true;
  if (envKey && process.env[envKey] === "false") return false;
  return undefined;
}

function pickString(payload: Record<string, unknown>, options: Record<string, unknown>, key: string, envKey?: string): string {
  const top = getString(payload[key]);
  if (top) return top;
  const nested = getString(options[key]);
  if (nested) return nested;
  if (envKey && process.env[envKey]?.trim()) return process.env[envKey]!.trim();
  return "";
}

/** Parse cdpEndpoint / port shorthand into http://host:port */
export function parseCdpEndpoint(input: string, defaultPort = 9222): CdpEndpointParts {
  const trimmed = input.trim();
  if (!trimmed) {
    const port = defaultPort;
    return { url: `http://127.0.0.1:${port}`, host: "127.0.0.1", port };
  }
  if (/^\d+$/.test(trimmed)) {
    const port = Number(trimmed);
    return { url: `http://127.0.0.1:${port}`, host: "127.0.0.1", port };
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);
  const port = url.port ? Number(url.port) : defaultPort;
  return { url: `http://${url.hostname}:${port}`, host: url.hostname, port };
}

export function resolveCdpBrowserFamily(payload?: Record<string, unknown>): CdpBrowserFamily {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const raw = (getString(p.browser) ?? getString(options.browser) ?? process.env.ADA_PLAYWRIGHT_CDP_BROWSER ?? "chromium").toLowerCase();
  return raw === "firefox" ? "firefox" : "chromium";
}

export function defaultCdpPort(browser: CdpBrowserFamily): number {
  if (browser === "firefox") {
    const n = Number(process.env.ADA_PLAYWRIGHT_CDP_PORT_FIREFOX ?? 9223);
    return Number.isFinite(n) && n > 0 ? n : 9223;
  }
  const n = Number(process.env.ADA_PLAYWRIGHT_CDP_PORT ?? 9222);
  return Number.isFinite(n) && n > 0 ? n : 9222;
}

export function resolveCdpAutoLaunchPlan(payload?: Record<string, unknown>): CdpAutoLaunchPlan | null {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const browser = resolveCdpBrowserFamily(p);
  const autoLaunch = pickBool(p, options, "cdpAutoLaunch", "ADA_PLAYWRIGHT_CDP_AUTO_LAUNCH") ?? false;
  const endpointRaw = pickString(p, options, "cdpEndpoint", "ADA_PLAYWRIGHT_CDP_ENDPOINT");
  const cdpPortRaw = pickString(p, options, "cdpPort", "ADA_PLAYWRIGHT_CDP_PORT");

  if (!autoLaunch && !endpointRaw) {
    return null;
  }

  const portDefault = cdpPortRaw ? Number(cdpPortRaw) : defaultCdpPort(browser);
  const parts = parseCdpEndpoint(endpointRaw || String(portDefault), portDefault);
  const headless = resolvePlaywrightHeadless(p);

  const cdpLaunchArgs = Array.isArray(p.cdpLaunchArgs)
    ? (p.cdpLaunchArgs as unknown[]).map(String)
    : Array.isArray(options.cdpLaunchArgs)
      ? (options.cdpLaunchArgs as unknown[]).map(String)
      : [];
  // CDP auto-launch 分支默认不经过 playwright launcher.launch(...)，因此 launchOptions.args
  // 需要在这里手动继承，否则 --start-maximized / --window-size 不生效。
  const launchOptions = asRecord(p.launchOptions);
  const launchOptionsArgs = Array.isArray(launchOptions.args)
    ? (launchOptions.args as unknown[]).map(String)
    : [];
  const extraArgs = [...launchOptionsArgs, ...cdpLaunchArgs];

  return {
    url: parts.url,
    port: parts.port,
    browser,
    autoLaunch,
    executablePath: pickString(p, options, "executablePath", "ADA_PLAYWRIGHT_EXECUTABLE_PATH"),
    channel: pickString(p, options, "channel", "ADA_PLAYWRIGHT_CHANNEL"),
    userDataDir: pickString(p, options, "userDataDir", "ADA_PLAYWRIGHT_USER_DATA_DIR"),
    headless,
    extraArgs
  };
}

export async function probeCdpEndpoint(url: string, timeoutMs = 3000): Promise<boolean> {
  const base = url.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

function pathExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function firstExisting(paths: string[]): string | undefined {
  for (const p of paths) {
    if (p && pathExists(p)) return p;
  }
  return undefined;
}

export function resolveChromiumExecutable(channel?: string, executablePath?: string): string {
  if (executablePath?.trim()) return executablePath.trim();
  const ch = (channel || process.env.ADA_PLAYWRIGHT_CHANNEL || "chrome").toLowerCase();
  if (ch === "msedge" || ch === "edge") {
    const edge = firstExisting([
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    ]);
    if (edge) return edge;
  }
  const chrome = firstExisting([
    process.env.ADA_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ].filter((x): x is string => Boolean(x)));
  if (chrome) return chrome;
  throw new Error(
    "cdpAutoLaunch: Chrome/Edge not found. Set executablePath, channel=msedge, or ADA_CHROME_PATH"
  );
}

export function resolveFirefoxExecutable(executablePath?: string): string {
  if (executablePath?.trim()) return executablePath.trim();
  const ff = firstExisting([
    process.env.ADA_FIREFOX_PATH,
    "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
    "/Applications/Firefox.app/Contents/MacOS/firefox",
    "/usr/bin/firefox"
  ].filter((x): x is string => Boolean(x)));
  if (ff) return ff;
  throw new Error("cdpAutoLaunch: Firefox not found. Set executablePath or ADA_FIREFOX_PATH");
}

/** Chrome 远程调试须使用非默认 Profile，未指定时自动创建临时目录 */
export function resolveChromiumCdpUserDataDir(plan: CdpAutoLaunchPlan): string {
  if (plan.userDataDir?.trim()) {
    const dir = plan.userDataDir.trim();
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  return fs.mkdtempSync(path.join(os.tmpdir(), "ada-cdp-chromium-"));
}

function buildChromiumLaunchArgs(plan: CdpAutoLaunchPlan, userDataDir: string): string[] {
  const args = [
    `--remote-debugging-port=${plan.port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking"
  ];
  if (plan.headless) {
    args.push("--headless=new");
  }
  return [...args, ...plan.extraArgs];
}

/** Firefox 129+：`-remote-debugging-port PORT`（空格分隔），profile 用 `-profile` */
function buildFirefoxLaunchArgs(plan: CdpAutoLaunchPlan): string[] {
  const args = ["-no-remote", "-remote-debugging-port", String(plan.port)];
  if (plan.userDataDir) {
    fs.mkdirSync(plan.userDataDir, { recursive: true });
    args.push("-profile", plan.userDataDir);
  }
  if (plan.headless) {
    args.push("-headless");
  }
  return [...args, ...plan.extraArgs];
}

export function spawnCdpBrowser(plan: CdpAutoLaunchPlan): CdpSpawnHandle {
  const executable =
    plan.browser === "firefox"
      ? resolveFirefoxExecutable(plan.executablePath)
      : resolveChromiumExecutable(plan.channel, plan.executablePath);
  const chromiumProfile = plan.browser === "firefox" ? "" : resolveChromiumCdpUserDataDir(plan);
  const args =
    plan.browser === "firefox"
      ? buildFirefoxLaunchArgs(plan)
      : buildChromiumLaunchArgs(plan, chromiumProfile);
  const child = spawn(executable, args, {
    detached: true,
    stdio: "ignore",
    shell: false,
    ...(process.platform === "win32" ? { windowsHide: true } : {})
  });
  if (!child.pid) {
    throw new Error(`cdpAutoLaunch: failed to spawn ${plan.browser} (${executable})`);
  }
  const handle: CdpSpawnHandle = {
    pid: child.pid,
    browser: plan.browser,
    port: plan.port,
    url: plan.url,
    executablePath: executable,
    ...(chromiumProfile ? { userDataDir: chromiumProfile } : {})
  };
  child.unref();
  spawnRegistry.set(child.pid, handle);
  return handle;
}

/** 强制结束进程树（关闭浏览器超时兜底） */
export async function forceKillProcessTree(pid: number): Promise<void> {
  forceKillProcessTreeDetached(pid);
}

/** 立即发起杀进程，不注册会拖住 Node 事件循环的 Promise（脚本退出用） */
export function forceKillProcessTreeDetached(pid: number): void {
  if (!pid || pid <= 0) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      shell: false,
      windowsHide: true,
      detached: true,
      stdio: "ignore"
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
  }
}

export async function stopCdpSpawn(handle?: CdpSpawnHandle | null): Promise<void> {
  if (!handle?.pid) return;
  spawnRegistry.delete(handle.pid);
  await forceKillProcessTree(handle.pid);
}

/** 结束指定类型的 cdpAutoLaunch 进程；不传 browser 则清理全部 */
export async function cleanupCdpSpawns(browser?: CdpBrowserFamily): Promise<number> {
  const handles = [...spawnRegistry.values()].filter((h) => !browser || h.browser === browser);
  for (const h of handles) {
    spawnRegistry.delete(h.pid);
  }
  await Promise.all(handles.map((h) => forceKillProcessTree(h.pid).catch(() => undefined)));
  return handles.length;
}

/** 结束所有由 cdpAutoLaunch 拉起的浏览器进程（进程退出等全局清理用） */
export async function cleanupAllCdpSpawns(): Promise<number> {
  return cleanupCdpSpawns();
}

/** 同步登记并 detached 杀 CDP 子进程，不阻塞事件循环 */
export function cleanupAllCdpSpawnsDetached(): number {
  const handles = [...spawnRegistry.values()];
  spawnRegistry.clear();
  for (const h of handles) {
    forceKillProcessTreeDetached(h.pid);
  }
  return handles.length;
}

/** Probe CDP; if autoLaunch and unreachable, spawn browser and wait until debugger is up. */
export async function ensureCdpEndpointReady(
  plan: CdpAutoLaunchPlan,
  opts?: { waitTimeoutMs?: number }
): Promise<{ url: string; spawned: CdpSpawnHandle | null }> {
  const timeoutMs = opts?.waitTimeoutMs ?? 45_000;
  if (await probeCdpEndpoint(plan.url)) {
    return { url: plan.url, spawned: null };
  }
  if (!plan.autoLaunch) {
    throw new Error(
      `CDP endpoint not reachable at ${plan.url}. Start browser with remote debugging or set cdpAutoLaunch=true`
    );
  }
  const spawned = spawnCdpBrowser(plan);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeCdpEndpoint(plan.url)) {
      return { url: plan.url, spawned };
    }
    await sleep(500);
  }
  await stopCdpSpawn(spawned).catch(() => undefined);
  throw new Error(
    `cdpAutoLaunch: ${plan.browser} did not expose CDP at ${plan.url} within ${timeoutMs}ms`
  );
}
