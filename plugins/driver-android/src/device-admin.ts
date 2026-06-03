import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  deviceAdminFail,
  deviceAdminSuccess,
  parseAndroidAppInfo,
  parseAndroidCurrentApp,
  parsePackageList,
  readDeviceAdminAction
} from "@ada/driver-rpc";
import fs from "node:fs/promises";
import path from "node:path";
import { runAdb } from "./adb-runner.js";
import { deviceSerialOf } from "./session-signature.js";
import type { AndroidPayload } from "./adapter.js";

const screenRecordJobs = new Map<string, { remote: string }>();

function serialOf(payload: AndroidPayload): string {
  return deviceSerialOf(payload);
}

async function shell(payload: AndroidPayload, cmd: string) {
  const serial = serialOf(payload);
  if (!serial) return { ok: false as const, stdout: "", stderr: "device serial missing" };
  return runAdb(serial, ["shell", "sh", "-c", cmd]);
}

function requireSerial(command: CommandEnvelope, payload: AndroidPayload): string | CommandResult {
  const serial = serialOf(payload);
  if (!serial) return deviceAdminFail(command, "ANDROID_SERIAL_MISSING", "capabilities.udid required");
  return serial;
}

export async function executeAndroidDeviceAdmin(
  command: CommandEnvelope,
  payload: AndroidPayload
): Promise<CommandResult> {
  const action = readDeviceAdminAction(payload as Record<string, unknown>);
  if (!action) {
    return deviceAdminFail(command, "DEVICE_ADMIN_ACTION_MISSING", "payload.action required");
  }

  const serialCheck = requireSerial(command, payload);
  if (typeof serialCheck !== "string") return serialCheck;
  const serial = serialCheck;

  const appId = String(payload.appId ?? "").trim();

  switch (action) {
    case "listApps": {
      const userOnly = payload.userOnly === true || payload.thirdPartyOnly === true;
      const res = await runAdb(serial, ["shell", "pm", "list", "packages"]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_LIST_APPS_FAILED", res.stderr || res.stdout);
      const packages = parsePackageList(res.stdout, userOnly);
      return deviceAdminSuccess(command, action, { packages, count: packages.length });
    }
    case "appInfo": {
      if (!appId) return deviceAdminFail(command, "ANDROID_APP_ID_MISSING", "appId required");
      const res = await shell(payload, `dumpsys package ${appId}`);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_APP_INFO_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, parseAndroidAppInfo(res.stdout, appId));
    }
    case "isInstalled": {
      if (!appId) return deviceAdminFail(command, "ANDROID_APP_ID_MISSING", "appId required");
      const res = await runAdb(serial, ["shell", "pm", "path", appId]);
      const installed = res.ok && res.stdout.includes("package:");
      return deviceAdminSuccess(command, action, { appId, installed });
    }
    case "installApp": {
      const localPath = path.resolve(String(payload.path ?? payload.localPath ?? ""));
      if (!localPath) return deviceAdminFail(command, "ANDROID_INSTALL_PATH_MISSING", "path required");
      const res = await runAdb(serial, ["install", "-r", localPath]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_INSTALL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { path: localPath, output: (res.stdout + res.stderr).trim() });
    }
    case "uninstallApp": {
      if (!appId) return deviceAdminFail(command, "ANDROID_APP_ID_MISSING", "appId required");
      const res = await runAdb(serial, ["uninstall", appId]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_UNINSTALL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { appId, output: (res.stdout + res.stderr).trim() });
    }
    case "pushFile": {
      const localPath = path.resolve(String(payload.localPath ?? payload.path ?? ""));
      const remotePath = String(payload.remotePath ?? "").trim();
      if (!localPath || !remotePath) {
        return deviceAdminFail(command, "ANDROID_PUSH_PATHS_MISSING", "localPath and remotePath required");
      }
      const res = await runAdb(serial, ["push", localPath, remotePath]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_PUSH_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { localPath, remotePath });
    }
    case "pullFile": {
      const localPath = path.resolve(String(payload.localPath ?? payload.path ?? ""));
      const remotePath = String(payload.remotePath ?? "").trim();
      if (!localPath || !remotePath) {
        return deviceAdminFail(command, "ANDROID_PULL_PATHS_MISSING", "localPath and remotePath required");
      }
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      const res = await runAdb(serial, ["pull", remotePath, localPath]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_PULL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { localPath, remotePath });
    }
    case "shell": {
      const cmd = String(payload.command ?? "").trim();
      if (!cmd) return deviceAdminFail(command, "ANDROID_SHELL_COMMAND_MISSING", "command required");
      const res = await shell(payload, cmd);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_SHELL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { output: res.stdout.trim() });
    }
    case "hdc":
      return deviceAdminFail(command, "ANDROID_HDC_UNSUPPORTED", "hdc is Harmony-only");
    case "currentApp": {
      const res = await shell(payload, "dumpsys window displays | grep -E mCurrentFocus");
      const fallback = res.ok ? res.stdout : "";
      const res2 = res.ok && parseAndroidCurrentApp(fallback)
        ? { ok: true, stdout: fallback }
        : await shell(payload, "dumpsys activity activities | grep mResumedActivity");
      const info = parseAndroidCurrentApp(res2.stdout);
      if (!info) return deviceAdminFail(command, "ANDROID_CURRENT_APP_UNKNOWN", "could not parse foreground app");
      return deviceAdminSuccess(command, action, info);
    }
    case "clearAppData": {
      if (!appId) return deviceAdminFail(command, "ANDROID_APP_ID_MISSING", "appId required");
      const res = await runAdb(serial, ["shell", "pm", "clear", appId]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_CLEAR_DATA_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { appId, cleared: true });
    }
    case "openUrl": {
      const url = String(payload.url ?? "").trim();
      if (!url) return deviceAdminFail(command, "ANDROID_URL_MISSING", "url required");
      const res = await shell(
        payload,
        `am start -a android.intent.action.VIEW -d '${url.replace(/'/g, "'\\''")}'`
      );
      if (!res.ok) return deviceAdminFail(command, "ANDROID_OPEN_URL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { url, output: res.stdout.trim() });
    }
    case "pressKey": {
      const key = payload.key ?? payload.keyCode;
      if (key == null || key === "") return deviceAdminFail(command, "ANDROID_KEY_MISSING", "key required");
      const code = String(key).startsWith("KEYCODE_") ? String(key) : String(key);
      const res = await runAdb(serial, ["shell", "input", "keyevent", code]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_PRESS_KEY_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { key: code });
    }
    case "longPress": {
      const ms = Math.max(300, Number(payload.durationMs ?? payload.ms ?? 800));
      const point = payload.point as [number, number] | undefined;
      if (!point || point.length !== 2) {
        return deviceAdminFail(command, "ANDROID_LONG_PRESS_POINT", "longPress requires payload.point [x,y]");
      }
      const [x, y] = [Math.round(point[0]), Math.round(point[1])];
      const res = await runAdb(serial, ["shell", "input", "swipe", String(x), String(y), String(x), String(y), String(ms)]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_LONG_PRESS_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { point: [x, y], durationMs: ms });
    }
    case "setClipboard": {
      const text = String(payload.text ?? "");
      const escaped = text.replace(/'/g, "'\\''");
      const res = await shell(payload, `cmd clipboard set text '${escaped}'`);
      if (!res.ok) {
        const legacy = await shell(payload, `am broadcast -a clipper.set -e text '${escaped}'`);
        if (!legacy.ok) return deviceAdminFail(command, "ANDROID_SET_CLIPBOARD_FAILED", res.stderr || legacy.stderr);
      }
      return deviceAdminSuccess(command, action, { length: text.length });
    }
    case "getClipboard": {
      const res = await shell(payload, "cmd clipboard get");
      if (!res.ok) return deviceAdminFail(command, "ANDROID_GET_CLIPBOARD_FAILED", res.stderr || res.stdout);
      const text = res.stdout.replace(/^.*?:\s*/m, "").trim();
      return deviceAdminSuccess(command, action, { text });
    }
    case "deviceInfo": {
      const model = await shell(payload, "getprop ro.product.model");
      const release = await shell(payload, "getprop ro.build.version.release");
      const sdk = await shell(payload, "getprop ro.build.version.sdk");
      const size = await shell(payload, "wm size");
      const density = await shell(payload, "wm density");
      const w = size.stdout.match(/Physical size:\s*(\d+)x(\d+)/);
      return deviceAdminSuccess(command, action, {
        platform: "android",
        serial,
        model: model.stdout.trim(),
        osVersion: release.stdout.trim(),
        sdk: sdk.stdout.trim(),
        screenWidth: w ? Number(w[1]) : undefined,
        screenHeight: w ? Number(w[2]) : undefined,
        display: size.stdout.trim(),
        density: density.stdout.trim()
      });
    }
    case "grantPermission": {
      if (!appId) return deviceAdminFail(command, "ANDROID_APP_ID_MISSING", "appId required");
      const perm = String(payload.permission ?? "").trim();
      if (!perm) return deviceAdminFail(command, "ANDROID_PERMISSION_MISSING", "permission required");
      const res = await runAdb(serial, ["shell", "pm", "grant", appId, perm]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_GRANT_PERMISSION_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { appId, permission: perm });
    }
    case "setOrientation": {
      const orientation = String(payload.orientation ?? "portrait").toLowerCase();
      const deg = orientation.includes("land") ? 1 : 0;
      const res = await shell(payload, `settings put system user_rotation ${deg}`);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_ORIENTATION_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { orientation });
    }
    case "startScreenRecord": {
      const remote = String(payload.remotePath ?? "/sdcard/ada-screenrecord.mp4");
      screenRecordJobs.set(serial, { remote });
      const res = await shell(payload, `screenrecord --time-limit 180 ${remote} &`);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_SCREEN_RECORD_START_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { remotePath: remote, started: true });
    }
    case "stopScreenRecord": {
      await shell(payload, "pkill -l SIGINT screenrecord");
      const job = screenRecordJobs.get(serial);
      screenRecordJobs.delete(serial);
      return deviceAdminSuccess(command, action, { stopped: true, remotePath: job?.remote });
    }
    case "reboot": {
      const res = await runAdb(serial, ["reboot"]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_REBOOT_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { rebooting: true });
    }
    default:
      return deviceAdminFail(command, "DEVICE_ADMIN_UNSUPPORTED", `unsupported action: ${action}`);
  }
}
