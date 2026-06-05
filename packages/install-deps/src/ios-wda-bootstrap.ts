import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { DriverInstallOutcome } from "./install-summary.js";
import { resolveDefaultToolsDir } from "./tools-paths.js";
import {
  buildWdaXcodeDestination,
  defaultWdaServerUrl,
  ensureIosIproxyForward,
  probeIosWdaRuntime,
  probeWdaStatus,
  resolveIosDeviceUdid,
  wdaBootstrapEnabled
} from "@ada/runtime-probe";

const PINNED_WDA_REPO = "https://github.com/appium/WebDriverAgent.git";

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "ignore",
      shell: process.platform === "win32",
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exit=${code}`))));
    child.on("error", reject);
  });
}

async function resolveWdaProjectPath(toolsDir: string): Promise<string | null> {
  const envPath = process.env.ADA_WDA_PROJECT_PATH?.trim();
  if (envPath) {
    const project = envPath.endsWith(".xcodeproj") ? envPath : path.join(envPath, "WebDriverAgent.xcodeproj");
    if (await pathExists(project)) return project;
  }
  const candidate = path.join(toolsDir, "wda", "WebDriverAgent", "WebDriverAgent.xcodeproj");
  if (await pathExists(candidate)) return candidate;
  return null;
}

async function ensureWdaSources(
  toolsDir: string,
  onLogLine?: (line: string) => void,
  options?: { allowClone?: boolean }
): Promise<string> {
  const dir = path.join(toolsDir, "wda", "WebDriverAgent");
  const project = path.join(dir, "WebDriverAgent.xcodeproj");
  if (await pathExists(project)) return project;
  const cloneEnabled =
    options?.allowClone === true ||
    ["1", "true", "yes"].includes((process.env.ADA_IOS_WDA_CLONE ?? "").trim().toLowerCase());
  if (!cloneEnabled) {
    throw new Error(
      "WebDriverAgent project not found; set ADA_WDA_PROJECT_PATH or ADA_IOS_WDA_CLONE=true to clone into tools/wda"
    );
  }
  onLogLine?.(`[ios-wda] cloning ${PINNED_WDA_REPO}`);
  await fs.mkdir(path.dirname(dir), { recursive: true });
  await runCommand("git", ["clone", "--depth", "1", PINNED_WDA_REPO, dir]);
  if (!(await pathExists(project))) {
    throw new Error("WebDriverAgent clone completed but WebDriverAgent.xcodeproj missing");
  }
  return project;
}

function spawnXcodebuildWda(projectPath: string, destination: string, onLogLine?: (line: string) => void): void {
  const projectDir = path.dirname(projectPath);
  const args = [
    "-project",
    projectPath,
    "-scheme",
    process.env.ADA_WDA_XCODE_SCHEME?.trim() || "WebDriverAgentRunner",
    "-destination",
    destination,
    "-allowProvisioningUpdates",
    "test"
  ];
  onLogLine?.(`[ios-wda] xcodebuild ${args.join(" ")}`);
  const child = spawn("xcodebuild", args, {
    cwd: projectDir,
    stdio: "ignore",
    detached: true,
    shell: false
  });
  child.unref();
}

async function waitForWdaReady(serverUrl: string, timeoutMs: number, onLogLine?: (line: string) => void): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const probe = await probeWdaStatus(serverUrl);
    if (probe.reachable && probe.ready) {
      onLogLine?.(`[ios-wda] ready at ${serverUrl}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

export interface EnsureIosWdaOptions {
  force?: boolean;
  onLogLine?: (line: string) => void;
  /** install-deps scope=ios|all：自动 bootstrap，无需 ADA_IOS_WDA_BOOTSTRAP */
  scopeInstall?: boolean;
}

function wdaBootstrapAllowed(options?: EnsureIosWdaOptions): boolean {
  return wdaBootstrapEnabled() || options?.scopeInstall === true;
}

/** macOS：可选 xcodebuild 拉起 WDA（scope=ios|all 或 ADA_IOS_WDA_BOOTSTRAP=true） */
export async function ensureIosWdaBootstrap(options?: EnsureIosWdaOptions): Promise<{
  outcome: DriverInstallOutcome;
  wdaUrl: string;
}> {
  const onLogLine = options?.onLogLine;
  let wdaUrl = defaultWdaServerUrl();
  const artifact: DriverInstallOutcome = { id: "ios-wda", status: "skipped", detail: "bootstrap disabled" };

  if (process.platform !== "darwin") {
    artifact.detail = "iOS WDA bootstrap requires macOS host";
    artifact.status = "missing";
    return { outcome: artifact, wdaUrl };
  }

  const udid = await resolveIosDeviceUdid();
  const fwd = await ensureIosIproxyForward({ udid, onLogLine });
  if (fwd.serverUrl) {
    wdaUrl = fwd.serverUrl;
    process.env.ADA_WDA_SERVER_URL = wdaUrl;
  }

  const probe = await probeIosWdaRuntime({ udid, serverUrl: wdaUrl, ensureForward: false });
  if (!wdaBootstrapAllowed(options)) {
    artifact.detail = `bootstrap disabled (use --install-deps=ios|all or ADA_IOS_WDA_BOOTSTRAP=true); ${probe.detail}`;
    artifact.status = probe.ready ? "skipped" : "missing";
    return { outcome: artifact, wdaUrl };
  }

  if (probe.ready && !options?.force) {
    artifact.detail = probe.detail;
    return { outcome: artifact, wdaUrl };
  }

  try {
    const toolsDir = (await resolveDefaultToolsDir()) ?? path.join(process.cwd(), "tools");
    const projectPath = await ensureWdaSources(toolsDir, onLogLine, {
      allowClone: options?.scopeInstall === true
    });
    const destination = buildWdaXcodeDestination(udid);
    onLogLine?.(`[ios-wda] destination=${destination} udid=${udid || "(simulator)"}`);
    spawnXcodebuildWda(projectPath, destination, onLogLine);
    await ensureIosIproxyForward({ udid, localPort: fwd.localPort, devicePort: fwd.devicePort, onLogLine });
    process.env.ADA_WDA_SERVER_URL = wdaUrl;
    const ready = await waitForWdaReady(wdaUrl, 120_000, onLogLine);
    const after = await probeWdaStatus(wdaUrl);
    if (ready || after.ready) {
      artifact.status = "installed";
      artifact.detail = `WDA bootstrapped at ${wdaUrl}`;
    } else {
      artifact.status = "missing";
      artifact.detail = "xcodebuild started but WDA /status not ready within timeout";
    }
  } catch (error) {
    artifact.status = "missing";
    artifact.detail = error instanceof Error ? error.message : String(error);
    onLogLine?.(`[ios-wda][warn] ${artifact.detail}`);
  }
  return { outcome: artifact, wdaUrl };
}
