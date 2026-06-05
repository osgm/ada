import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { DriverInstallOutcome } from "./install-summary.js";
import { resolveDefaultToolsDir } from "./tools-paths.js";
import {
  defaultUia2DevicePort,
  defaultUia2LocalPort,
  defaultUia2ServerUrl,
  probeAndroidUia2Runtime,
  resolveAndroidDeviceSerial,
  runAdbCapture,
  androidUia2BootstrapEnabled
} from "@ada/runtime-probe";

const PINNED_SETTINGS_VERSION = "5.14.0";
const PINNED_UIA2_SERVER_VERSION = "7.3.0";

function uia2BootstrapEnabled(): boolean {
  return androidUia2BootstrapEnabled();
}

function defaultApkUrls(): { settings: string; server: string; serverTest: string } {
  const version = process.env.ADA_ANDROID_UIA2_SERVER_RELEASE?.trim() || PINNED_UIA2_SERVER_VERSION;
  const settingsVersion = process.env.ADA_ANDROID_UIA2_SETTINGS_RELEASE?.trim() || PINNED_SETTINGS_VERSION;
  return {
    settings:
      process.env.ADA_ANDROID_UIA2_SETTINGS_APK_URL?.trim() ||
      `https://github.com/appium/appium/settings/releases/download/v${settingsVersion}/settings_apk-debug.apk`,
    server:
      process.env.ADA_ANDROID_UIA2_SERVER_APK_URL?.trim() ||
      `https://github.com/appium/appium-uiautomator2-server/releases/download/v${version}/appium-uiautomator2-server-v${version}.apk`,
    serverTest:
      process.env.ADA_ANDROID_UIA2_SERVER_TEST_APK_URL?.trim() ||
      `https://github.com/appium/appium-uiautomator2-server/releases/download/v${version}/appium-uiautomator2-server-debug-androidTest.apk`
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, dest: string, onLogLine?: (line: string) => void): Promise<void> {
  onLogLine?.(`[android-uia2] download ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed ${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
}

async function ensureApkCached(name: string, url: string, cacheDir: string, onLogLine?: (line: string) => void): Promise<string> {
  const fileName = path.basename(new URL(url).pathname) || `${name}.apk`;
  const dest = path.join(cacheDir, fileName);
  if (!(await pathExists(dest))) {
    await downloadFile(url, dest, onLogLine);
  }
  return dest;
}

async function installApk(serial: string, apkPath: string): Promise<void> {
  const res = await runAdbCapture(serial, ["install", "-r", apkPath]);
  if (!res.ok) {
    throw new Error(`adb install failed for ${path.basename(apkPath)}: ${res.stderr || res.stdout}`);
  }
}

function spawnInstrumentBackground(serial: string): void {
  const args = serial
    ? [
        "-s",
        serial,
        "shell",
        "am",
        "instrument",
        "-w",
        "io.appium.uiautomator2.server.test/androidx.test.runner.AndroidJUnitRunner"
      ]
    : [
        "shell",
        "am",
        "instrument",
        "-w",
        "io.appium.uiautomator2.server.test/androidx.test.runner.AndroidJUnitRunner"
      ];
  const child = spawn("adb", args, {
    stdio: "ignore",
    detached: true,
    shell: false,
    ...(process.platform === "win32" ? { windowsHide: true } : {})
  });
  child.unref();
}

async function waitForUia2Ready(serverUrl: string, timeoutMs: number, onLogLine?: (line: string) => void): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const probe = await probeAndroidUia2Runtime({ serverUrl, ensureForward: false });
    if (probe.reachable) {
      onLogLine?.(`[android-uia2] server ready at ${serverUrl}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export interface EnsureAndroidUia2Options {
  force?: boolean;
  serial?: string;
  onLogLine?: (line: string) => void;
}

/** 可选：下载 Appium UiAutomator2 APK、启动设备端 Server、adb forward（需 ADA_ANDROID_UIA2_BOOTSTRAP=true） */
export async function ensureAndroidUia2Bootstrap(options?: EnsureAndroidUia2Options): Promise<{
  outcome: DriverInstallOutcome;
  serverUrl: string;
}> {
  const onLogLine = options?.onLogLine;
  const serverUrl = defaultUia2ServerUrl();
  const artifact: DriverInstallOutcome = { id: "android-uia2", status: "skipped", detail: "bootstrap disabled" };

  if (!uia2BootstrapEnabled()) {
    const serial = await resolveAndroidDeviceSerial(options?.serial);
    if (!serial) {
      artifact.status = "skipped";
      artifact.detail = "bootstrap disabled; no adb device (UIA2 deferred)";
      return { outcome: artifact, serverUrl };
    }
    const probe = await probeAndroidUia2Runtime({ serverUrl, serial: options?.serial, ensureForward: true });
    artifact.detail = `bootstrap disabled (set ADA_ANDROID_UIA2_BOOTSTRAP=true); ${probe.detail}`;
    artifact.status = probe.reachable ? "skipped" : "missing";
    return { outcome: artifact, serverUrl };
  }

  const serial = await resolveAndroidDeviceSerial(options?.serial);
  if (!serial) {
    artifact.status = "skipped";
    artifact.detail = "no adb device for UIA2 bootstrap (deferred until device connected)";
    return { outcome: artifact, serverUrl };
  }

  const localPort = defaultUia2LocalPort();
  const devicePort = defaultUia2DevicePort();
  await runAdbCapture(serial, ["forward", `tcp:${localPort}`, `tcp:${devicePort}`]);
  process.env.ADA_ANDROID_UIA2_SERVER_URL = serverUrl;
  process.env.ADA_ANDROID_DEVICE_SN = serial;

  let probe = await probeAndroidUia2Runtime({ serverUrl, serial, ensureForward: false });
  if (probe.reachable && !options?.force) {
    artifact.status = "skipped";
    artifact.detail = probe.detail;
    return { outcome: artifact, serverUrl };
  }

  const toolsDir = (await resolveDefaultToolsDir()) ?? path.join(process.cwd(), "tools");
  const cacheDir = path.join(toolsDir, "android-uia2");
  const urls = defaultApkUrls();
  try {
    onLogLine?.("[android-uia2] installing UiAutomator2 server APKs");
    const settingsApk = await ensureApkCached("settings", urls.settings, cacheDir, onLogLine);
    const serverApk = await ensureApkCached("server", urls.server, cacheDir, onLogLine);
    const serverTestApk = await ensureApkCached("server-test", urls.serverTest, cacheDir, onLogLine);
    await installApk(serial, settingsApk);
    await installApk(serial, serverApk);
    await installApk(serial, serverTestApk);
    onLogLine?.("[android-uia2] starting instrumentation (background)");
    spawnInstrumentBackground(serial);
    const ready = await waitForUia2Ready(serverUrl, 45_000, onLogLine);
    probe = await probeAndroidUia2Runtime({ serverUrl, serial, ensureForward: false });
    if (ready || probe.reachable) {
      artifact.status = "installed";
      artifact.detail = `UIA2 bootstrapped at ${serverUrl} (device ${serial})`;
    } else {
      artifact.status = "missing";
      artifact.detail = "UIA2 instrumentation started but /status not reachable within timeout";
    }
  } catch (error) {
    artifact.status = "missing";
    artifact.detail = error instanceof Error ? error.message : String(error);
    onLogLine?.(`[android-uia2][warn] ${artifact.detail}`);
  }
  return { outcome: artifact, serverUrl };
}
