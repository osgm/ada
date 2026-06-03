import net from "node:net";
import { spawn } from "node:child_process";

export async function commandExists(command: string): Promise<boolean> {
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

function runCommandCapture(command: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
    child.on("error", () => resolve({ code: 1, stdout, stderr }));
  });
}

/** adb 是否在 PATH 且至少有一台 device 状态设备 */
export async function probeAndroidRuntime(): Promise<{
  adbOnPath: boolean;
  deviceConnected: boolean;
  detail: string;
}> {
  const adbOnPath = await commandExists("adb");
  if (!adbOnPath) {
    return { adbOnPath: false, deviceConnected: false, detail: "adb not found in PATH" };
  }
  const { code, stdout, stderr } = await runCommandCapture("adb", ["devices"]);
  if (code !== 0) {
    return {
      adbOnPath: true,
      deviceConnected: false,
      detail: `adb devices failed: ${stderr.trim() || stdout.trim() || `exit ${code}`}`
    };
  }
  const lines = stdout.split(/\r?\n/).slice(1);
  const connected = lines.some((line) => {
    const t = line.trim();
    if (!t || t.startsWith("*")) return false;
    return /\bdevice\b/i.test(t) && !/\boffline\b/i.test(t);
  });
  return {
    adbOnPath: true,
    deviceConnected: connected,
    detail: connected ? "adb device connected" : "no adb device in 'device' state"
  };
}

export async function isTcpPortOpen(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(timeoutMs, () => done(false));
  });
}

function wdaServerUrl(): string {
  return process.env.ADA_WDA_SERVER_URL?.trim() || "http://127.0.0.1:8100";
}

/** iOS：macOS + xcrun + WDA /status 可达 */
export async function probeIosRuntime(): Promise<{
  hostSupported: boolean;
  xcrunOk: boolean;
  wdaReachable: boolean;
  wdaUrl: string;
  detail: string;
}> {
  const wdaUrl = wdaServerUrl().replace(/\/$/, "");
  if (process.platform !== "darwin") {
    return {
      hostSupported: false,
      xcrunOk: false,
      wdaReachable: false,
      wdaUrl,
      detail: "iOS requires macOS host"
    };
  }
  const xcrunOk = await commandExists("xcrun");
  if (!xcrunOk) {
    return {
      hostSupported: true,
      xcrunOk: false,
      wdaReachable: false,
      wdaUrl,
      detail: "xcrun not found"
    };
  }
  let wdaReachable = false;
  try {
    const statusUrl = `${wdaUrl}/status`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(statusUrl, { signal: controller.signal });
    clearTimeout(timer);
    wdaReachable = res.ok;
  } catch {
    wdaReachable = false;
  }
  if (!wdaReachable) {
    try {
      const parsed = new URL(wdaUrl);
      const host = parsed.hostname;
      const port = Number(parsed.port || 8100);
      wdaReachable = await isTcpPortOpen(host, port);
    } catch {
      wdaReachable = false;
    }
  }
  return {
    hostSupported: true,
    xcrunOk: true,
    wdaReachable,
    wdaUrl,
    detail: wdaReachable ? `WDA reachable at ${wdaUrl}` : `WDA not reachable at ${wdaUrl}`
  };
}
