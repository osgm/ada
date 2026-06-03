import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import type { InstallDepsConfig } from "./types.js";
import type { DriverInstallOutcome } from "./install-summary.js";
import { resolveDefaultToolsDir } from "./tools-paths.js";

function hdcBinaryName(): string {
  return process.platform === "win32" ? "hdc.exe" : "hdc";
}

function shouldUseShell(command: string): boolean {
  return process.platform === "win32" && !path.isAbsolute(command) && !command.includes(path.sep);
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
  const first = result.stdout
    .split(/\r?\n/)
    .map((x) => x.trim())
    .find(Boolean);
  return first ?? null;
}

export function parseHarmonyHdcDownloadUrls(config?: InstallDepsConfig): string[] {
  const byEnv = (
    process.env.ADA_HARMONY_HDC_DOWNLOAD_URLS ??
    process.env.ADA_HARMONY_HDC_DOWNLOAD_URL ??
    ""
  )
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const byConfig = Array.isArray(config?.dependencies?.harmonyHdcDownloadUrls)
    ? config.dependencies.harmonyHdcDownloadUrls.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...byEnv, ...byConfig]));
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
      return pathExists(hdcPath);
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

/** 确保 tools 目录含 hdc（从 PATH 复制或按配置 URL 下载） */
export async function ensureHarmonyHdcInToolsDir(
  toolsDir: string,
  config: InstallDepsConfig,
  onLogLine?: (line: string) => void
): Promise<DriverInstallOutcome> {
  const hdcPath = path.join(toolsDir, hdcBinaryName());
  if (await pathExists(hdcPath)) {
    return { id: "harmony-hdc", status: "skipped", detail: hdcPath };
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
        return { id: "harmony-hdc", status: "installed", detail: "from PATH" };
      }
    } catch (error) {
      onLogLine?.(`[harmony][warn] 从 PATH 复制 hdc 失败: ${briefErrorMessage(error)}`);
    }
  }

  const urls = parseHarmonyHdcDownloadUrls(config);
  if (urls.length === 0) {
    onLogLine?.(
      "[harmony][warn] 未配置 hdc 下载地址（ADA_HARMONY_HDC_DOWNLOAD_URLS / dependencies.harmonyHdcDownloadUrls），请手动放置 hdc 到 tools/ 或设置 ADA_TOOLS_DIR"
    );
    return { id: "harmony-hdc", status: "missing", detail: "no download URL configured" };
  }
  for (const url of urls) {
    if (await tryDownloadHarmonyHdcFromUrl(url, toolsDir, onLogLine)) {
      return { id: "harmony-hdc", status: "installed", detail: hdcPath };
    }
  }
  onLogLine?.(
    `[harmony][warn] 自动下载 hdc 未成功。请手动下载并放入 ${hdcPath}（或设置 ADA_TOOLS_DIR 指向已含 hdc 的目录）`
  );
  return { id: "harmony-hdc", status: "missing", detail: hdcPath };
}

/** 解析默认 tools 目录并确保 hdc 存在 */
export async function ensureHarmonyHdcForConfig(
  config: InstallDepsConfig,
  onLogLine?: (line: string) => void
): Promise<{ toolsDir: string | null; outcome: DriverInstallOutcome }> {
  const relativeDir = config.dependencies?.toolsDir?.trim() || "tools";
  const toolsDir = await resolveDefaultToolsDir({ relativeDir });
  if (!toolsDir) {
    onLogLine?.("[harmony][warn] 无法解析 tools 目录");
    return {
      toolsDir: null,
      outcome: { id: "harmony-hdc", status: "missing", detail: "tools dir unresolved" }
    };
  }
  const outcome = await ensureHarmonyHdcInToolsDir(toolsDir, config, onLogLine);
  return { toolsDir, outcome };
}
