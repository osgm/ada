import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentConfig } from "./types.js";
import { log } from "./logger.js";
import { ensureLocalDataDir, resolveWorkspaceRoot } from "./config.js";

const require = createRequire(path.join(process.cwd(), "package.json"));

function shouldUseShell(command: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }
  return command === "npm" || command === "pnpm";
}

function hasPackage(packageName: string): boolean {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

interface RunCommandOptions {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** 当提供时，子进程 stdout/stderr 会回传为行（并同时仍向父进程终端输出时仅回传，不 inherit） */
  onLogLine?: (line: string) => void;
}

function runCommand(command: string, args: string[], options?: RunCommandOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onLogLine = options?.onLogLine;
    /** 始终管道输出，避免 Windows 上 inherit 弹出 cmd；无回调时丢弃数据防止缓冲区塞满 */
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"] as const,
      shell: shouldUseShell(command),
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
        if (t.length > 0) {
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

function runCommandCapture(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: shouldUseShell(command),
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

function requiredAppiumDrivers(config: AgentConfig): string[] {
  return Array.from(new Set(config.appium.requiredDrivers ?? []));
}

function npmProxyRegistry(): string {
  return process.env.ADA_NPM_PROXY_REGISTRY ?? "https://registry.npmmirror.com";
}

function pnpmProxyRegistry(): string {
  return process.env.ADA_PNPM_PROXY_REGISTRY ?? npmProxyRegistry();
}

function installStrategyTimeoutMs(): number {
  const raw = process.env.ADA_INSTALL_STRATEGY_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : 20000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20000;
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


async function getAppiumMajorVersion(): Promise<number | null> {
  let version = "";
  try {
    const pkgPath = require.resolve("appium/package.json");
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

function progress(stage: string, details?: Record<string, unknown>): void {
  const meta = stepMeta(stage);
  log("info", {
    event: "deps.progress",
    details: {
      stage,
      ...meta,
      ...(details ?? {})
    }
  });
}

function normalizeRegistryUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function registryCandidates(config: AgentConfig, baseProxy: string): string[] {
  const primary = normalizeRegistryUrl(baseProxy);
  const configured = Array.isArray(config.dependencies.npmRegistryCandidates)
    ? config.dependencies.npmRegistryCandidates.map((x) => normalizeRegistryUrl(String(x).trim())).filter(Boolean)
    : [];
  const fallback = "https://registry.npmjs.org";
  const extra = process.env.ADA_REGISTRY_CANDIDATES
    ? process.env.ADA_REGISTRY_CANDIDATES.split(",").map((x) => normalizeRegistryUrl(x.trim())).filter(Boolean)
    : [];
  return Array.from(new Set([primary, ...configured, ...extra, fallback]));
}

async function probeRegistryLatency(registry: string): Promise<number | null> {
  const target = `${normalizeRegistryUrl(registry)}/appium`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(target, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }
    return Date.now() - started;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function detectBestRegistry(config: AgentConfig, baseProxy: string): Promise<string> {
  const candidates = registryCandidates(config, baseProxy);
  const cacheKey = `${normalizeRegistryUrl(baseProxy)}|${candidates.join(",")}`;
  const cached = detectedBestRegistryByKey.get(cacheKey);
  if (cached) {
    return cached;
  }
  progress("registry.probe.start", { candidates });
  const probeResults = await Promise.all(
    candidates.map(async (candidate) => {
      progress("registry.probe.try", { candidate });
      const latency = await probeRegistryLatency(candidate);
      progress("registry.probe.result", { candidate, latencyMs: latency });
      return { candidate, latency };
    })
  );
  let best = normalizeRegistryUrl(baseProxy);
  let bestLatency = Number.POSITIVE_INFINITY;
  for (const { candidate, latency } of probeResults) {
    if (latency === null) continue;
    if (latency < bestLatency) {
      best = candidate;
      bestLatency = latency;
    }
  }

  detectedBestRegistryByKey.set(cacheKey, best);
  log("info", {
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

function playwrightHostCandidates(config: AgentConfig): string[] {
  const configured = normalizeHostUrl(playwrightDownloadHost(config));
  const configuredCandidates = Array.isArray(config.dependencies.playwrightHostCandidates)
    ? config.dependencies.playwrightHostCandidates.map((x) => normalizeHostUrl(String(x).trim())).filter(Boolean)
    : [];
  const fallback = "https://playwright.azureedge.net";
  const extra = process.env.ADA_PLAYWRIGHT_HOST_CANDIDATES
    ? process.env.ADA_PLAYWRIGHT_HOST_CANDIDATES.split(",").map((x) => normalizeHostUrl(x.trim())).filter(Boolean)
    : [];
  return Array.from(new Set([configured, ...configuredCandidates, ...extra, fallback]));
}

async function probeHostLatency(host: string): Promise<number | null> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(host, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal
    });
    if (response.status >= 200 && response.status < 500) {
      return Date.now() - started;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function detectBestPlaywrightHost(config: AgentConfig): Promise<string> {
  if (detectedBestPlaywrightHost) {
    return detectedBestPlaywrightHost;
  }

  const candidates = playwrightHostCandidates(config);
  progress("playwright.host.probe.start", { candidates });
  const probeResults = await Promise.all(
    candidates.map(async (candidate) => {
      progress("playwright.host.probe.try", { candidate });
      const latency = await probeHostLatency(candidate);
      progress("playwright.host.probe.result", { candidate, latencyMs: latency });
      return { candidate, latency };
    })
  );
  let best = normalizeHostUrl(playwrightDownloadHost(config));
  let bestLatency = Number.POSITIVE_INFINITY;
  for (const { candidate, latency } of probeResults) {
    if (latency === null) continue;
    if (latency < bestLatency) {
      best = candidate;
      bestLatency = latency;
    }
  }

  detectedBestPlaywrightHost = best;
  log("info", {
    event: "deps.playwright.host.auto-selected",
    details: {
      selected: best,
      candidates
    }
  });
  return best;
}

async function runInstallWithPriority(
  config: AgentConfig,
  packages: string[],
  onLogLine?: (line: string) => void
): Promise<void> {
  const npmProxy = await detectBestRegistry(config, npmProxyRegistry());
  const pnpmProxy = await detectBestRegistry(config, pnpmProxyRegistry());
  progress("packages.install.start", { packages, npmProxy, pnpmProxy });
  onLogLine?.(`[deps] 在线安装包: ${packages.join(" ")} (顺序: pnpm -> pnpm-proxy -> npm -> npm-proxy)`);
  // 国内网络环境优先尝试 pnpm + 代理，再回退 npm + 代理。
  const strategies: Array<{
    name: "npm" | "npm-proxy" | "pnpm" | "pnpm-proxy";
    run: () => Promise<void>;
  }> = [
    {
      name: "pnpm",
      run: () =>
        runCommand("pnpm", ["add", ...packages], {
          timeoutMs: installStrategyTimeoutMs(),
          onLogLine
        })
    },
    {
      name: "pnpm-proxy",
      run: () =>
        runCommand("pnpm", ["add", ...packages, "--registry", pnpmProxy], {
          timeoutMs: installStrategyTimeoutMs(),
          onLogLine
        })
    },
    {
      name: "npm",
      run: () =>
        runCommand("npm", ["install", ...packages], {
          timeoutMs: installStrategyTimeoutMs(),
          onLogLine
        })
    },
    {
      name: "npm-proxy",
      run: () =>
        runCommand("npm", ["install", ...packages, "--registry", npmProxy], {
          timeoutMs: installStrategyTimeoutMs(),
          onLogLine
        })
    },
  ];

  let lastError: unknown = undefined;
  for (const strategy of strategies) {
    try {
      log("info", { event: "deps.install.strategy.try", details: { strategy: strategy.name, packages } });
      await strategy.run();
      log("info", { event: "deps.install.strategy.ok", details: { strategy: strategy.name } });
      progress("packages.install.done", { strategy: strategy.name });
      return;
    } catch (error) {
      lastError = error;
      log("warn", {
        event: "deps.install.strategy.fail",
        details: { strategy: strategy.name, message: error instanceof Error ? error.message : String(error) }
      });
    }
  }
  throw new Error(
    `Dependency install failed after all strategies: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function runAppiumDriverInstallWithPriority(
  config: AgentConfig,
  driver: string,
  onLogLine?: (line: string) => void
): Promise<void> {
  const npmProxy = await detectBestRegistry(config, npmProxyRegistry());
  progress("appium.driver.install.start", { driver, npmProxy });
  onLogLine?.(`[appium] 安装驱动: ${driver}`);
  const compatibleSpecs = await resolveCompatibleDriverSpecs(driver);
  const appiumMajor = await getAppiumMajorVersion();
  const directPackage = appiumDriverPackageName(driver);
  /** 仅使用 npm 包规范名，避免把裸驱动名当作 npm 包安装导致 invalid package。 */
  const baseTarget = directPackage ?? driver;
  const targets =
    appiumMajor !== null && appiumMajor < 3
      ? compatibleSpecs.length > 0
        ? compatibleSpecs
        : [baseTarget]
      : [baseTarget, ...compatibleSpecs];
  const uniqueTargets = Array.from(new Set(targets.filter(Boolean)));
  let lastError: unknown = undefined;
  for (const target of uniqueTargets) {
    const installArgs = ["exec", "appium", "driver", "install", "--source=npm", target];

    const strategies: Array<{
      name: "npm" | "npm-proxy";
      run: () => Promise<void>;
    }> = [
      {
        name: "npm",
        run: () =>
          runCommand("npm", installArgs, {
            timeoutMs: installStrategyTimeoutMs(),
            onLogLine
          })
      },
      {
        name: "npm-proxy",
        run: () =>
          runCommand("npm", installArgs, {
            env: { npm_config_registry: npmProxy },
            timeoutMs: installStrategyTimeoutMs(),
            onLogLine
          })
      }
    ];

    for (const strategy of strategies) {
      try {
        log("info", {
          event: "appium.driver.install.strategy.try",
          details: { strategy: strategy.name, driver, target }
        });
        await strategy.run();
        log("info", {
          event: "appium.driver.install.strategy.ok",
          details: { strategy: strategy.name, driver, target }
        });
        progress("appium.driver.install.done", { driver, strategy: strategy.name, target });
        return;
      } catch (error) {
        lastError = error;
        log("warn", {
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
  throw new Error(
    `Appium driver install failed after all strategies (${driver}): ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function verifyPlaywrightSelfTest(onLogLine?: (line: string) => void): Promise<void> {
  onLogLine?.("[playwright] 自检：启动 Chromium 空白页");
  const moduleName = ["play", "wright"].join("");
  const p = require(moduleName) as typeof import("playwright");
  const b = await p.chromium.launch({ headless: true });
  try {
    const c = await b.newContext();
    const page = await c.newPage();
    await page.goto("about:blank");
  } finally {
    await b.close();
  }
}

async function installPlaywrightBrowser(
  config: AgentConfig,
  onLogLine?: (line: string) => void
): Promise<void> {
  const targets = playwrightInstallTargets(config);
  progress("playwright.browser.install.start", { targets: targets.length > 0 ? targets : ["all"] });
  onLogLine?.("[playwright] 开始在线安装浏览器");
  const args = targets.length > 0 ? ["exec", "playwright", "install", ...targets] : ["exec", "playwright", "install"];
  const selectedHost = await detectBestPlaywrightHost(config);
  onLogLine?.(`[playwright] 下载浏览器（镜像 ${selectedHost}），目标: ${targets.length ? targets.join(",") : "all"}`);
  await runCommand("npm", args, {
    env: { PLAYWRIGHT_DOWNLOAD_HOST: selectedHost },
    timeoutMs: installStrategyTimeoutMs(),
    onLogLine
  });
  progress("playwright.browser.install.done", { selectedHost });
}

async function checkPlaywrightLaunchable(): Promise<boolean> {
  try {
    const moduleName = ["play", "wright"].join("");
    const p = require(moduleName) as typeof import("playwright");
    const b = await p.chromium.launch({ headless: true });
    await b.close();
    return true;
  } catch {
    return false;
  }
}

async function verifyAppiumCommand(): Promise<void> {
  try {
    const pkgPath = require.resolve("appium/package.json");
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
  const check = await runCommandCapture("npm", ["exec", "appium", "driver", "list", "--installed", "--json"]);
  if (check.code === 0 && check.stdout) {
    try {
      const parsed = JSON.parse(check.stdout) as Record<string, unknown>;
      const names = Object.keys(parsed);
      return names;
    } catch {
      // fall through to text parser
    }
  }

  const fallback = await runCommandCapture("npm", ["exec", "appium", "driver", "list", "--installed"]);
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
  const required = requiredAppiumDrivers(config);
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

export type InstallScope = "all" | "playwright" | "appium" | "drivers" | "mobile" | "android" | "ios" | "harmony";

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
}

interface InstallState {
  playwrightReady?: boolean;
  appiumReady?: boolean;
  driversReady?: boolean;
  androidHome?: string;
  appiumHome?: string;
}

interface InstallEnvHomes {
  androidHome: string;
  appiumHome: string;
  usedProjectFallbackAndroid: boolean;
  usedProjectFallbackAppium: boolean;
}

async function prepareInstallHomes(onLogLine?: (line: string) => void): Promise<InstallEnvHomes> {
  const root = await resolveWorkspaceRoot(process.cwd());
  const projectAndroidHome = path.join(root, "android-sdk");
  const projectAppiumHome = path.join(root, "appium");
  const envAndroid = (process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "").trim();
  const envAppium = (process.env.APPIUM_HOME ?? "").trim();

  const androidHome = envAndroid || projectAndroidHome;
  const appiumHome = envAppium || projectAppiumHome;
  const usedProjectFallbackAndroid = !envAndroid;
  const usedProjectFallbackAppium = !envAppium;

  await fs.mkdir(androidHome, { recursive: true });
  await fs.mkdir(appiumHome, { recursive: true });

  process.env.ANDROID_HOME = androidHome;
  process.env.ANDROID_SDK_ROOT = androidHome;
  process.env.APPIUM_HOME = appiumHome;

  onLogLine?.(
    `[deps] 环境目录: ANDROID_HOME=${androidHome} APPIUM_HOME=${appiumHome}` +
      (usedProjectFallbackAndroid || usedProjectFallbackAppium ? "（已使用项目目录兜底）" : "")
  );

  return {
    androidHome,
    appiumHome,
    usedProjectFallbackAndroid,
    usedProjectFallbackAppium
  };
}

function resolveRequestedDrivers(config: AgentConfig, only: InstallScope): string[] {
  const configured = requiredAppiumDrivers(config).map((x) => x.toLowerCase());
  const uniqueConfigured = Array.from(new Set(configured));

  if (only === "all" || only === "drivers" || only === "mobile") {
    return uniqueConfigured;
  }
  if (only === "android") {
    return Array.from(new Set(["uiautomator2", ...uniqueConfigured.filter((x) => x === "uiautomator2")]));
  }
  if (only === "ios") {
    return Array.from(new Set(["xcuitest", ...uniqueConfigured.filter((x) => x === "xcuitest")]));
  }
  if (only === "harmony") {
    return Array.from(new Set(["harmonyos", ...uniqueConfigured.filter((x) => x === "harmonyos")]));
  }
  return [];
}

async function loadInstallState(): Promise<InstallState> {
  try {
    const dir = await ensureLocalDataDir(process.cwd());
    const file = path.join(dir, "deps-install-state.json");
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as InstallState;
  } catch {
    return {};
  }
}

async function saveInstallState(state: InstallState): Promise<void> {
  const dir = await ensureLocalDataDir(process.cwd());
  const file = path.join(dir, "deps-install-state.json");
  await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
}

export async function ensureDriverDependencies(config: AgentConfig, options?: EnsureInstallOptions): Promise<InstallSummary> {
  const startedAt = Date.now();
  const only = options?.only ?? "all";
  const force = options?.force === true;
  const onLogLine = options?.onLogLine;
  const pwOverride = filterPlaywrightTargetsOverride(options?.playwrightInstallTargetsOverride);
  const configForPlaywright = pwOverride?.length ? configWithPlaywrightTargets(config, pwOverride) : config;
  const state = await loadInstallState();
  const homes = await prepareInstallHomes(onLogLine);
  progress("deps.ensure.start");
  onLogLine?.("[deps] 开始检测 / 安装依赖…");
  await ensureNodeEnvironmentForInstall(onLogLine);
  const missing: string[] = [];
  const needPlaywright = only === "all" || only === "playwright";
  const needAppium =
    only === "all" || only === "appium" || only === "drivers" || only === "mobile" || only === "android" || only === "ios" || only === "harmony";
  const requestedDrivers =
    options?.appiumRequiredDriversOverride !== undefined
      ? normalizeAppiumDriverTokens(options.appiumRequiredDriversOverride)
      : resolveRequestedDrivers(config, only);
  const needDrivers = requestedDrivers.length > 0;
  const installedPackages: string[] = [];
  const installedDrivers: string[] = [];
  const skippedDrivers: string[] = [];

  if (!hasPackage("playwright")) {
    missing.push("playwright");
  }
  if (!hasPackage("appium")) {
    missing.push("appium");
  }

  let packagesToInstall = missing.filter((pkg) => (pkg === "playwright" ? needPlaywright : needAppium));
  /** --force：包已在 node_modules 时也再跑一次安装，便于升级/修复损坏安装 */
  if (force) {
    if (needPlaywright && hasPackage("playwright")) {
      packagesToInstall.push("playwright");
    }
    if (needAppium && hasPackage("appium")) {
      packagesToInstall.push("appium");
    }
    packagesToInstall = Array.from(new Set(packagesToInstall));
  }
  if (packagesToInstall.length > 0) {
    progress("deps.package.missing", { missing, installing: packagesToInstall });
    log("warn", { event: "deps.missing", details: { missing, installing: packagesToInstall } });
    await runInstallWithPriority(config, packagesToInstall, onLogLine);
    installedPackages.push(...packagesToInstall);
  } else {
    progress("deps.package.ok", { missing: [] });
    log("info", { event: "deps.check.ok", details: { missing: [] } });
  }

  if (hasPackage("playwright") && needPlaywright) {
    progress("playwright.selfcheck.start");
    const launchOk = await checkPlaywrightLaunchable();
    const reinstallForTargets = force && Boolean(pwOverride?.length);
    /** GUI/CLI 显式传入浏览器目标时，应执行 `playwright install …`（与仅 Chromium 可启动无关） */
    const userRequestedBrowserTargets = Boolean(pwOverride?.length);
    /** --force：无论自检是否通过，都重新执行 `playwright install`（按勾选目标或配置文件） */
    if (!launchOk || reinstallForTargets || userRequestedBrowserTargets || force) {
      log("warn", {
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
      await installPlaywrightBrowser(configForPlaywright, onLogLine);
      progress("playwright.selfcheck.verify");
      await verifyPlaywrightSelfTest(onLogLine);
      state.playwrightReady = true;
      progress("playwright.selfcheck.done");
    } else if (!force && state.playwrightReady) {
      progress("playwright.selfcheck.skip.cache", { cached: true, healthy: true });
    } else {
      progress("playwright.selfcheck.verify");
      await verifyPlaywrightSelfTest(onLogLine);
      state.playwrightReady = true;
      progress("playwright.selfcheck.done");
    }
  }
  if (hasPackage("appium") && needAppium) {
    progress("appium.selfcheck.start");
    await verifyAppiumCommand();
    if (!force && state.appiumReady) {
      progress("appium.selfcheck.skip.cache", { cached: true, healthy: true });
    } else {
      state.appiumReady = true;
    }
  }
  if (hasPackage("appium") && needDrivers) {
    const installedBefore = (await getInstalledAppiumDrivers()).map((x) => x.toLowerCase());
    const required = requestedDrivers;
    const missingBefore = required.filter((x) => !installedBefore.includes(x));
    if (missingBefore.length === 0 && !force && state.driversReady) {
      progress("appium.driver.ensure.skip.cache", { cached: true, healthy: true });
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
      await ensureAppiumDrivers(scopedConfig, onLogLine);
      installedDrivers.push(...missingBefore);
      skippedDrivers.push(...required.filter((x) => !missingBefore.includes(x)));
      state.driversReady = true;
      progress("appium.driver.ensure.done");
    }
  }

  state.androidHome = homes.androidHome;
  state.appiumHome = homes.appiumHome;
  await saveInstallState(state);
  const installedPkgs = Array.from(new Set(installedPackages));
  progress("deps.ensure.done", { installedPackages: installedPkgs, missingDetected: missing });
  log("info", { event: "deps.install.completed", details: { installedPackages: installedPkgs } });
  const requestedPackages = ["playwright", "appium"].filter((pkg) => (pkg === "playwright" ? needPlaywright : needAppium));
  const summary: InstallSummary = {
    scope: only,
    force,
    elapsedMs: Date.now() - startedAt,
    requestedDrivers,
    installedPackages: Array.from(new Set(installedPackages)),
    skippedPackages: requestedPackages.filter((pkg) => !installedPackages.includes(pkg)),
    installedDrivers: Array.from(new Set(installedDrivers)),
    skippedDrivers: Array.from(new Set(skippedDrivers))
  };
  return summary;
}

export async function getDependencyHealth(config?: Pick<AgentConfig, "appium">): Promise<{
  playwrightInstalled: boolean;
  playwrightLaunchOk: boolean;
  appiumInstalled: boolean;
  appiumCliOk: boolean;
  appiumDriversOk: boolean;
  missingAppiumDrivers: string[];
}> {
  const playwrightInstalled = hasPackage("playwright");
  let playwrightLaunchOk = false;
  const appiumInstalled = hasPackage("appium");
  let appiumCliOk = false;
  let appiumDriversOk = false;
  let missingAppiumDrivers: string[] = [];

  if (playwrightInstalled) {
    playwrightLaunchOk = await checkPlaywrightLaunchable();
  }
  if (appiumInstalled) {
    try {
      const pkgPath = require.resolve("appium/package.json");
      const raw = await fs.readFile(pkgPath, "utf8");
      const version = String((JSON.parse(raw) as { version?: unknown }).version ?? "");
      appiumCliOk = version.length > 0;
    } catch {
      appiumCliOk = false;
    }
    if (appiumCliOk) {
      const installed = (await getInstalledAppiumDrivers()).map((x) => x.toLowerCase());
      const required =
        config?.appium?.requiredDrivers && config.appium.requiredDrivers.length > 0
          ? config.appium.requiredDrivers.map((x) => x.toLowerCase())
          : ["uiautomator2", "xcuitest", "harmonyos"];
      missingAppiumDrivers = required.filter((x) => !installed.includes(x));
      appiumDriversOk = missingAppiumDrivers.length === 0;
    }
  }

  return {
    playwrightInstalled,
    playwrightLaunchOk,
    appiumInstalled,
    appiumCliOk,
    appiumDriversOk,
    missingAppiumDrivers
  };
}
