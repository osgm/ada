import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/** 项目内默认原生驱动目录（与用户现�?`dirver` 文件夹一致） */
export const DEFAULT_NATIVE_DRIVERS_DIR = "dirver";

const CHROME_FOR_TESTING_JSON =
  "https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json";

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

/** 解析原生 WebDriver 存放目录（优�?ADA_DRIVERS_DIR，其�?dirver/driver/drivers�?*/
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

function platformArchiveSuffix(): string {
  if (process.platform === "win32") {
    return "win64.zip";
  }
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "macos-aarch64.zip" : "macos.zip";
  }
  return "linux64.zip";
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

/** 扫描 dirver 目录中已存在�?chromedriver 主版本号（如 chromedriver137.exe �?137�?*/
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
  const res = await fetch("https://api.github.com/repos/mozilla/geckodriver/releases/latest");
  if (!res.ok) {
    throw new Error(`Failed to fetch geckodriver latest release: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { tag_name?: string };
  const tag = json.tag_name ?? "v0.36.0";
  return tag.startsWith("v") ? tag : `v${tag}`;
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

async function detectInstalledChromeMajorVersion(): Promise<string | undefined> {
  if (process.platform !== "win32") {
    return undefined;
  }
  const candidates = [
    path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(
      process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe"
    )
  ];
  for (const chromePath of candidates) {
    if (!(await fileExists(chromePath))) {
      continue;
    }
    const version = await readWindowsFileVersion(chromePath);
    if (version) {
      return version.split(".")[0];
    }
  }
  return undefined;
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
  onLogLine?: (line: string) => void
): Promise<{ path: string; version: string }> {
  const tag = await fetchGeckodriverReleaseVersion(versionInput);
  const version = tag.replace(/^v/, "");
  const suffix = platformArchiveSuffix();
  const assetName = `geckodriver-${tag}-${suffix}`.replace("vv", "v");
  const url = `https://github.com/mozilla/geckodriver/releases/download/${tag}/geckodriver-${tag}-${suffix}`;
  await fs.mkdir(driversDir, { recursive: true });
  const zipPath = path.join(driversDir, `_download_geckodriver_${version}.zip`);
  const extractDir = path.join(driversDir, `_extract_geckodriver_${version}`);
  onLogLine?.(`[selenium] 下载 geckodriver ${tag} �?${driversDir}`);
  onLogLine?.(`[selenium] URL: ${url}`);
  await downloadToFile(url, zipPath);
  await fs.rm(extractDir, { recursive: true, force: true });
  await extractZip(zipPath, extractDir);
  const found = await findFileRecursive(extractDir, geckodriverExeName());
  if (!found) {
    throw new Error(`geckodriver binary not found after extracting ${assetName}`);
  }
  const dest = path.join(driversDir, geckodriverExeName());
  await copyExecutable(found, dest);
  await fs.rm(zipPath, { force: true });
  await fs.rm(extractDir, { recursive: true, force: true });
  onLogLine?.(`[selenium] geckodriver 已写�? ${dest}`);
  return { path: dest, version: tag };
}

export async function downloadChromedriver(
  driversDir: string,
  versionInput?: string,
  onLogLine?: (line: string) => void
): Promise<{ path: string; version: string; major: string }> {
  const fullVersion = await resolveChromedriverCfTVersion(versionInput);
  const major = fullVersion.split(".")[0];
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
  onLogLine?.(`[selenium] 下载 chromedriver ${fullVersion} (主版�?${major}) �?${driversDir}`);
  onLogLine?.(`[selenium] URL: ${url}`);
  await downloadToFile(url, zipPath);
  await fs.rm(extractDir, { recursive: true, force: true });
  await extractZip(zipPath, extractDir);
  const found = await findFileRecursive(extractDir, chromedriverExeName());
  if (!found) {
    throw new Error(`chromedriver binary not found after extracting ${fullVersion}`);
  }
  const destVersioned = path.join(driversDir, chromedriverExeName(major));
  await copyExecutable(found, destVersioned);
  if (versionInput === "latest" || !versionInput) {
    const destGeneric = path.join(driversDir, chromedriverExeName());
    await copyExecutable(found, destGeneric);
  }
  await fs.rm(zipPath, { force: true });
  await fs.rm(extractDir, { recursive: true, force: true });
  onLogLine?.(`[selenium] chromedriver 已写�? ${destVersioned}`);
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

export async function ensureNativeWebDrivers(options: DownloadNativeDriversOptions = {}): Promise<ResolvedNativeDrivers> {
  const root = options.workspaceRoot ?? (await resolveWorkspaceRoot());
  const driversDir = options.driversDir ?? (await resolveNativeDriversDir(root));
  await fs.mkdir(driversDir, { recursive: true });
  const log = options.onLogLine;
  log?.(`[selenium] 原生驱动目录: ${driversDir}`);

  const localChromeVersions = await listLocalChromedriverVersions(driversDir);
  if (localChromeVersions.length > 0) {
    log?.(`[selenium] 目录内已�?chromedriver 版本: ${localChromeVersions.join(", ")}`);
  }

  const localGecko = await findGeckodriverInDir(driversDir, options.geckodriverVersion);
  const hasLocalGecko = Boolean(localGecko && (await fileExists(localGecko)));
  let geckoVersion = options.geckodriverVersion;
  if (options.geckodriverVersion !== "skip" && (options.force || !hasLocalGecko)) {
    const downloaded = await downloadGeckodriver(driversDir, options.geckodriverVersion ?? "latest", log);
    geckoVersion = downloaded.version;
  } else if (hasLocalGecko) {
    log?.(`[selenium] 复用已有 geckodriver: ${localGecko}`);
  }

  const localChrome = await findChromedriverInDir(driversDir, options.chromedriverVersion);
  const hasLocalChrome = Boolean(localChrome && (await fileExists(localChrome.path)));
  if (options.chromedriverVersion !== "skip" && (options.force || !hasLocalChrome)) {
    await downloadChromedriver(driversDir, options.chromedriverVersion ?? "latest", log);
  } else if (hasLocalChrome) {
    log?.(`[selenium] 复用已有 chromedriver: ${localChrome!.path} (主版�?${localChrome!.version})`);
  }

  const resolved = await resolveNativeDrivers({
    driversDir,
    workspaceRoot: root,
    selection: {
      geckodriverVersion: geckoVersion,
      chromedriverVersion: options.chromedriverVersion ?? localChrome?.version
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
    log?.(`[selenium] 使用 geckodriver: ${resolved.geckodriverPath}`);
  }
  if (resolved.chromedriverPath) {
    process.env.ADA_CHROMEDRIVER_PATH = resolved.chromedriverPath;
    log?.(`[selenium] 使用 chromedriver: ${resolved.chromedriverPath}`);
  }

  return resolved;
}
