import type { CommandEnvelope, CommandResult } from "@ada/contracts";

/** deviceAdmin 子命令（P0–P2） */
export const DEVICE_ADMIN_ACTIONS = [
  "listApps",
  "appInfo",
  "isInstalled",
  "installApp",
  "uninstallApp",
  "pushFile",
  "pullFile",
  "shell",
  "hdc",
  "currentApp",
  "clearAppData",
  "openUrl",
  "pressKey",
  "longPress",
  "setClipboard",
  "getClipboard",
  "deviceInfo",
  "grantPermission",
  "setOrientation",
  "startScreenRecord",
  "stopScreenRecord",
  "reboot",
  "killAllApps",
  "wake"
] as const;

export type DeviceAdminAction = (typeof DEVICE_ADMIN_ACTIONS)[number];

export function readDeviceAdminAction(payload: Record<string, unknown>): DeviceAdminAction | null {
  const raw = String(payload.action ?? "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const aliases: Record<string, DeviceAdminAction> = {
    listapps: "listApps",
    applist: "listApps",
    app: "appInfo",
    appinfo: "appInfo",
    isinstalled: "isInstalled",
    install: "installApp",
    uninstall: "uninstallApp",
    push: "pushFile",
    pull: "pullFile",
    opendeeplink: "openUrl",
    opendeepink: "openUrl",
    presskey: "pressKey",
    longpress: "longPress",
    setclipboard: "setClipboard",
    getclipboard: "getClipboard",
    deviceinfo: "deviceInfo",
    grantpermission: "grantPermission",
    setorientation: "setOrientation",
    startscreenrecord: "startScreenRecord",
    stopscreenrecord: "stopScreenRecord",
    clearappdata: "clearAppData",
    currentapp: "currentApp",
    killallapps: "killAllApps",
    killall: "killAllApps",
    wake: "wake",
    wakeup: "wake"
  };
  if ((DEVICE_ADMIN_ACTIONS as readonly string[]).includes(raw)) return raw as DeviceAdminAction;
  return aliases[lower] ?? null;
}

export function deviceAdminSuccess(
  command: CommandEnvelope,
  action: DeviceAdminAction,
  value: Record<string, unknown>
): CommandResult {
  return {
    requestId: command.requestId,
    success: true,
    data: { command: "deviceAdmin", action, ...value }
  };
}

export function deviceAdminFail(
  command: CommandEnvelope,
  code: string,
  message: string
): CommandResult {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}

export function parsePackageList(stdout: string, userOnly?: boolean): string[] {
  const out: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^package:(\S+)/);
    if (m?.[1]) out.push(m[1]);
  }
  if (!userOnly) return [...new Set(out)];
  return [...new Set(out.filter((p) => !p.startsWith("com.android.") && p !== "android"))];
}

export function parseAndroidAppInfo(stdout: string, appId: string): Record<string, unknown> {
  const versionName = stdout.match(/versionName=([^\s]+)/)?.[1];
  const versionCode = stdout.match(/versionCode=(\d+)/)?.[1];
  const enabled = !/enabled=0/.test(stdout) && /enabled=1/.test(stdout);
  return {
    appId,
    package: appId,
    versionName: versionName ?? null,
    versionCode: versionCode ? Number(versionCode) : null,
    enabled
  };
}

export function parseAndroidCurrentApp(stdout: string): Record<string, unknown> | null {
  const focus =
    stdout.match(/mCurrentFocus=Window\{[^}]+\s+([^\s/]+)\/([^\s}]+)/) ??
    stdout.match(/mFocusedApp=ActivityRecord\{[^}]+\s+([^\s/]+)\/([^\s}]+)/);
  if (!focus) return null;
  return { package: focus[1], activity: focus[2], appId: focus[1] };
}

export function normalizeOrientation(input: string): "PORTRAIT" | "LANDSCAPE" {
  const v = input.trim().toLowerCase();
  if (v === "landscape" || v === "landscapeleft" || v === "landscaperight" || v === "horizontal") {
    return "LANDSCAPE";
  }
  return "PORTRAIT";
}
