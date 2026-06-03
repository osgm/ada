import { spawn } from "node:child_process";
import type {
  DeviceConnectionState,
  DeviceKind,
  MobileDeviceScanResult,
  MobilePlatform,
  ScannedMobileDevice
} from "./device-types.js";
import { runAdbCapture } from "./android-uia2-probe.js";

export type DeviceScanOptions = {
  hdcPath?: string;
  enrichAndroid?: boolean;
  enrichHarmony?: boolean;
};

function runCommandCapture(
  command: string,
  args: string[],
  timeoutMs = 15_000
): Promise<{ ok: boolean; code: number; stdout: string; stderr: string }> {
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
      resolve({ ok: false, code: -1, stdout, stderr: "timeout" });
    }, timeoutMs);
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code: code ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: 1, stdout: "", stderr: String(error) });
    });
  });
}

function normalizeState(raw: string): DeviceConnectionState {
  const s = raw.trim().toLowerCase();
  if (s === "device" || s === "online" || s === "booted" || s === "available") return s as DeviceConnectionState;
  if (s === "unauthorized") return "unauthorized";
  if (s === "offline") return "offline";
  return "unknown";
}

function isAuthorizedState(state: DeviceConnectionState): boolean {
  return state === "device" || state === "online" || state === "booted" || state === "available";
}

/** 解析 `adb devices` 全表 */
export function parseAdbDevicesOutput(stdout: string): Array<{ id: string; state: DeviceConnectionState }> {
  const out: Array<{ id: string; state: DeviceConnectionState }> = [];
  for (const line of stdout.split(/\r?\n/).slice(1)) {
    const t = line.trim();
    if (!t || t.startsWith("*")) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 2) continue;
    const id = parts[0];
    const state = normalizeState(parts[1]);
    out.push({ id, state });
  }
  return out;
}

/** 解析 `hdc list targets` */
export function parseHdcTargetsOutput(stdout: string): Array<{ id: string; state: DeviceConnectionState }> {
  const out: Array<{ id: string; state: DeviceConnectionState }> = [];
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^empty/i.test(t)) continue;
    const m = t.match(/^([^\s]+)(?:\s+(device|online|offline|unauthorized))?$/i);
    if (!m?.[1]) continue;
    const state = normalizeState(m[2] ?? "device");
    out.push({ id: m[1], state });
  }
  return out;
}

async function adbShellProp(serial: string, prop: string): Promise<string> {
  const res = await runAdbCapture(serial, ["shell", "getprop", prop]);
  return res.ok ? res.stdout.trim() : "";
}

async function enrichAndroidDevice(device: ScannedMobileDevice): Promise<ScannedMobileDevice> {
  if (!device.authorized) return device;
  const model =
    (await adbShellProp(device.id, "ro.product.model")) ||
    (await adbShellProp(device.id, "ro.product.marketname"));
  const osVersion = await adbShellProp(device.id, "ro.build.version.release");
  const sdkVersion = await adbShellProp(device.id, "ro.build.version.sdk");
  const sizeRes = await runAdbCapture(device.id, ["shell", "wm", "size"]);
  let screenWidth: number | undefined;
  let screenHeight: number | undefined;
  if (sizeRes.ok) {
    const m = sizeRes.stdout.match(/(\d+)x(\d+)/);
    if (m) {
      screenWidth = Number(m[1]);
      screenHeight = Number(m[2]);
    }
  }
  const kind: DeviceKind = /emulator/i.test(device.id) ? "emulator" : "physical";
  return {
    ...device,
    model: model || device.model,
    sdkVersion: sdkVersion || device.sdkVersion,
    osVersion: osVersion || device.osVersion,
    screenWidth,
    screenHeight,
    kind,
    label: model || device.label || device.id
  };
}

export async function listAndroidDevices(options?: { enrich?: boolean }): Promise<ScannedMobileDevice[]> {
  const listed = await runAdbCapture("", ["devices"]);
  if (!listed.ok) {
    throw new Error(listed.stderr || "adb devices failed");
  }
  const rows = parseAdbDevicesOutput(listed.stdout);
  const devices: ScannedMobileDevice[] = [];
  for (const row of rows) {
    const state = row.state;
    const authorized = isAuthorizedState(state);
    const base: ScannedMobileDevice = {
      platform: "android",
      id: row.id,
      state,
      authorized,
      kind: /emulator/i.test(row.id) ? "emulator" : "physical",
      source: "adb devices"
    };
    devices.push(options?.enrich !== false && authorized ? await enrichAndroidDevice(base) : base);
  }
  return devices;
}

export async function listIosDevices(): Promise<ScannedMobileDevice[]> {
  const devices: ScannedMobileDevice[] = [];
  if (process.platform === "darwin") {
    const sim = await runCommandCapture("xcrun", ["simctl", "list", "devices", "available"]);
    if (sim.ok) {
      let runtimeVersion = "";
      for (const line of sim.stdout.split(/\r?\n/)) {
        const runtimeMatch = line.match(/^--\s+iOS\s+([\d.]+)\s+--/i);
        if (runtimeMatch?.[1]) {
          runtimeVersion = runtimeMatch[1];
          continue;
        }
        const booted = /\(Booted\)/i.test(line);
        const m = line.match(/^\s+(.+?)\s+\(([A-F0-9-]{36})\)/i);
        if (!m?.[2]) continue;
        const state: DeviceConnectionState = booted ? "booted" : "available";
        devices.push({
          platform: "ios",
          id: m[2],
          state,
          authorized: true,
          label: m[1].trim(),
          sdkVersion: runtimeVersion || undefined,
          osVersion: runtimeVersion || undefined,
          kind: "simulator",
          source: "simctl list devices available"
        });
      }
    }
    const trace = await runCommandCapture("xcrun", ["xctrace", "list", "devices"]);
    if (trace.ok) {
      for (const line of trace.stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("==") || /simulator/i.test(trimmed)) continue;
        const withOs = trimmed.match(/^(.+?)\s+\((\d+(?:\.\d+)*)\)\s+\(([A-F0-9-]{36})\)\s*$/i);
        if (withOs?.[3]) {
          if (devices.some((d) => d.id === withOs[3])) continue;
          devices.push({
            platform: "ios",
            id: withOs[3],
            state: "device",
            authorized: true,
            label: withOs[1].trim(),
            osVersion: withOs[2],
            sdkVersion: withOs[2],
            kind: "physical",
            source: "xctrace list devices"
          });
          continue;
        }
        const m = trimmed.match(/^(.+?)\s+\(([A-F0-9-]{36})\)\s*$/i);
        if (!m?.[2]) continue;
        if (devices.some((d) => d.id === m[2])) continue;
        devices.push({
          platform: "ios",
          id: m[2],
          state: "device",
          authorized: true,
          label: m[1].trim(),
          kind: "physical",
          source: "xctrace list devices"
        });
      }
    }
  }
  return devices;
}

export async function listHarmonyDevices(options?: {
  hdcPath?: string;
  enrich?: boolean;
}): Promise<ScannedMobileDevice[]> {
  const hdc = options?.hdcPath?.trim() || "hdc";
  const probe = await runCommandCapture(hdc, ["list", "targets"]);
  if (!probe.ok) {
    throw new Error(probe.stderr || probe.stdout || "hdc list targets failed");
  }
  const rows = parseHdcTargetsOutput(probe.stdout);
  const devices: ScannedMobileDevice[] = [];
  for (const row of rows) {
    const authorized = isAuthorizedState(row.state);
    const base: ScannedMobileDevice = {
      platform: "harmony",
      id: row.id,
      state: row.state,
      authorized,
      kind: /emulator|127\.0\.0\.1/i.test(row.id) ? "emulator" : "physical",
      source: "hdc list targets",
      label: row.id
    };
    if (options?.enrich !== false && authorized) {
      const modelRes = await runCommandCapture(hdc, ["-t", row.id, "shell", "param", "get", "const.product.model"]);
      const verRes = await runCommandCapture(hdc, ["-t", row.id, "shell", "param", "get", "const.product.software.version"]);
      const apiRes = await runCommandCapture(hdc, ["-t", row.id, "shell", "param", "get", "const.ohos.apiversion"]);
      const apiVersion = apiRes.ok ? apiRes.stdout.trim() : "";
      devices.push({
        ...base,
        model: modelRes.ok ? modelRes.stdout.trim() : undefined,
        sdkVersion: apiVersion || undefined,
        osVersion: verRes.ok ? verRes.stdout.trim() : undefined,
        label: modelRes.ok && modelRes.stdout.trim() ? modelRes.stdout.trim() : base.label
      });
    } else {
      devices.push(base);
    }
  }
  return devices;
}

export async function scanMobileDevices(options?: DeviceScanOptions): Promise<MobileDeviceScanResult> {
  const scannedAt = new Date().toISOString();
  const result: MobileDeviceScanResult = {
    scannedAt,
    android: [],
    ios: [],
    harmony: [],
    errors: []
  };

  try {
    result.android = await listAndroidDevices({ enrich: options?.enrichAndroid !== false });
  } catch (error) {
    result.errors.push({
      platform: "android",
      message: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    result.ios = await listIosDevices();
  } catch (error) {
    result.errors.push({
      platform: "ios",
      message: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    result.harmony = await listHarmonyDevices({
      hdcPath: options?.hdcPath,
      enrich: options?.enrichHarmony !== false
    });
  } catch (error) {
    result.errors.push({
      platform: "harmony",
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return result;
}

export function pickDefaultDeviceId(
  devices: ScannedMobileDevice[],
  preferred?: string
): string | undefined {
  const pref = preferred?.trim();
  if (pref && devices.some((d) => d.id === pref && d.authorized)) return pref;
  const authorized = devices.filter((d) => d.authorized);
  if (authorized.length === 1) return authorized[0].id;
  const physical = authorized.find((d) => d.kind === "physical");
  return physical?.id ?? authorized[0]?.id;
}

export function flattenScan(scan: MobileDeviceScanResult): ScannedMobileDevice[] {
  return [...scan.android, ...scan.ios, ...scan.harmony];
}
