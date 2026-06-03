import { spawn } from "node:child_process";

function runCommandCapture(
  command: string,
  args: string[],
  timeoutMs = 15_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
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

export function defaultWdaServerUrl(): string {
  return (process.env.ADA_WDA_SERVER_URL?.trim() || "http://127.0.0.1:8100").replace(/\/$/, "");
}

export function wdaBootstrapEnabled(): boolean {
  const raw = process.env.ADA_IOS_WDA_BOOTSTRAP?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** 解析 iOS 真机 UDID（xctrace）或模拟器 UDID（simctl booted） */
export async function resolveIosDeviceUdid(preferred?: string): Promise<string> {
  const fromEnv = preferred?.trim() || process.env.ADA_IOS_DEVICE_UDID?.trim() || "";
  if (fromEnv) return fromEnv;

  const useSimulator = ["1", "true", "yes"].includes(
    (process.env.ADA_IOS_USE_SIMULATOR ?? "").trim().toLowerCase()
  );
  if (useSimulator || process.platform === "darwin") {
    const sim = await runCommandCapture("xcrun", ["simctl", "list", "devices", "booted"]);
    if (sim.code === 0) {
      const match = sim.stdout.match(/\(([A-F0-9-]{36})\)\s+\(Booted\)/i);
      if (match?.[1]) return match[1];
    }
  }
  if (process.platform !== "darwin") return "";

  const trace = await runCommandCapture("xcrun", ["xctrace", "list", "devices"]);
  if (trace.code !== 0) return "";
  for (const line of trace.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("==") || /simulator/i.test(trimmed)) continue;
    const match = trimmed.match(/\(([A-F0-9-]{36})\)\s*$/i);
    if (match?.[1]) return match[1];
  }
  return "";
}

export function buildWdaXcodeDestination(udid: string): string {
  if (udid) return `id=${udid}`;
  const simName = process.env.ADA_IOS_SIMULATOR_NAME?.trim() || "iPhone 15";
  return `platform=iOS Simulator,name=${simName}`;
}

export async function listIosSimulators(): Promise<string[]> {
  const sim = await runCommandCapture("xcrun", ["simctl", "list", "devices", "available"]);
  if (sim.code !== 0) return [];
  const names: string[] = [];
  for (const line of sim.stdout.split(/\r?\n/)) {
    const m = line.match(/^\s+(.+?)\s+\([A-F0-9-]+\)/);
    if (m?.[1]) names.push(m[1].trim());
  }
  return names;
}
