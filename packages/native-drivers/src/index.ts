import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pickFastestProbeUrl } from "@ada/download-probe";

/** 本地 WebDriver 二进制目录默认名 `dirver`（历史拼写）；可由 nativeDriversDir 覆盖 */
export const DEFAULT_NATIVE_DRIVERS_DIR = "dirver";

const CHROME_FOR_TESTING_JSON =
  "https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json";

/** geckodriver 默认镜像（测速后可能改用更快源） */
export const DEFAULT_GECKODRIVER_MIRROR = "https://mirrors.huaweicloud.com/geckodriver";

/** geckodriver 候选镜像（安装前 Range 测速） */
export const DEFAULT_GECKODRIVER_MIRROR_CANDIDATES = [
  "https://cdn.npmmirror.com/binaries/geckodriver",
  "https://npmmirror.com/mirrors/geckodriver",
  "https://mirrors.huaweicloud.com/geckodriver"
] as const;

const GITHUB_GECKODRIVER_RELEASES = "https://github.com/mozilla/geckodriver/releases";

let detectedGeckodriverMirrorBase: string | null = null;

/** 各浏览器 WebDriver 官方/镜像手动下载参考（文档与提示用） */
export const SELENIUM_DRIVER_MANUAL_DOWNLOAD_REFERENCES = [
  {
    browser: "Chrome/Chromium",
    platforms: "Windows/Linux/macOS",
    vendor: "\u8c37\u6b4c",
    url: "https://chromedriver.storage.googleapis.com/index.html"
  },
  {
    browser: "Firefox",
    platforms: "Windows/Linux/macOS",
    vendor: "Mozilla",
    url: `华为云 ${DEFAULT_GECKODRIVER_MIRROR}/v0.36.0/，或 GitHub ${GITHUB_GECKODRIVER_RELEASES}`
  },
  {
    browser: "Edge",
    platforms: "win10",
    vendor: "\u5fae\u8f6f",
    url: "https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/"
  },
  {
    browser: "Internet Explorer",
    platforms: "Windows",
    vendor: "Selenium \u9879\u76ee\u7ec4",
    url: "https://selenium-release.storage.googleapis.com/index.html"
  },
  {
    browser: "Safari",
    platforms: "macOS El Capitan \u53ca\u66f4\u9ad8\u7248\u672c",
    vendor: "\u82f9\u679c",
    url: "\uff08\u7cfb\u7edf\u5185\u7f6e\uff0c\u65e0\u9700\u5355\u72ec\u4e0b\u8f7d\uff09"
  },
  {
    browser: "Opera",
    platforms: "Windows/macOS/Linux",
    vendor: "Opera",
    url: "https://github.com/operasoftware/operachromiumdriver/releases"
  }
] as const;

export interface LocalBrowserInfo {
  path: string;
  version: string;
  major: string;
}

export interface LocalBrowserDetection {
  chrome?: LocalBrowserInfo;
  firefox?: LocalBrowserInfo;
}

export interface NativeDriverSelection {
  geckodriverVersion?: string;
  chromedriverVersion?: string;
}

export interface ResolvedNativeDrivers {
  driversDir: string;
  geckodriverPath?: string;
  geckodriverVersion?: string;
  chromedriverPath?: string;
  chromedriverVersion?: string;
  geckodriverOk: boolean;
  chromedriverOk: boolean;
}

export interface NativeDriverManifest {
  driversDir: string;
  updatedAt: string;
  geckodriver?: { version: string; path: string };
  chromedriver?: { version: string; path: string };
}

export interface DownloadNativeDriversOptions extends NativeDriverSelection {
  driversDir?: string;
  workspaceRoot?: string;
  force?: boolean;
  onLogLine?: (line: string) => void;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function resolveWorkspaceRoot(cwd = process.cwd()): Promise<string> {
  let current = path.resolve(cwd);
  for (let i = 0; i < 8; i += 1) {
    const pkg = path.join(current, "package.json");
    if (await fileExists(pkg)) {
      try {
        const raw = await fs.readFile(pkg, "utf8");
        const parsed = JSON.parse(raw) as { workspaces?: unknown };
        if (parsed.workspaces) {
          return current;
        }
      } catch {
        // continue
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return path.resolve(cwd);
}

/** 解析 WebDriver 安装目录；可用 ADA_DRIVERS_DIR，否则尝试 dirver/driver/drivers */
export async function resolveNativeDriversDir(workspaceRoot?: string): Promise<string> {
  const root = workspaceRoot ? path.resolve(workspaceRoot) : await resolveWorkspaceRoot();
  const fromEnv = process.env.ADA_DRIVERS_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(root, fromEnv);
  }
  for (const name of [DEFAULT_NATIVE_DRIVERS_DIR, "driver", "drivers"]) {
    const candidate = path.join(root, name);
    if (await dirExists(candidate)) {
      return candidate;
    }
  }
  return path.join(root, DEFAULT_NATIVE_DRIVERS_DIR);
}

function geckodriverMirrorCandidates(): string[] {
  const extra = process.env.ADA_GECKODRIVER_MIRROR_CANDIDATES?.trim()
    ? process.env.ADA_GECKODRIVER_MIRROR_CANDIDATES.split(",").map((x) => x.trim()).filter(Boolean)
    : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...DEFAULT_GECKODRIVER_MIRROR_CANDIDATES, ...extra]) {
    const n = url.replace(/\/$/, "");
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function geckodriverMirrorBase(): string {
  const fromEnv = process.env.ADA_GECKODRIVER_MIRROR?.trim();
  return (fromEnv || detectedGeckodriverMirrorBase || DEFAULT_GECKODRIVER_MIRROR).replace(/\/$/, "");
}

async function detectBestGeckodriverMirrorBase(
  tag: string,
  onLogLine?: (line: string) => void
): Promise<string> {
  const fromEnv = process.env.ADA_GECKODRIVER_MIRROR?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  if (detectedGeckodriverMirrorBase) {
    return detectedGeckodriverMirrorBase;
  }
  const { fileName } = geckodriverPlatformAsset(tag);
  const probeUrls = geckodriverMirrorCandidates().map((base) => `${base}/${tag}/${fileName}`);
  onLogLine?.("[selenium] 探测 geckodriver 镜像下载速度…");
  const best = await pickFastestProbeUrl(probeUrls, onLogLine);
  const base =
    best?.url.slice(0, best.url.length - `/${tag}/${fileName}`.length) ??
    DEFAULT_GECKODRIVER_MIRROR;
  detectedGeckodriverMirrorBase = base;
  if (best) {
    onLogLine?.(`[selenium] geckodriver 选用镜像: ${base}（${best.probe.speedKBps.toFixed(0)} KB/s）`);
  }
  return base;
}

/** 国内镜像 / GitHub 发布包：Windows 为 zip，Linux/macOS 为 tar.gz */
export function geckodriverPlatformAsset(tag: string): { fileName: string; archiveKind: "zip" | "tar.gz" } {
  const t = tag.startsWith("v") ? tag : `v${tag}`;
  if (process.platform === "win32") {
    const winSuffix =
      process.arch === "arm64" ? "win-aarch64" : process.arch === "ia32" ? "win32" : "win64";
    return { fileName: `geckodriver-${t}-${winSuffix}.zip`, archiveKind: "zip" };
  }
  if (process.platform === "darwin") {
    const macSuffix = process.arch === "arm64" ? "macos-aarch64" : "macos";
    return { fileName: `geckodriver-${t}-${macSuffix}.tar.gz`, archiveKind: "tar.gz" };
  }
  const linuxSuffix =
    process.arch === "arm64" ? "linux-aarch64" : process.arch === "ia32" ? "linux32" : "linux64";
  return { fileName: `geckodriver-${t}-${linuxSuffix}.tar.gz`, archiveKind: "tar.gz" };
}

function parseSemverTuple(version: string): [number, number, number] | null {
  const m = version.replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) {
    return null;
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemverDesc(a: string, b: string): number {
  const pa = parseSemverTuple(a);
  const pb = parseSemverTuple(b);
  if (!pa || !pb) {
    return 0;
  }
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) {
      return pb[i] - pa[i];
    }
  }
  return 0;
}

async function fetchGeckodriverLatestFromMirror(mirrorBase: string): Promise<string | null> {
  const res = await fetch(`${mirrorBase}/`);
  if (!res.ok) {
    return null;
  }
  const html = await res.text();
  const tags = new Set<string>();
  for (const m of html.matchAll(/href="v(\d+\.\d+\.\d+)\//gi)) {
    tags.add(`v${m[1]}`);
  }
  const sorted = Array.from(tags).sort(compareSemverDesc);
  return sorted[0] ?? null;
}

function platformChromeLabel(): string {
  if (process.platform === "win32") {
    return "win64";
  }
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "mac-arm64" : "mac-x64";
  }
  return "linux64";
}

function geckodriverExeName(): string {
  return process.platform === "win32" ? "geckodriver.exe" : "geckodriver";
}

function chromedriverExeName(version?: string): string {
  const suffix = process.platform === "win32" ? ".exe" : "";
  if (version && version !== "latest") {
    const major = version.replace(/^v/i, "").split(".")[0];
    return `chromedriver${major}${suffix}`;
  }
  return `chromedriver${suffix}`;
}

async function listExecutablesInDir(driversDir: string): Promise<string[]> {
  if (!(await dirExists(driversDir))) {
    return [];
  }
  const entries = await fs.readdir(driversDir, { withFileTypes: true });
  const files: string[] = [];
  for (const ent of entries) {
    if (ent.isFile()) {
      files.push(ent.name);
    }
  }
  return files;
}

/** 扫描 dirver 目录下 chromedriver 可执行文件，如 chromedriver137.exe 对应主版本 137 */
export async function listLocalChromedriverVersions(driversDir: string): Promise<string[]> {
  const files = await listExecutablesInDir(driversDir);
  const versions = new Set<string>();
  for (const name of files) {
    const m = /^chromedriver(\d{2,4})(?:\.exe)?$/i.exec(name);
    if (m) {
      versions.add(m[1]);
    }
  }
  return Array.from(versions).sort((a, b) => Number(b) - Number(a));
}

export async function listLocalGeckodriverCandidates(driversDir: string): Promise<string[]> {
  const files = await listExecutablesInDir(driversDir);
  return files.filter((n) => /^geckodriver/i.test(n) && (n.endsWith(".exe") || !n.includes(".")));
}

async function findGeckodriverInDir(driversDir: string, version?: string): Promise<string | undefined> {
  if (!(await dirExists(driversDir))) {
    return undefined;
  }
  const names = await listLocalGeckodriverCandidates(driversDir);
  const prefer = geckodriverExeName();
  if (names.includes(prefer)) {
    return path.join(driversDir, prefer);
  }
  if (version) {
    const tagged = names.find((n) => n.includes(version.replace(/^v/, "")));
    if (tagged) {
      return path.join(driversDir, tagged);
    }
  }
  if (names.length > 0) {
    return path.join(driversDir, names[0]);
  }
  return undefined;
}

async function findChromedriverInDir(driversDir: string, version?: string): Promise<{ path: string; version: string } | undefined> {
  if (!(await dirExists(driversDir))) {
    return undefined;
  }
  const wantMajor = version && version !== "latest" ? version.replace(/^v/i, "").split(".")[0] : undefined;
  if (wantMajor) {
    const named = path.join(driversDir, chromedriverExeName(wantMajor));
    if (await fileExists(named)) {
      return { path: named, version: wantMajor };
    }
  }
  const generic = path.join(driversDir, chromedriverExeName());
  if (await fileExists(generic)) {
    return { path: generic, version: wantMajor ?? "generic" };
  }
  const locals = await listLocalChromedriverVersions(driversDir);
  if (locals.length > 0) {
    const pick = wantMajor && locals.includes(wantMajor) ? wantMajor : locals[0];
    return { path: path.join(driversDir, chromedriverExeName(pick)), version: pick };
  }
  return undefined;
}

export async function resolveGeckodriverPath(options?: {
  driversDir?: string;
  version?: string;
  workspaceRoot?: string;
}): Promise<string | undefined> {
  const fromEnv = process.env.ADA_GECKODRIVER_PATH?.trim();
  if (fromEnv && (await fileExists(fromEnv))) {
    return fromEnv;
  }
  const driversDir = options?.driversDir ?? (await resolveNativeDriversDir(options?.workspaceRoot));
  const local = await findGeckodriverInDir(driversDir, options?.version);
  if (local && (await fileExists(local))) {
    return local;
  }
  if (await commandOnPath("geckodriver")) {
    return "geckodriver";
  }
  return undefined;
}

export async function resolveChromedriverPath(options?: {
  driversDir?: string;
  version?: string;
  workspaceRoot?: string;
}): Promise<{ path: string; version: string } | undefined> {
  const fromEnv = process.env.ADA_CHROMEDRIVER_PATH?.trim();
  if (fromEnv && (await fileExists(fromEnv))) {
    return { path: fromEnv, version: options?.version ?? "env" };
  }
  const driversDir = options?.driversDir ?? (await resolveNativeDriversDir(options?.workspaceRoot));
  const local = await findChromedriverInDir(driversDir, options?.version);
  if (local && (await fileExists(local.path))) {
    return local;
  }
  if (await commandOnPath("chromedriver")) {
    return { path: "chromedriver", version: options?.version ?? "path" };
  }
  return undefined;
}

export async function resolveNativeDrivers(options?: {
  driversDir?: string;
  workspaceRoot?: string;
  selection?: NativeDriverSelection;
}): Promise<ResolvedNativeDrivers> {
  const driversDir = options?.driversDir ?? (await resolveNativeDriversDir(options?.workspaceRoot));
  const geckoPath = await resolveGeckodriverPath({
    driversDir,
    version: options?.selection?.geckodriverVersion,
    workspaceRoot: options?.workspaceRoot
  });
  const chrome = await resolveChromedriverPath({
    driversDir,
    version: options?.selection?.chromedriverVersion,
    workspaceRoot: options?.workspaceRoot
  });
  return {
    driversDir,
    geckodriverPath: geckoPath === "geckodriver" ? undefined : geckoPath,
    geckodriverVersion: options?.selection?.geckodriverVersion,
    chromedriverPath: chrome?.path === "chromedriver" ? undefined : chrome?.path,
    chromedriverVersion: chrome?.version,
    geckodriverOk: Boolean(geckoPath),
    chromedriverOk: Boolean(chrome)
  };
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

async function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
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

async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  if (process.platform === "win32") {
    await runCommand("tar", ["-xzf", archivePath, "-C", destDir]);
    return;
  }
  await runCommand("tar", ["-xzf", archivePath, "-C", destDir]);
}

async function extractDriverArchive(archivePath: string, destDir: string, kind: "zip" | "tar.gz"): Promise<void> {
  if (kind === "zip") {
    await extractZip(archivePath, destDir);
    return;
  }
  await extractTarGz(archivePath, destDir);
}

async function findFileRecursive(dir: string, fileName: string): Promise<string | undefined> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
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

async function copyExecutable(src: string, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
  if (process.platform !== "win32") {
    await fs.chmod(dest, 0o755);
  }
}

export async function fetchGeckodriverReleaseVersion(requested?: string): Promise<string> {
  if (requested && requested !== "latest") {
    return requested.startsWith("v") ? requested : `v${requested}`;
  }
  const mirrorLatest = await fetchGeckodriverLatestFromMirror(geckodriverMirrorBase());
  if (mirrorLatest) {
    return mirrorLatest;
  }
  try {
    const res = await fetch("https://api.github.com/repos/mozilla/geckodriver/releases/latest");
    if (res.ok) {
      const json = (await res.json()) as { tag_name?: string };
      const tag = json.tag_name ?? "v0.36.0";
      return tag.startsWith("v") ? tag : `v${tag}`;
    }
  } catch {
    // fall through
  }
  return "v0.36.0";
}

export function buildGeckodriverDownloadUrls(
  tag: string,
  mirrorBase?: string
): { mirror: string; github: string; fileName: string; archiveKind: "zip" | "tar.gz" } {
  const { fileName, archiveKind } = geckodriverPlatformAsset(tag);
  const base = (mirrorBase ?? geckodriverMirrorBase()).replace(/\/$/, "");
  const mirror = `${base}/${tag}/${fileName}`;
  const github = `${GITHUB_GECKODRIVER_RELEASES}/download/${tag}/${fileName}`;
  return { mirror, github, fileName, archiveKind };
}

export async function listChromedriverCfTVersions(): Promise<Array<{ version: string; major: string }>> {
  const res = await fetch(CHROME_FOR_TESTING_JSON);
  if (!res.ok) {
    throw new Error(`Failed to fetch chrome-for-testing versions: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    versions?: Array<{ version: string }>;
  };
  const out: Array<{ version: string; major: string }> = [];
  for (const item of json.versions ?? []) {
    const major = item.version.split(".")[0];
    if (major) {
      out.push({ version: item.version, major });
    }
  }
  const byMajor = new Map<string, string>();
  for (const item of out) {
    if (!byMajor.has(item.major)) {
      byMajor.set(item.major, item.version);
    }
  }
  return Array.from(byMajor.entries())
    .map(([major, version]) => ({ major, version }))
    .sort((a, b) => Number(b.major) - Number(a.major));
}

export async function resolveChromedriverCfTVersion(requested?: string): Promise<string> {
  const catalog = await listChromedriverCfTVersions();
  if (catalog.length === 0) {
    throw new Error("chrome-for-testing version catalog is empty");
  }
  if (!requested || requested === "latest") {
    return catalog[0].version;
  }
  if (requested === "match-chrome") {
    const detected = await detectInstalledChromeMajorVersion();
    if (detected) {
      const hit = catalog.find((x) => x.major === detected);
      if (hit) {
        return hit.version;
      }
    }
    return catalog[0].version;
  }
  const major = requested.replace(/^v/i, "").split(".")[0];
  const hit = catalog.find((x) => x.major === major);
  if (!hit) {
    throw new Error(
      `chromedriver version ${requested} not found in chrome-for-testing catalog; available majors: ${catalog.map((x) => x.major).join(", ")}`
    );
  }
  return hit.version;
}

function parseBrowserVersionString(raw: string): { version: string; major: string } | undefined {
  const match = raw.match(/(\d+\.\d+(?:\.\d+)*(?:\.\d+)?)/);
  if (!match) {
    return undefined;
  }
  const version = match[1];
  return { version, major: version.split(".")[0] };
}

async function runCommandCapture(command: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32"
    });
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("exit", (code) => resolve(code === 0 ? out.trim() : undefined));
    child.on("error", () => resolve(undefined));
  });
}

async function detectChromeFromExecutable(exePath: string): Promise<LocalBrowserInfo | undefined> {
  if (!(await fileExists(exePath))) {
    return undefined;
  }
  if (process.platform === "win32") {
    const version = await readWindowsFileVersion(exePath);
    if (!version) {
      return undefined;
    }
    const parsed = parseBrowserVersionString(version);
    if (!parsed) {
      return undefined;
    }
    return { path: exePath, version: parsed.version, major: parsed.major };
  }
  const out = await runCommandCapture(exePath, ["--version"]);
  if (!out) {
    return undefined;
  }
  const parsed = parseBrowserVersionString(out);
  if (!parsed) {
    return undefined;
  }
  return { path: exePath, version: parsed.version, major: parsed.major };
}

async function detectFirefoxFromExecutable(exePath: string): Promise<LocalBrowserInfo | undefined> {
  if (!(await fileExists(exePath))) {
    return undefined;
  }
  if (process.platform === "win32") {
    const version = await readWindowsFileVersion(exePath);
    if (!version) {
      return undefined;
    }
    const parsed = parseBrowserVersionString(version);
    if (!parsed) {
      return undefined;
    }
    return { path: exePath, version: parsed.version, major: parsed.major };
  }
  const out = await runCommandCapture(exePath, ["--version"]);
  if (!out) {
    return undefined;
  }
  const parsed = parseBrowserVersionString(out);
  if (!parsed) {
    return undefined;
  }
  return { path: exePath, version: parsed.version, major: parsed.major };
}

/** 检测本机已安装的 Chrome/Chromium 与 Firefox（多平台常见路径） */
export async function detectLocalBrowsers(): Promise<LocalBrowserDetection> {
  const result: LocalBrowserDetection = {};

  if (process.platform === "win32") {
    const chromeCandidates = [
      path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(
        process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
      path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Chromium", "Application", "chrome.exe")
    ];
    for (const p of chromeCandidates) {
      const hit = await detectChromeFromExecutable(p);
      if (hit) {
        result.chrome = hit;
        break;
      }
    }
    const firefoxCandidates = [
      path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Mozilla Firefox", "firefox.exe"),
      path.join(
        process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
        "Mozilla Firefox",
        "firefox.exe"
      )
    ];
    for (const p of firefoxCandidates) {
      const hit = await detectFirefoxFromExecutable(p);
      if (hit) {
        result.firefox = hit;
        break;
      }
    }
    return result;
  }

  if (process.platform === "darwin") {
    const chromePaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ];
    for (const p of chromePaths) {
      const hit = await detectChromeFromExecutable(p);
      if (hit) {
        result.chrome = hit;
        break;
      }
    }
    const firefoxPath = "/Applications/Firefox.app/Contents/MacOS/firefox";
    const ff = await detectFirefoxFromExecutable(firefoxPath);
    if (ff) {
      result.firefox = ff;
    }
    return result;
  }

  const chromeCommands = ["google-chrome-stable", "google-chrome", "chromium-browser", "chromium"];
  for (const cmd of chromeCommands) {
    if (!(await commandOnPath(cmd))) {
      continue;
    }
    const out = await runCommandCapture(cmd, ["--version"]);
    const parsed = out ? parseBrowserVersionString(out) : undefined;
    if (parsed) {
      result.chrome = { path: cmd, version: parsed.version, major: parsed.major };
      break;
    }
  }

  if (await commandOnPath("firefox")) {
    const out = await runCommandCapture("firefox", ["--version"]);
    const parsed = out ? parseBrowserVersionString(out) : undefined;
    if (parsed) {
      result.firefox = { path: "firefox", version: parsed.version, major: parsed.major };
    }
  }

  return result;
}

export function logSeleniumDriverGuidance(onLogLine?: (line: string) => void): void {
  onLogLine?.(
    "[selenium] \u5c06\u68c0\u6d4b\u672c\u673a Chrome/Firefox \u5e76\u5c1d\u8bd5\u4e0b\u8f7d\u9a71\u52a8\u81f3\u76ee\u5f55\uff1b\u5931\u8d25\u53ef\u624b\u52a8\u653e\u5165 geckodriver/chromedriver\uff08\u89c1\u63a5\u5165\u624b\u518c Selenium \u8282\uff09"
  );
}

async function detectInstalledChromeMajorVersion(): Promise<string | undefined> {
  const browsers = await detectLocalBrowsers();
  return browsers.chrome?.major;
}

async function readWindowsFileVersion(exePath: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const escaped = exePath.replace(/'/g, "''");
    const child = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-Item -LiteralPath '${escaped}').VersionInfo.ProductVersion`
      ],
      { shell: true, stdio: ["ignore", "pipe", "ignore"] }
    );
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("exit", () => {
      const v = out.trim().split(/\s+/)[0];
      resolve(v || undefined);
    });
    child.on("error", () => resolve(undefined));
  });
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed ${url}: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
}

export async function downloadGeckodriver(
  driversDir: string,
  versionInput?: string,
  onLogLine?: (line: string) => void,
  options?: { force?: boolean }
): Promise<{ path: string; version: string }> {
  const tag = await fetchGeckodriverReleaseVersion(versionInput);
  const version = tag.replace(/^v/, "");
  const dest = path.join(driversDir, geckodriverExeName());
  if (!options?.force && (await fileExists(dest))) {
    onLogLine?.(`[selenium] 已存在 ${geckodriverExeName()}，跳过下载`);
    return { path: dest, version: tag };
  }
  const mirrorBase = await detectBestGeckodriverMirrorBase(tag, onLogLine);
  const { mirror, github, fileName, archiveKind } = buildGeckodriverDownloadUrls(tag, mirrorBase);
  const manualArchive = path.join(driversDir, fileName);
  if (!options?.force && (await fileExists(manualArchive))) {
    onLogLine?.(`[selenium] 已存在归档 ${fileName}，跳过重复下载`);
    const extractDir = path.join(driversDir, `_extract_geckodriver_${version}`);
    await fs.rm(extractDir, { recursive: true, force: true });
    await extractDriverArchive(manualArchive, extractDir, archiveKind);
    const found = await findFileRecursive(extractDir, geckodriverExeName());
    if (found) {
      await copyExecutable(found, dest);
      await fs.rm(extractDir, { recursive: true, force: true });
      onLogLine?.(`[selenium] geckodriver 已从本地归档解压: ${dest}`);
      return { path: dest, version: tag };
    }
  }
  await fs.mkdir(driversDir, { recursive: true });
  const archiveExt = archiveKind === "zip" ? "zip" : "tar.gz";
  const archivePath = path.join(driversDir, `_download_geckodriver_${version}.${archiveExt}`);
  const extractDir = path.join(driversDir, `_extract_geckodriver_${version}`);
  onLogLine?.(`[selenium] 下载 geckodriver ${tag}（${fileName}）→ ${driversDir}`);
  onLogLine?.(`[selenium] 镜像: ${mirror}`);
  let downloaded = false;
  try {
    await downloadToFile(mirror, archivePath);
    downloaded = true;
  } catch (mirrorError) {
    onLogLine?.(
      `[selenium][warn] 镜像下载失败: ${mirrorError instanceof Error ? mirrorError.message : String(mirrorError)}`
    );
    onLogLine?.(`[selenium] 回退 GitHub: ${github}`);
    await downloadToFile(github, archivePath);
    downloaded = true;
  }
  if (!downloaded) {
    throw new Error(`geckodriver download failed for ${tag}`);
  }
  await fs.rm(extractDir, { recursive: true, force: true });
  await extractDriverArchive(archivePath, extractDir, archiveKind);
  const found = await findFileRecursive(extractDir, geckodriverExeName());
  if (!found) {
    throw new Error(`geckodriver binary not found after extracting ${fileName}`);
  }
  const destPath = path.join(driversDir, geckodriverExeName());
  await copyExecutable(found, destPath);
  await fs.rm(archivePath, { force: true });
  await fs.rm(extractDir, { recursive: true, force: true });
  onLogLine?.(`[selenium] geckodriver 已写入: ${destPath}`);
  return { path: destPath, version: tag };
}

export async function downloadChromedriver(
  driversDir: string,
  versionInput?: string,
  onLogLine?: (line: string) => void,
  options?: { force?: boolean }
): Promise<{ path: string; version: string; major: string }> {
  const fullVersion = await resolveChromedriverCfTVersion(versionInput);
  const major = fullVersion.split(".")[0];
  const destVersioned = path.join(driversDir, chromedriverExeName(major));
  if (!options?.force && (await fileExists(destVersioned))) {
    onLogLine?.(`[selenium] 已存在 ${chromedriverExeName(major)}，跳过下载`);
    return { path: destVersioned, version: fullVersion, major };
  }
  const platform = platformChromeLabel();
  const res = await fetch(CHROME_FOR_TESTING_JSON);
  if (!res.ok) {
    throw new Error(`Failed to fetch chrome-for-testing JSON: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    versions?: Array<{
      version: string;
      downloads?: { chromedriver?: Array<{ platform: string; url: string }> };
    }>;
  };
  const entry = json.versions?.find((v) => v.version === fullVersion);
  const url = entry?.downloads?.chromedriver?.find((d) => d.platform === platform)?.url;
  if (!url) {
    throw new Error(`No chromedriver download for version ${fullVersion} platform ${platform}`);
  }
  await fs.mkdir(driversDir, { recursive: true });
  const zipPath = path.join(driversDir, `_download_chromedriver_${major}.zip`);
  const extractDir = path.join(driversDir, `_extract_chromedriver_${major}`);
  onLogLine?.(`[selenium] \u4e0b\u8f7d chromedriver ${fullVersion} (\u4e3b\u7248\u672c ${major}) \u2192 ${driversDir}`);
  onLogLine?.(`[selenium] URL: ${url}`);
  await downloadToFile(url, zipPath);
  await fs.rm(extractDir, { recursive: true, force: true });
  await extractZip(zipPath, extractDir);
  const found = await findFileRecursive(extractDir, chromedriverExeName());
  if (!found) {
    throw new Error(`chromedriver binary not found after extracting ${fullVersion}`);
  }
  await copyExecutable(found, destVersioned);
  if (versionInput === "latest" || !versionInput) {
    const destGeneric = path.join(driversDir, chromedriverExeName());
    await copyExecutable(found, destGeneric);
  }
  await fs.rm(zipPath, { force: true });
  await fs.rm(extractDir, { recursive: true, force: true });
  onLogLine?.(`[selenium] chromedriver \u5df2\u5199\u5165: ${destVersioned}`);
  return { path: destVersioned, version: fullVersion, major };
}

export async function saveNativeDriverManifest(manifest: NativeDriverManifest, workspaceRoot?: string): Promise<void> {
  const root = workspaceRoot ?? (await resolveWorkspaceRoot());
  const dir = path.join(root, ".ada-agent");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "native-drivers.json");
  await fs.writeFile(file, JSON.stringify(manifest, null, 2), "utf8");
}

export async function loadNativeDriverManifest(workspaceRoot?: string): Promise<NativeDriverManifest | null> {
  const root = workspaceRoot ?? (await resolveWorkspaceRoot());
  const file = path.join(root, ".ada-agent", "native-drivers.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as NativeDriverManifest;
  } catch {
    return null;
  }
}

function resolveDefaultChromedriverVersion(
  requested: string | undefined,
  browsers: LocalBrowserDetection
): string | undefined {
  if (requested && requested !== "latest") {
    return requested;
  }
  if (browsers.chrome?.major) {
    return "match-chrome";
  }
  return requested ?? "latest";
}

function formatDownloadError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function ensureNativeWebDrivers(options: DownloadNativeDriversOptions = {}): Promise<ResolvedNativeDrivers> {
  const root = options.workspaceRoot ?? (await resolveWorkspaceRoot());
  const driversDir = options.driversDir ?? (await resolveNativeDriversDir(root));
  await fs.mkdir(driversDir, { recursive: true });
  const log = options.onLogLine;

  logSeleniumDriverGuidance(log);
  log?.(`[selenium] \u539f\u751f\u9a71\u52a8\u76ee\u5f55: ${driversDir}`);

  const browsers = await detectLocalBrowsers();
  if (browsers.chrome) {
    log?.(
      `[selenium] \u68c0\u6d4b\u5230\u672c\u673a Chrome/Chromium: ${browsers.chrome.version} (\u4e3b\u7248\u672c ${browsers.chrome.major}) \u2014 ${browsers.chrome.path}`
    );
  } else {
    log?.("[selenium] \u672a\u68c0\u6d4b\u5230\u672c\u673a Chrome/Chromium\uff08chromedriver \u5c06\u4f7f\u7528 latest \u6216\u663e\u5f0f\u6307\u5b9a\u7248\u672c\uff09");
  }
  if (browsers.firefox) {
    log?.(
      `[selenium] \u68c0\u6d4b\u5230\u672c\u673a Firefox: ${browsers.firefox.version} (\u4e3b\u7248\u672c ${browsers.firefox.major}) \u2014 ${browsers.firefox.path}`
    );
  } else {
    log?.("[selenium] \u672a\u68c0\u6d4b\u5230\u672c\u673a Firefox\uff08geckodriver \u5c06\u4f7f\u7528 latest \u6216\u663e\u5f0f\u6307\u5b9a\u7248\u672c\uff09");
  }

  const localChromeVersions = await listLocalChromedriverVersions(driversDir);
  if (localChromeVersions.length > 0) {
    log?.(`[selenium] \u76ee\u5f55\u5185\u5df2\u6709 chromedriver \u7248\u672c: ${localChromeVersions.join(", ")}`);
  }

  const chromedriverRequest = resolveDefaultChromedriverVersion(options.chromedriverVersion, browsers);
  if (chromedriverRequest === "match-chrome" && browsers.chrome) {
    log?.(
      `[selenium] chromedriver \u5c06\u5c1d\u8bd5\u5339\u914d\u672c\u673a Chrome \u4e3b\u7248\u672c ${browsers.chrome.major}\uff08chrome-for-testing \u76ee\u5f55\uff09`
    );
  }

  const expectedGeckoPath = path.join(driversDir, geckodriverExeName());
  const hasExpectedGecko = await fileExists(expectedGeckoPath);
  const localGecko = hasExpectedGecko ? expectedGeckoPath : await findGeckodriverInDir(driversDir, options.geckodriverVersion);
  const hasLocalGecko = Boolean(localGecko && (await fileExists(localGecko)));
  let geckoVersion = options.geckodriverVersion;
  if (options.geckodriverVersion !== "skip" && (options.force || !hasExpectedGecko)) {
    try {
      const downloaded = await downloadGeckodriver(
        driversDir,
        options.geckodriverVersion ?? "latest",
        log,
        { force: options.force }
      );
      geckoVersion = downloaded.version;
    } catch (error) {
      log?.(`[selenium][warn] geckodriver \u81ea\u52a8\u4e0b\u8f7d\u5931\u8d25\uff0c\u5df2\u8df3\u8fc7: ${formatDownloadError(error)}`);
      log?.(
        "[selenium][warn] \u8bf7\u5c06 geckodriver \u653e\u5165\u4e0a\u8ff0\u76ee\u5f55\u6216\u914d\u7f6e PATH / ADA_GECKODRIVER_PATH\uff1b\u53ef\u53c2\u8003 Mozilla \u53d1\u5e03\u9875\u624b\u52a8\u4e0b\u8f7d\u3002"
      );
    }
  } else if (hasLocalGecko) {
    log?.(`[selenium] \u590d\u7528\u5df2\u6709 geckodriver: ${localGecko}`);
  }

  const localChrome = await findChromedriverInDir(driversDir, chromedriverRequest);
  const chromeMajor =
    chromedriverRequest === "match-chrome" && browsers.chrome
      ? browsers.chrome.major
      : chromedriverRequest && chromedriverRequest !== "latest"
        ? chromedriverRequest.replace(/^v/i, "").split(".")[0]
        : localChrome?.version !== "generic"
          ? localChrome?.version
          : undefined;
  const expectedChromePath = chromeMajor
    ? path.join(driversDir, chromedriverExeName(chromeMajor))
    : path.join(driversDir, chromedriverExeName());
  const hasExpectedChrome = await fileExists(expectedChromePath);
  const hasLocalChrome = hasExpectedChrome || Boolean(localChrome && (await fileExists(localChrome.path)));
  if (chromedriverRequest !== "skip" && (options.force || !hasExpectedChrome)) {
    try {
      await downloadChromedriver(driversDir, chromedriverRequest ?? "latest", log, { force: options.force });
    } catch (error) {
      log?.(`[selenium][warn] chromedriver \u81ea\u52a8\u4e0b\u8f7d\u5931\u8d25\uff0c\u5df2\u8df3\u8fc7: ${formatDownloadError(error)}`);
      if (browsers.chrome) {
        log?.(
          `[selenium][warn] \u672c\u673a Chrome \u4e3b\u7248\u672c\u4e3a ${browsers.chrome.major}\uff0c\u8bf7\u4e0b\u8f7d\u5339\u914d\u7248\u672c\u7684 chromedriver \u653e\u5165\u76ee\u5f55\u6216\u914d\u7f6e ADA_CHROMEDRIVER_PATH\u3002`
        );
      }
      log?.(
        "[selenium][warn] \u53ef\u53c2\u8003 chrome-for-testing / chromedriver.storage \u624b\u52a8\u4e0b\u8f7d\uff1b\u5df2\u653e\u5165 dirver/ \u7684\u9a71\u52a8\u4f1a\u5728\u4e0b\u6b21\u542f\u52a8\u65f6\u81ea\u52a8\u590d\u7528\u3002"
      );
    }
  } else if (hasLocalChrome) {
    log?.(`[selenium] \u590d\u7528\u5df2\u6709 chromedriver: ${localChrome!.path} (\u4e3b\u7248\u672c ${localChrome!.version})`);
  }

  const resolved = await resolveNativeDrivers({
    driversDir,
    workspaceRoot: root,
    selection: {
      geckodriverVersion: geckoVersion,
      chromedriverVersion: chromedriverRequest ?? localChrome?.version
    }
  });

  await saveNativeDriverManifest(
    {
      driversDir,
      updatedAt: new Date().toISOString(),
      geckodriver: resolved.geckodriverPath
        ? { version: geckoVersion ?? "unknown", path: resolved.geckodriverPath }
        : undefined,
      chromedriver: resolved.chromedriverPath
        ? { version: resolved.chromedriverVersion ?? "unknown", path: resolved.chromedriverPath }
        : undefined
    },
    root
  );

  if (resolved.geckodriverPath) {
    process.env.ADA_GECKODRIVER_PATH = resolved.geckodriverPath;
    log?.(`[selenium] \u4f7f\u7528 geckodriver: ${resolved.geckodriverPath}`);
  } else if (options.geckodriverVersion !== "skip") {
    log?.("[selenium][warn] \u672a\u627e\u5230\u53ef\u7528 geckodriver\uff08\u81ea\u52a8\u4e0b\u8f7d\u5df2\u8df3\u8fc7\u6216\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u5b89\u88c5\uff09");
  }
  if (resolved.chromedriverPath) {
    process.env.ADA_CHROMEDRIVER_PATH = resolved.chromedriverPath;
    log?.(`[selenium] \u4f7f\u7528 chromedriver: ${resolved.chromedriverPath}`);
  } else if (chromedriverRequest !== "skip") {
    log?.("[selenium][warn] \u672a\u627e\u5230\u53ef\u7528 chromedriver\uff08\u81ea\u52a8\u4e0b\u8f7d\u5df2\u8df3\u8fc7\u6216\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u5b89\u88c5\uff09");
  }

  if (!resolved.geckodriverOk && !resolved.chromedriverOk) {
    log?.("[selenium][warn] \u5f53\u524d\u65e0\u53ef\u7528\u539f\u751f WebDriver\uff1bSelenium \u4efb\u52a1\u53ef\u80fd\u5931\u8d25\uff0c\u8bf7\u6309\u4e0a\u6587\u53c2\u8003\u5730\u5740\u81ea\u884c\u4e0b\u8f7d\u3002");
  }

  return resolved;
}
