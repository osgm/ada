import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { deviceAdminFail, deviceAdminSuccess, readDeviceAdminAction, raceCommandTimeout } from "@ada/driver-rpc";
import fs from "node:fs/promises";
import path from "node:path";

type HarmonyAdminDriver = {
  shell(cmd: string, timeout?: number): Promise<string>;
  hdc(cmd: string, timeout?: number): Promise<string>;
  swipe(startX: number, startY: number, endX: number, endY: number, speed?: number): Promise<void>;
  getInstalledApps?(extraOptions?: string): Promise<string[]>;
  startApp(bundleName: string, abilityName?: string): Promise<void>;
  stopApp(bundleName: string): Promise<void>;
};

export type HarmonyAdminPayload = Record<string, unknown> & {
  appId?: string;
  path?: string;
  localPath?: string;
  remotePath?: string;
  command?: string;
  url?: string;
  key?: string | number;
  permission?: string;
  orientation?: string;
  text?: string;
  userOnly?: boolean;
  point?: [number, number];
  durationMs?: number;
  ms?: number;
};

function deviceSn(payload: HarmonyAdminPayload): string {
  const caps = (payload.capabilities ?? {}) as Record<string, unknown>;
  return String(caps.deviceSn ?? caps.udid ?? caps["ada:udid"] ?? process.env.ADA_HARMONY_DEVICE_SN ?? "").trim();
}

function adminTimeoutMs(payload: HarmonyAdminPayload, fallback: number): number {
  const raw = payload.commandTimeoutMs;
  return typeof raw === "number" && raw > 0 ? Math.min(raw, fallback * 3) : fallback;
}

async function runShell(driver: HarmonyAdminDriver, payload: HarmonyAdminPayload, cmd: string): Promise<string> {
  const ms = adminTimeoutMs(payload, 15_000);
  return raceCommandTimeout(driver.shell(cmd, ms), ms, "harmony.shell");
}

async function runHdc(driver: HarmonyAdminDriver, payload: HarmonyAdminPayload, cmd: string): Promise<string> {
  const ms = adminTimeoutMs(payload, 20_000);
  return raceCommandTimeout(driver.hdc(cmd, ms), ms, "harmony.hdc");
}

export async function executeHarmonyDeviceAdmin(
  command: CommandEnvelope,
  driver: HarmonyAdminDriver,
  payload: HarmonyAdminPayload
): Promise<CommandResult> {
  const action = readDeviceAdminAction(payload);
  if (!action) return deviceAdminFail(command, "DEVICE_ADMIN_ACTION_MISSING", "payload.action required");

  const appId = String(payload.appId ?? "").trim();
  const sn = deviceSn(payload);

  try {
    switch (action) {
      case "listApps": {
        if (typeof driver.getInstalledApps !== "function") {
          return deviceAdminFail(command, "HARMONY_LIST_APPS_UNSUPPORTED", "getInstalledApps not available");
        }
        const packages = await driver.getInstalledApps("");
        return deviceAdminSuccess(command, action, { packages, count: packages.length });
      }
      case "appInfo": {
        if (!appId) return deviceAdminFail(command, "HARMONY_APP_ID_MISSING", "appId required");
        const out = await runShell(driver, payload, `bm dump -n ${appId}`);
        const versionName = out.match(/versionName\s*[:=]\s*([^\s]+)/i)?.[1];
        const versionCode = out.match(/versionCode\s*[:=]\s*(\d+)/i)?.[1];
        return deviceAdminSuccess(command, action, {
          appId,
          package: appId,
          versionName: versionName ?? null,
          versionCode: versionCode ? Number(versionCode) : null,
          raw: out.slice(0, 2000)
        });
      }
      case "isInstalled": {
        if (!appId) return deviceAdminFail(command, "HARMONY_APP_ID_MISSING", "appId required");
        if (typeof driver.getInstalledApps === "function") {
          const packages = await driver.getInstalledApps("");
          const installed = packages.includes(appId);
          return deviceAdminSuccess(command, action, { appId, installed });
        }
        const out = await runShell(driver, payload, `bm dump -n ${appId}`);
        const installed = !/error|not found|fail/i.test(out);
        return deviceAdminSuccess(command, action, { appId, installed });
      }
      case "installApp": {
        const localPath = path.resolve(String(payload.path ?? payload.localPath ?? ""));
        if (!localPath) return deviceAdminFail(command, "HARMONY_INSTALL_PATH_MISSING", "path required");
        const remote = `/data/local/tmp/${path.basename(localPath)}`;
        if (sn) {
          await runHdc(driver, payload, `file send "${localPath}" "${remote}"`);
        }
        const out = await runShell(driver, payload, `bm install -p ${remote}`);
        return deviceAdminSuccess(command, action, { path: localPath, remote, output: out });
      }
      case "uninstallApp": {
        if (!appId) return deviceAdminFail(command, "HARMONY_APP_ID_MISSING", "appId required");
        const out = await runShell(driver, payload, `bm uninstall -n ${appId}`);
        return deviceAdminSuccess(command, action, { appId, output: out });
      }
      case "pushFile": {
        const localPath = path.resolve(String(payload.localPath ?? payload.path ?? ""));
        const remotePath = String(payload.remotePath ?? "").trim();
        if (!localPath || !remotePath) {
          return deviceAdminFail(command, "HARMONY_PUSH_PATHS_MISSING", "localPath and remotePath required");
        }
        const hdcCmd = sn
          ? `file send "${localPath}" "${remotePath}"`
          : `file send "${localPath}" "${remotePath}"`;
        await runHdc(driver, payload, hdcCmd);
        return deviceAdminSuccess(command, action, { localPath, remotePath });
      }
      case "pullFile": {
        const localPath = path.resolve(String(payload.localPath ?? payload.path ?? ""));
        const remotePath = String(payload.remotePath ?? "").trim();
        if (!localPath || !remotePath) {
          return deviceAdminFail(command, "HARMONY_PULL_PATHS_MISSING", "localPath and remotePath required");
        }
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await runHdc(driver, payload, `file recv "${remotePath}" "${localPath}"`);
        return deviceAdminSuccess(command, action, { localPath, remotePath });
      }
      case "shell": {
        const cmd = String(payload.command ?? "").trim();
        if (!cmd) return deviceAdminFail(command, "HARMONY_SHELL_COMMAND_MISSING", "command required");
        const output = await runShell(driver, payload, cmd);
        return deviceAdminSuccess(command, action, { output });
      }
      case "hdc": {
        const cmd = String(payload.command ?? "").trim();
        if (!cmd) return deviceAdminFail(command, "HARMONY_HDC_COMMAND_MISSING", "command required");
        const output = await runHdc(driver, payload, cmd);
        return deviceAdminSuccess(command, action, { output });
      }
      case "currentApp": {
        const out = await runShell(driver, payload, "hidumper -s WindowManagerService -a -a");
        const bundle = out.match(/bundleName[=:]\s*([^\s,;]+)/i)?.[1] ?? out.match(/focus.*?([a-z][a-z0-9_.]+)/i)?.[1];
        if (!bundle) return deviceAdminFail(command, "HARMONY_CURRENT_APP_UNKNOWN", "could not parse foreground bundle");
        return deviceAdminSuccess(command, action, { appId: bundle, package: bundle });
      }
      case "clearAppData": {
        if (!appId) return deviceAdminFail(command, "HARMONY_APP_ID_MISSING", "appId required");
        const out = await runShell(driver, payload, `bm clean -n ${appId}`);
        return deviceAdminSuccess(command, action, { appId, cleared: true, output: out });
      }
      case "openUrl": {
        const url = String(payload.url ?? "").trim();
        if (!url) return deviceAdminFail(command, "HARMONY_URL_MISSING", "url required");
        const out = await runShell(driver, payload, `aa start -U '${url.replace(/'/g, "'\\''")}'`);
        return deviceAdminSuccess(command, action, { url, output: out });
      }
      case "pressKey": {
        const key = String(payload.key ?? payload.keyCode ?? "Home");
        const out = await runShell(driver, payload, `uitest uiInput keyEvent ${key}`);
        return deviceAdminSuccess(command, action, { key, output: out });
      }
      case "longPress": {
        const ms = Math.max(300, Number(payload.durationMs ?? payload.ms ?? 800));
        const point = payload.point as [number, number] | undefined;
        if (!point || point.length !== 2) {
          return deviceAdminFail(command, "HARMONY_LONG_PRESS_POINT", "longPress requires payload.point [x,y]");
        }
        const [x, y] = point;
        await driver.swipe(x, y, x, y, ms);
        return deviceAdminSuccess(command, action, { point: [Math.round(x), Math.round(y)], durationMs: ms });
      }
      case "setClipboard":
        return deviceAdminFail(command, "HARMONY_CLIPBOARD_UNSUPPORTED", "use shell/hdc or type() after focus");
      case "getClipboard":
        return deviceAdminFail(command, "HARMONY_CLIPBOARD_UNSUPPORTED", "not available via deviceAdmin");
      case "deviceInfo": {
        const model = await runShell(driver, payload, "param get const.product.model").catch(() => "");
        const ver = await runShell(driver, payload, "param get const.os.fullname").catch(() => "");
        const size = await runShell(driver, payload, "wm size").catch(() => "");
        const w = size.match(/(\d+)\s*[xX]\s*(\d+)/);
        return deviceAdminSuccess(command, action, {
          platform: "harmony",
          deviceSn: sn || undefined,
          model: model.trim(),
          osVersion: ver.trim(),
          screenWidth: w ? Number(w[1]) : undefined,
          screenHeight: w ? Number(w[2]) : undefined,
          display: size.trim()
        });
      }
      case "grantPermission":
        return deviceAdminFail(command, "HARMONY_GRANT_PERMISSION_UNSUPPORTED", "use shell aa/bm if needed");
      case "setOrientation": {
        const orientation = String(payload.orientation ?? "portrait").toLowerCase();
        const out = await runShell(
          driver,
          payload,
          orientation.includes("land") ? "uitest uiInput rotate 90" : "uitest uiInput rotate 0"
        ).catch(() => "");
        return deviceAdminSuccess(command, action, { orientation, output: out });
      }
      case "startScreenRecord":
        return deviceAdminFail(command, "HARMONY_SCREEN_RECORD_UNSUPPORTED", "not implemented");
      case "stopScreenRecord":
        return deviceAdminFail(command, "HARMONY_SCREEN_RECORD_UNSUPPORTED", "not implemented");
      case "reboot": {
        await runHdc(driver, payload, "target boot");
        return deviceAdminSuccess(command, action, { rebooting: true });
      }
      default:
        return deviceAdminFail(command, "DEVICE_ADMIN_UNSUPPORTED", `unsupported action: ${action}`);
    }
  } catch (error) {
    return deviceAdminFail(
      command,
      "HARMONY_DEVICE_ADMIN_FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}
