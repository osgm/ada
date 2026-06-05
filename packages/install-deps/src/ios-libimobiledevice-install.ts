import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import type { InstallDepsConfig } from "./types.js";
import type { DriverInstallOutcome } from "./install-summary.js";
import {
  resolveDefaultToolsDir,
  resolveLibimobiledeviceExecutable,
  resolveLibimobiledeviceToolsDir,
  resolveSafeToolsDirForWrite,
  LIBIMOBILEDEVICE_SUBDIR
} from "./tools-paths.js";

export { LIBIMOBILEDEVICE_SUBDIR } from "./tools-paths.js";

export const DEFAULT_IOS_LIBIMOBILEDEVICE_WIN_X64_URL =
  "https://github.com/libimobiledevice-win32/imobiledevice-net/releases/download/v1.3.17/libimobiledevice.1.2.1-r1122-win-x64.zip";

function ideviceBinaryName(base: string): string {
  return process.platform === "win32" ? `${base}.exe` : base;
}

function shouldUseShell(command: string): boolean {
  return process.platform === "win32" && !path.isAbsolute(command) && !command.includes(path.sep);
}

function iosLibimobiledeviceDownloadDisabled(): boolean {
  return ["0", "false", "no"].includes(
    (process.env.ADA_IOS_LIBIMOBILEDEVICE_DOWNLOAD ?? "").trim().toLowerCase()
  );
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function briefErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.split(/\r?\n/)[0] ?? error.message;
  }
  return String(error);
}

async function runCommand(command: string, args: string[], options?: { cwd?: string }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      stdio: "ignore",
      shell: shouldUseShell(command),
      env: process.env,
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exit=${code}`))));
    child.on("error", reject);
  });
}

function runCommandCapture(command: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: shouldUseShell(command),
      env: process.env,
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout: stdout.trim() }));
    child.on("error", () => resolve({ code: 1, stdout: "" }));
  });
}

async function locateCommandPath(command: string): Promise<string | null> {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = await runCommandCapture(checker, [command]);
  if (result.code !== 0) {
    return null;
  }
  return (
    result.stdout
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find(Boolean) ?? null
  );
}

export function parseIosLibimobiledeviceDownloadUrls(config?: InstallDepsConfig): string[] {
  const byEnv = (
    process.env.ADA_IOS_LIBIMOBILEDEVICE_DOWNLOAD_URLS ??
    process.env.ADA_IOS_LIBIMOBILEDEVICE_DOWNLOAD_URL ??
    ""
  )
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const byConfig = Array.isArray(config?.dependencies?.iosLibimobiledeviceDownloadUrls)
    ? config.dependencies.iosLibimobiledeviceDownloadUrls.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const defaults =
    process.platform === "win32" && process.arch === "x64" ? [DEFAULT_IOS_LIBIMOBILEDEVICE_WIN_X64_URL] : [];
  return Array.from(new Set([...byEnv, ...byConfig, ...defaults]));
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
    // keep original
  }
  return url;
}

function isZipDownloadUrl(url: string): boolean {
  try {
    return /\.zip$/i.test(new URL(url).pathname);
  } catch {
    return /\.zip(?:\?|$)/i.test(url);
  }
}

async function downloadFileWithTimeout(
  url: string,
  outputPath: string,
  timeoutMs = 180_000
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

export async function isLibimobiledeviceToolsReady(toolsDir: string): Promise<boolean> {
  const iproxy = resolveLibimobiledeviceExecutable(toolsDir, "iproxy");
  const ideviceId = resolveLibimobiledeviceExecutable(toolsDir, "idevice_id");
  return (await pathExists(iproxy)) && (await pathExists(ideviceId));
}

async function copyToolBundle(sourceDir: string, destDir: string): Promise<number> {
  await fs.mkdir(destDir, { recursive: true });
  let copied = 0;
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile()) {
      continue;
    }
    await fs.copyFile(path.join(sourceDir, ent.name), path.join(destDir, ent.name));
    copied += 1;
  }
  return copied;
}

async function tryDownloadLibimobiledeviceFromUrl(
  url: string,
  toolsDir: string,
  onLogLine?: (line: string) => void
): Promise<boolean> {
  const destDir = resolveLibimobiledeviceToolsDir(toolsDir);
  const iproxyName = ideviceBinaryName("iproxy");
  const resolvedUrl = normalizeDownloadUrl(url);
  onLogLine?.(`[ios-idevice] trying libimobiledevice download: ${resolvedUrl}`);

  if (!isZipDownloadUrl(resolvedUrl)) {
    onLogLine?.("[ios-idevice][warn] libimobiledevice download URL must be a .zip archive");
    return false;
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ada-ios-libimobiledevice-"));
  const zipPath = path.join(tmpRoot, "libimobiledevice.zip");
  const extractDir = path.join(tmpRoot, "extract");
  try {
    const fetched = await downloadFileWithTimeout(resolvedUrl, zipPath);
    if (!fetched.ok) {
      onLogLine?.(`[ios-idevice][warn] ZIP download failed: ${fetched.error}`);
      return false;
    }
    onLogLine?.(`[ios-idevice] ZIP downloaded (${fetched.bytes} bytes), extracting…`);
    await extractZipArchive(zipPath, extractDir);
    const foundIproxy = await findFileRecursive(extractDir, iproxyName);
    if (!foundIproxy) {
      onLogLine?.(`[ios-idevice][warn] ${iproxyName} not found inside ZIP`);
      return false;
    }
    const copied = await copyToolBundle(path.dirname(foundIproxy), destDir);
    onLogLine?.(`[ios-idevice] installed libimobiledevice tools (${copied} files) -> ${destDir}`);
    return isLibimobiledeviceToolsReady(toolsDir);
  } catch (error) {
    onLogLine?.(`[ios-idevice][warn] libimobiledevice install failed: ${briefErrorMessage(error)}`);
    return false;
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Windows：确保 tools/libimobiledevice 含 iproxy + idevice_id（PATH 复制或 ZIP 下载） */
export async function ensureIosLibimobiledeviceInToolsDir(
  toolsDir: string,
  config: InstallDepsConfig,
  onLogLine?: (line: string) => void,
  options?: { force?: boolean }
): Promise<DriverInstallOutcome> {
  if (process.platform !== "win32") {
    return { id: "ios-idevice", status: "skipped", detail: "libimobiledevice auto-install is Windows-only" };
  }

  const relativeDir = config.dependencies?.toolsDir?.trim() || "tools";
  const safeToolsDir = resolveSafeToolsDirForWrite(toolsDir, relativeDir);
  if (safeToolsDir !== path.resolve(toolsDir)) {
    onLogLine?.(`[ios-idevice][warn] tools dir ${toolsDir} not writable, using ${safeToolsDir}`);
  }

  const destDir = resolveLibimobiledeviceToolsDir(safeToolsDir);
  if (!options?.force && (await isLibimobiledeviceToolsReady(safeToolsDir))) {
    process.env.ADA_LIBIMOBILEDEVICE_DIR = destDir;
    return { id: "ios-idevice", status: "skipped", detail: destDir };
  }

  await fs.mkdir(destDir, { recursive: true });

  const fromIproxy = await locateCommandPath(ideviceBinaryName("iproxy"));
  if (fromIproxy && (await pathExists(fromIproxy))) {
    try {
      const copied = await copyToolBundle(path.dirname(fromIproxy), destDir);
      if (await isLibimobiledeviceToolsReady(safeToolsDir)) {
        process.env.ADA_LIBIMOBILEDEVICE_DIR = destDir;
        onLogLine?.(`[ios-idevice] copied libimobiledevice from PATH (${copied} files) -> ${destDir}`);
        return { id: "ios-idevice", status: "installed", detail: "from PATH" };
      }
    } catch (error) {
      onLogLine?.(`[ios-idevice][warn] copy from PATH failed: ${briefErrorMessage(error)}`);
    }
  }

  if (iosLibimobiledeviceDownloadDisabled()) {
    onLogLine?.(
      "[ios-idevice][warn] auto-download disabled (ADA_IOS_LIBIMOBILEDEVICE_DOWNLOAD=0); place iproxy.exe + idevice_id.exe under tools/libimobiledevice/"
    );
    return { id: "ios-idevice", status: "missing", detail: destDir };
  }

  const urls = parseIosLibimobiledeviceDownloadUrls(config);
  if (urls.length === 0) {
    onLogLine?.(
      "[ios-idevice][warn] no libimobiledevice download URL configured (ADA_IOS_LIBIMOBILEDEVICE_DOWNLOAD_URLS / dependencies.iosLibimobiledeviceDownloadUrls)"
    );
    return { id: "ios-idevice", status: "missing", detail: destDir };
  }

  for (const url of urls) {
    if (await tryDownloadLibimobiledeviceFromUrl(url, safeToolsDir, onLogLine)) {
      process.env.ADA_LIBIMOBILEDEVICE_DIR = destDir;
      return { id: "ios-idevice", status: "installed", detail: destDir };
    }
  }

  onLogLine?.(
    `[ios-idevice][warn] auto-download failed. Manually extract libimobiledevice-win32 into ${destDir} (needs Apple Mobile Device Support / iTunes USB driver)`
  );
  return { id: "ios-idevice", status: "missing", detail: destDir };
}

export async function ensureIosLibimobiledeviceForConfig(
  config: InstallDepsConfig,
  onLogLine?: (line: string) => void,
  options?: { force?: boolean }
): Promise<{ toolsDir: string | null; outcome: DriverInstallOutcome }> {
  const relativeDir = config.dependencies?.toolsDir?.trim() || "tools";
  const toolsDir = await resolveDefaultToolsDir({ relativeDir });
  if (!toolsDir) {
    onLogLine?.("[ios-idevice][warn] unable to resolve tools directory");
    return {
      toolsDir: null,
      outcome: { id: "ios-idevice", status: "missing", detail: "tools dir unresolved" }
    };
  }
  const outcome = await ensureIosLibimobiledeviceInToolsDir(toolsDir, config, onLogLine, options);
  return { toolsDir, outcome };
}
