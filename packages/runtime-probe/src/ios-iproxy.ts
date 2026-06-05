import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { commandExists, isTcpPortOpen } from "./runtime-probe.js";
import { defaultWdaServerUrl, iosUseSimulator, resolveIosDeviceUdid } from "./ios-wda-probe.js";
import { probeWdaStatus } from "./android-uia2-probe.js";

const iproxyChildren = new Map<string, number>();

export function isIosIproxyHostSupported(): boolean {
  return process.platform === "darwin" || process.platform === "win32";
}

export function iosIproxyDisabled(): boolean {
  return ["1", "true", "yes"].includes((process.env.ADA_IOS_IPROXY_DISABLED ?? "").trim().toLowerCase());
}

export function defaultWdaDevicePort(): number {
  const raw = process.env.ADA_IOS_WDA_DEVICE_PORT?.trim();
  const n = raw ? Number(raw) : 8100;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 8100;
}

export function defaultWdaLocalPort(): number {
  const fromEnv = process.env.ADA_IOS_WDA_LOCAL_PORT?.trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  try {
    const parsed = new URL(defaultWdaServerUrl());
    const port = Number(parsed.port || 8100);
    if (Number.isFinite(port) && port > 0) return port;
  } catch {
    // ignore
  }
  return 8100;
}

/** `ADA_IOS_WDA_PORT_MAP=UDID:8100,UDID2:8101` */
export function resolveWdaLocalPortForUdid(udid: string): number {
  const mapRaw = process.env.ADA_IOS_WDA_PORT_MAP?.trim();
  if (mapRaw && udid) {
    for (const part of mapRaw.split(/[,;\s]+/)) {
      const [id, portStr] = part.split(":");
      if (id?.trim().toLowerCase() === udid.trim().toLowerCase()) {
        const n = Number(portStr);
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
      }
    }
  }
  return defaultWdaLocalPort();
}

export function wdaServerUrlForLocalPort(localPort: number): string {
  return `http://127.0.0.1:${localPort}`;
}

function iproxyInstallHint(): string {
  if (process.platform === "win32") {
    return "run install-deps --only=ios (auto-downloads to ~/.ada/tools/libimobiledevice) or set ADA_IPROXY_PATH";
  }
  return "install libimobiledevice (brew install libimobiledevice)";
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveIproxyCommand(): Promise<string | null> {
  const fromEnv = process.env.ADA_IPROXY_PATH?.trim();
  if (fromEnv) return fromEnv;
  const libDir =
    process.env.ADA_LIBIMOBILEDEVICE_DIR?.trim() ||
    (process.env.ADA_TOOLS_DIR ? path.join(process.env.ADA_TOOLS_DIR, "libimobiledevice") : "");
  if (libDir) {
    const candidate = path.join(libDir, process.platform === "win32" ? "iproxy.exe" : "iproxy");
    if (await pathExists(candidate)) return candidate;
  }
  if (await commandExists("iproxy")) return "iproxy";
  return null;
}
function shouldUseShell(command: string): boolean {
  return process.platform === "win32" && !command.includes("/") && !command.includes("\\");
}

function runCommandCapture(
  command: string,
  args: string[],
  timeoutMs = 15_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: shouldUseShell(command),
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: -1, stdout, stderr: stderr || "timeout" });
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 1, stdout: "", stderr: "" });
    });
  });
}

/** simctl 中注册的 UDID 视为模拟器（真机默认不走 iproxy） */
export async function isIosSimulatorUdid(udid: string): Promise<boolean> {
  const id = udid.trim();
  if (!id || process.platform !== "darwin") return false;
  const sim = await runCommandCapture("xcrun", ["simctl", "list", "devices", "available"]);
  if (sim.code !== 0) return false;
  return new RegExp(`\\(${id}\\)`, "i").test(sim.stdout);
}

function iproxyKey(udid: string, localPort: number, devicePort: number): string {
  return `${udid || "*"}:${localPort}:${devicePort}`;
}

/** 真机：启动 iproxy 将本机端口转发到设备 WDA 端口（macOS / Windows USB 方案 C） */
export async function ensureIosIproxyForward(options?: {
  udid?: string;
  localPort?: number;
  devicePort?: number;
  onLogLine?: (line: string) => void;
}): Promise<{
  forwarded: boolean;
  skipped: boolean;
  localPort: number;
  devicePort: number;
  udid: string;
  serverUrl: string;
  detail: string;
}> {
  const devicePort = options?.devicePort ?? defaultWdaDevicePort();
  let udid = options?.udid?.trim() ?? "";
  if (!udid) {
    udid = await resolveIosDeviceUdid();
  }
  const localPort = options?.localPort ?? resolveWdaLocalPortForUdid(udid);
  const serverUrl = wdaServerUrlForLocalPort(localPort);
  const log = options?.onLogLine;

  if (!isIosIproxyHostSupported()) {
    return {
      forwarded: false,
      skipped: true,
      localPort,
      devicePort,
      udid,
      serverUrl,
      detail: "iproxy requires macOS or Windows host"
    };
  }
  if (iosIproxyDisabled()) {
    return {
      forwarded: false,
      skipped: true,
      localPort,
      devicePort,
      udid,
      serverUrl,
      detail: "iproxy disabled (ADA_IOS_IPROXY_DISABLED=1)"
    };
  }
  if (!udid) {
    return {
      forwarded: false,
      skipped: true,
      localPort,
      devicePort,
      udid: "",
      serverUrl,
      detail: "no iOS device UDID (connect device or set ADA_IOS_DEVICE_UDID)"
    };
  }
  if (await isIosSimulatorUdid(udid)) {
    return {
      forwarded: false,
      skipped: true,
      localPort,
      devicePort,
      udid,
      serverUrl,
      detail: `simulator ${udid} (iproxy not needed)`
    };
  }

  const key = iproxyKey(udid, localPort, devicePort);
  if (iproxyChildren.has(key)) {
    return {
      forwarded: true,
      skipped: false,
      localPort,
      devicePort,
      udid,
      serverUrl,
      detail: `iproxy already active ${localPort}->${devicePort} udid=${udid}`
    };
  }

  if (await isTcpPortOpen("127.0.0.1", localPort, 800)) {
    return {
      forwarded: true,
      skipped: false,
      localPort,
      devicePort,
      udid,
      serverUrl,
      detail: `local port ${localPort} already open (assuming iproxy/WDA)`
    };
  }

  const iproxyCmd = await resolveIproxyCommand();
  if (!iproxyCmd) {
    return {
      forwarded: false,
      skipped: false,
      localPort,
      devicePort,
      udid,
      serverUrl,
      detail: `iproxy not found in PATH (${iproxyInstallHint()})`
    };
  }

  const args = [String(localPort), String(devicePort), "-u", udid];
  log?.(`[ios-iproxy] ${iproxyCmd} ${args.join(" ")}`);
  const child = spawn(iproxyCmd, args, {
    stdio: "ignore",
    detached: true,
    shell: shouldUseShell(iproxyCmd),
    ...(process.platform === "win32" ? { windowsHide: true } : {})
  });
  child.unref();
  if (child.pid) {
    iproxyChildren.set(key, child.pid);
  }

  await new Promise((r) => setTimeout(r, 600));
  const open = await isTcpPortOpen("127.0.0.1", localPort, 1500);
  return {
    forwarded: open,
    skipped: false,
    localPort,
    devicePort,
    udid,
    serverUrl,
    detail: open
      ? `iproxy ${localPort}->${devicePort} udid=${udid}`
      : `iproxy started but 127.0.0.1:${localPort} not open yet`
  };
}

/** WDA 探测；真机默认 ensure iproxy（与 Android ensureForward 对齐） */
export async function probeIosWdaRuntime(options?: {
  serverUrl?: string;
  udid?: string;
  ensureForward?: boolean;
}): Promise<{
  wdaUrl: string;
  reachable: boolean;
  ready: boolean;
  forwarded: boolean;
  udid: string;
  detail: string;
  status?: Record<string, unknown>;
}> {
  let udid = options?.udid?.trim() ?? "";
  if (!udid) {
    udid = await resolveIosDeviceUdid();
  }
  let wdaUrl = (options?.serverUrl ?? defaultWdaServerUrl()).replace(/\/$/, "");
  let forwarded = false;

  if (options?.ensureForward !== false && udid && !(await isIosSimulatorUdid(udid))) {
    const fwd = await ensureIosIproxyForward({ udid });
    forwarded = fwd.forwarded;
    if (!options?.serverUrl) {
      wdaUrl = fwd.serverUrl;
      process.env.ADA_WDA_SERVER_URL = wdaUrl;
    }
  }

  const wda = await probeWdaStatus(wdaUrl);
  let detail = wda.detail;
  if (forwarded && !wda.reachable) {
    const bootstrapHint =
      process.platform === "darwin"
        ? "use --install-deps=ios or ADA_IOS_WDA_BOOTSTRAP=true"
        : "ensure WDA is installed on device (bootstrap requires macOS)";
    detail += ` (iproxy applied; WDA may not be running on device — ${bootstrapHint})`;
  } else if (!forwarded && udid && !(await isIosSimulatorUdid(udid)) && !iosIproxyDisabled()) {
    const iproxyCmd = await resolveIproxyCommand();
    if (!iproxyCmd) {
      detail += ` (${iproxyInstallHint()})`;
    }
  }

  return {
    wdaUrl,
    reachable: wda.reachable,
    ready: wda.ready,
    forwarded,
    udid,
    detail,
    status: wda.status
  };
}
