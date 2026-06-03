import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadDeviceRegistryDefaults, mergeMobileSessionPayload } from "@ada/driver-rpc";
import { parseHdcTargetsOutput } from "@ada/runtime-probe";

export interface BootstrapAndroidResult {
  udid: string;
  screen: { width: number; height: number };
}

export interface BootstrapHarmonyResult {
  deviceSn: string;
  screen: { width: number; height: number };
}

function runCapture(command: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, env: process.env });
    let out = "";
    child.stdout?.on("data", (c) => {
      out += c.toString();
    });
    child.stderr?.on("data", (c) => {
      out += c.toString();
    });
    child.on("exit", (code) => resolve({ ok: code === 0, out: out || "" }));
  });
}

export async function bootstrapAndroid(cwd = process.cwd(), preferredUdid?: string): Promise<BootstrapAndroidResult> {
  const defaults = await loadDeviceRegistryDefaults(cwd);
  let udid = preferredUdid?.trim() || defaults.android || process.env.ADA_ANDROID_UDID?.trim() || "";
  if (!udid) {
    const listed = await runCapture("adb", ["devices"]);
    const line = listed.out
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.endsWith("\tdevice"));
    if (!line) throw new Error("no adb device connected");
    udid = line.split("\t")[0];
  }
  let screen = { width: 1080, height: 2400 };
  const size = await runCapture("adb", udid ? ["-s", udid, "shell", "wm", "size"] : ["shell", "wm", "size"]);
  const m = size.out.match(/(\d+)x(\d+)/);
  if (m) {
    screen = { width: Number(m[1]), height: Number(m[2]) };
  }
  return { udid, screen };
}

export async function bootstrapHarmony(
  hdcPath = "hdc",
  cwd = process.cwd(),
  preferredSn?: string
): Promise<BootstrapHarmonyResult> {
  const defaults = await loadDeviceRegistryDefaults(cwd);
  const listed = await runCapture(hdcPath, ["list", "targets"]);
  const online = listed.ok ? parseHdcTargetsOutput(listed.out).map((r) => r.id) : [];
  if (online.length === 0) {
    throw new Error("hdc list targets 为空：请连接鸿蒙设备并授权");
  }
  const pref = preferredSn?.trim() || defaults.harmony || process.env.ADA_HARMONY_DEVICE_SN?.trim() || "";
  let deviceSn = pref && online.includes(pref) ? pref : online[0];
  try {
    const raw = await fs.readFile(path.join(cwd, ".ada-agent", "devices.json"), "utf8");
    const reg = JSON.parse(raw);
    if (!reg.defaults) reg.defaults = {};
    reg.defaults.harmony = deviceSn;
    reg.updatedAt = new Date().toISOString();
    await fs.writeFile(path.join(cwd, ".ada-agent", "devices.json"), JSON.stringify(reg, null, 2));
  } catch {
    /* ignore */
  }
  return { deviceSn, screen: { width: 1080, height: 2400 } };
}

export function androidBasePayload(
  profile: { appId?: string },
  udid: string,
  screen: { width: number; height: number },
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return mergeMobileSessionPayload(
    "android",
    {
      appId: profile.appId,
      screenWidth: screen.width,
      screenHeight: screen.height,
      ...extra
    },
    { android: udid },
    { screen }
  );
}

export function harmonyBasePayload(
  profile: { appId?: string; abilityId?: string },
  deviceSn: string,
  screen: { width: number; height: number },
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return mergeMobileSessionPayload(
    "harmony",
    {
      appId: profile.appId,
      bundleId: profile.appId,
      abilityId: profile.abilityId,
      screenWidth: screen.width,
      screenHeight: screen.height,
      ...extra
    },
    { harmony: deviceSn },
    { screen }
  );
}
