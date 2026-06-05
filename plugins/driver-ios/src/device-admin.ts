import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  deviceAdminFail,
  deviceAdminSuccess,
  fetchWebDriverJson,
  normalizeOrientation,
  readDeviceAdminAction
} from "@ada/driver-rpc";
import { spawn } from "node:child_process";
import path from "node:path";

type WdaFetch = (
  method: string,
  url: string,
  body?: unknown
) => Promise<Awaited<ReturnType<typeof fetchWebDriverJson>>>;

type IosAdminSession = { serverUrl: string; sessionId: string };
type IosAdminPayload = Record<string, unknown>;

const IOS_SYSTEM_PREFIXES = ["com.apple.", "com.google."];

function isIosSystemBundle(bundle: string): boolean {
  const b = String(bundle).trim();
  if (!b || !b.includes(".")) return true;
  return IOS_SYSTEM_PREFIXES.some((p) => b.startsWith(p));
}

function parseIosActiveBundles(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value
          .map((item) => {
            if (typeof item === "string") return item.trim();
            if (item && typeof item === "object") {
              const o = item as Record<string, unknown>;
              return String(o.bundleId ?? o.bundleID ?? o.id ?? "").trim();
            }
            return "";
          })
          .filter(Boolean)
      )
    ];
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.apps)) return parseIosActiveBundles(o.apps);
    return Object.keys(o).filter((k) => k.includes("."));
  }
  return [];
}

async function wdaGet(session: IosAdminSession, wdaFetch: WdaFetch, subPath: string) {
  return wdaFetch("GET", `${session.serverUrl}/session/${session.sessionId}${subPath}`);
}

async function wdaPost(session: IosAdminSession, wdaFetch: WdaFetch, subPath: string, body?: unknown) {
  return wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}${subPath}`, body);
}

async function runHostTool(bin: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => resolve({ ok: code === 0, stdout, stderr }));
    child.on("error", (e) => resolve({ ok: false, stdout: "", stderr: String(e) }));
  });
}

export async function executeIosDeviceAdmin(
  command: CommandEnvelope,
  session: IosAdminSession,
  payload: IosAdminPayload,
  wdaFetch: WdaFetch,
  tapAt: (point: [number, number]) => Promise<void>
): Promise<CommandResult> {
  const action = readDeviceAdminAction(payload);
  if (!action) return deviceAdminFail(command, "DEVICE_ADMIN_ACTION_MISSING", "payload.action required");

  const appId = String(payload.appId ?? payload.bundleId ?? "").trim();

  switch (action) {
    case "listApps": {
      const res = await wdaGet(session, wdaFetch, "/wda/apps/list");
      if (res.ok && res.value) {
        const apps = Array.isArray(res.value) ? res.value : (res.value as { apps?: unknown }).apps;
        const packages = Array.isArray(apps)
          ? apps.map((a) => (typeof a === "string" ? a : String((a as { bundleId?: string }).bundleId ?? ""))).filter(Boolean)
          : [];
        return deviceAdminSuccess(command, action, { packages, count: packages.length });
      }
      const idevice = await runHostTool("ideviceinstaller", ["-l", "-o", "list_user"]);
      if (idevice.ok) {
        const packages = idevice.stdout
          .split(/\r?\n/)
          .map((l) => l.split(",")[0]?.trim())
          .filter((p) => p && !p.startsWith("CFBundle"));
        return deviceAdminSuccess(command, action, { packages, count: packages.length, source: "ideviceinstaller" });
      }
      return deviceAdminFail(command, "IOS_LIST_APPS_UNSUPPORTED", "WDA /wda/apps/list and ideviceinstaller unavailable");
    }
    case "appInfo": {
      if (!appId) return deviceAdminFail(command, "IOS_APP_ID_MISSING", "appId required");
      const res = await runHostTool("ideviceinstaller", ["-l", "-o", "lookup", appId]);
      if (!res.ok) {
        return deviceAdminSuccess(command, action, { appId, bundleId: appId, note: "limited info without ideviceinstaller" });
      }
      return deviceAdminSuccess(command, action, { appId, bundleId: appId, raw: res.stdout.slice(0, 2000) });
    }
    case "isInstalled": {
      if (!appId) return deviceAdminFail(command, "IOS_APP_ID_MISSING", "appId required");
      const list = await executeIosDeviceAdmin(
        { ...command, command: "deviceAdmin" },
        session,
        { ...payload, action: "listApps" },
        wdaFetch,
        tapAt
      );
      if (!list.success) return list;
      const packages = (list.data?.packages as string[]) ?? [];
      return deviceAdminSuccess(command, action, { appId, installed: packages.includes(appId) });
    }
    case "installApp": {
      const localPath = path.resolve(String(payload.path ?? payload.localPath ?? ""));
      if (!localPath) return deviceAdminFail(command, "IOS_INSTALL_PATH_MISSING", "path required");
      const res = await runHostTool("ideviceinstaller", ["-i", localPath]);
      if (!res.ok) return deviceAdminFail(command, "IOS_INSTALL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { path: localPath, output: res.stdout.trim() });
    }
    case "uninstallApp": {
      if (!appId) return deviceAdminFail(command, "IOS_APP_ID_MISSING", "appId required");
      const res = await runHostTool("ideviceinstaller", ["-U", appId]);
      if (!res.ok) {
        const term = await wdaPost(session, wdaFetch, "/wda/apps/terminate", { bundleId: appId });
        if (!term.ok) return deviceAdminFail(command, "IOS_UNINSTALL_FAILED", res.stderr || res.stdout);
        return deviceAdminSuccess(command, action, { appId, terminated: true });
      }
      return deviceAdminSuccess(command, action, { appId, output: res.stdout.trim() });
    }
    case "pushFile":
    case "pullFile":
      return deviceAdminFail(
        command,
        "IOS_FILE_TRANSFER_UNSUPPORTED",
        "use host tools (ifuse/devicectl) or MCP invoke; not in deviceAdmin yet"
      );
    case "shell":
    case "hdc":
      return deviceAdminFail(command, "IOS_SHELL_UNSUPPORTED", "iOS has no adb/hdc shell; use WDA invoke");
    case "currentApp": {
      const res = await wdaFetch("GET", `${session.serverUrl}/wda/activeAppInfo`);
      if (!res.ok || !res.value) {
        return deviceAdminFail(command, "IOS_CURRENT_APP_FAILED", JSON.stringify(res.raw ?? {}));
      }
      const v = res.value as Record<string, unknown>;
      const bundleId = String(v.bundleId ?? v.bundleID ?? "");
      return deviceAdminSuccess(command, action, {
        appId: bundleId,
        package: bundleId,
        name: v.name,
        pid: v.pid
      });
    }
    case "clearAppData":
      return deviceAdminFail(command, "IOS_CLEAR_DATA_UNSUPPORTED", "reinstall app or use host tools");
    case "openUrl": {
      const url = String(payload.url ?? "").trim();
      if (!url) return deviceAdminFail(command, "IOS_URL_MISSING", "url required");
      const res = await wdaPost(session, wdaFetch, "/url", { url });
      if (!res.ok) return deviceAdminFail(command, "IOS_OPEN_URL_FAILED", JSON.stringify(res.raw ?? {}));
      return deviceAdminSuccess(command, action, { url });
    }
    case "pressKey": {
      const key = String(payload.key ?? "").toLowerCase();
      const map: Record<string, string> = {
        home: "/wda/homescreen",
        volumeup: "/wda/pressButton",
        volumedown: "/wda/pressButton"
      };
      if (key === "home") {
        const res = await wdaFetch("POST", `${session.serverUrl}/wda/homescreen`);
        if (!res.ok) return deviceAdminFail(command, "IOS_PRESS_KEY_FAILED", JSON.stringify(res.raw ?? {}));
        return deviceAdminSuccess(command, action, { key });
      }
      if (key === "volumeup" || key === "volumedown") {
        const res = await wdaPost(session, wdaFetch, "/wda/pressButton", {
          name: key === "volumeup" ? "volumeUp" : "volumeDown"
        });
        if (!res.ok) return deviceAdminFail(command, "IOS_PRESS_KEY_FAILED", JSON.stringify(res.raw ?? {}));
        return deviceAdminSuccess(command, action, { key });
      }
      return deviceAdminFail(command, "IOS_PRESS_KEY_UNSUPPORTED", `key=${key}`);
    }
    case "longPress": {
      const ms = Math.max(300, Number(payload.durationMs ?? payload.ms ?? 800));
      const sec = ms / 1000;
      const point = payload.point as [number, number] | undefined;
      const elementId = String(payload.elementId ?? "");
      if (elementId) {
        const res = await wdaPost(session, wdaFetch, `/element/${elementId}/touchAndHold`, { duration: sec });
        if (!res.ok) {
          return deviceAdminFail(command, "IOS_LONG_PRESS_FAILED", JSON.stringify(res.raw ?? {}));
        }
        return deviceAdminSuccess(command, action, { elementId, durationMs: ms });
      }
      if (point) {
        const res = await wdaPost(session, wdaFetch, "/wda/touchAndHold", { x: point[0], y: point[1], duration: sec });
        if (!res.ok) {
          await tapAt([Math.round(point[0]), Math.round(point[1])]);
          return deviceAdminSuccess(command, action, { point, durationMs: ms, fallback: "tap" });
        }
        return deviceAdminSuccess(command, action, { point, durationMs: ms });
      }
      return deviceAdminFail(command, "IOS_LONG_PRESS_TARGET", "point or elementId required");
    }
    case "setClipboard": {
      const text = String(payload.text ?? "");
      const res = await wdaPost(session, wdaFetch, "/wda/setPasteboard", { content: text });
      if (!res.ok) return deviceAdminFail(command, "IOS_SET_CLIPBOARD_FAILED", JSON.stringify(res.raw ?? {}));
      return deviceAdminSuccess(command, action, { length: text.length });
    }
    case "getClipboard": {
      const res = await wdaGet(session, wdaFetch, "/wda/getPasteboard");
      if (!res.ok) return deviceAdminFail(command, "IOS_GET_CLIPBOARD_FAILED", JSON.stringify(res.raw ?? {}));
      return deviceAdminSuccess(command, action, { text: String(res.value ?? "") });
    }
    case "deviceInfo": {
      const screen = await wdaFetch("GET", `${session.serverUrl}/wda/screen`);
      const active = await wdaFetch("GET", `${session.serverUrl}/wda/activeAppInfo`);
      return deviceAdminSuccess(command, action, {
        platform: "ios",
        screen: screen.value,
        activeApp: active.value,
        sessionId: session.sessionId
      });
    }
    case "grantPermission":
      return deviceAdminFail(command, "IOS_GRANT_PERMISSION_UNSUPPORTED", "manual or XCTest only");
    case "setOrientation": {
      const orientation = normalizeOrientation(String(payload.orientation ?? "portrait"));
      const res = await wdaPost(session, wdaFetch, "/orientation", { orientation });
      if (!res.ok) return deviceAdminFail(command, "IOS_ORIENTATION_FAILED", JSON.stringify(res.raw ?? {}));
      return deviceAdminSuccess(command, action, { orientation });
    }
    case "startScreenRecord":
    case "stopScreenRecord":
      return deviceAdminFail(command, "IOS_SCREEN_RECORD_UNSUPPORTED", "use host QuickTime/simctl for simulators");
    case "reboot":
      return deviceAdminFail(command, "IOS_REBOOT_UNSUPPORTED", "not supported via WDA");
    case "killAllApps": {
      const exclude = new Set(
        (Array.isArray(payload.excludePackages) ? payload.excludePackages : [])
          .map((x) => String(x).trim())
          .filter(Boolean)
      );
      const hits: string[] = [];
      await wdaFetch("POST", `${session.serverUrl}/wda/homescreen`).catch(() => undefined);

      let bundles: string[] = [];
      const active = await wdaFetch("GET", `${session.serverUrl}/wda/activeAppsInfo`);
      if (active.ok) {
        bundles = parseIosActiveBundles(active.value);
        hits.push("list:wda-activeAppsInfo");
      }
      if (!bundles.length) {
        const cur = await wdaFetch("GET", `${session.serverUrl}/wda/activeAppInfo`);
        if (cur.ok && cur.value) {
          const bid = String((cur.value as { bundleId?: string }).bundleId ?? "").trim();
          if (bid) bundles = [bid];
          hits.push("list:wda-activeAppInfo");
        }
      }
      bundles = [...new Set(bundles.filter((b) => !isIosSystemBundle(b) && !exclude.has(b)))];

      const killed: string[] = [];
      const failed: string[] = [];
      for (const bundleId of bundles) {
        const term = await wdaPost(session, wdaFetch, "/wda/apps/terminate", { bundleId });
        if (term.ok) killed.push(bundleId);
        else failed.push(bundleId);
      }
      await wdaFetch("POST", `${session.serverUrl}/wda/homescreen`).catch(() => undefined);

      const killedCount = killed.length;
      const failedCount = failed.length;
      const cleared = killedCount > 0;
      let businessCode: "APPS_KILLED" | "APPS_PARTIAL" | "APPS_NONE" = "APPS_NONE";
      if (cleared && failedCount === 0) businessCode = "APPS_KILLED";
      else if (cleared) businessCode = "APPS_PARTIAL";

      return deviceAdminSuccess(command, action, {
        cleared,
        businessCode,
        killedCount,
        failedCount,
        packages: killed,
        listSource: hits[0] ?? "wda-activeAppsInfo",
        hits
      });
    }
    case "wake": {
      const hits: string[] = [];
      const locked = await wdaFetch("GET", `${session.serverUrl}/wda/locked`);
      if (locked.ok && locked.value === true) {
        const unlock = await wdaFetch("POST", `${session.serverUrl}/wda/unlock`);
        if (!unlock.ok) {
          return deviceAdminFail(command, "IOS_WAKE_UNLOCK_FAILED", JSON.stringify(unlock.raw ?? {}));
        }
        hits.push("wake:unlock");
        return deviceAdminSuccess(command, action, { locked: true, unlocked: true, hits });
      }
      const screen = await wdaFetch("GET", `${session.serverUrl}/wda/screen`);
      const rect = (screen.value ?? {}) as { width?: number; height?: number };
      const w = Number(rect.width ?? payload.screenWidth ?? 390);
      const h = Number(rect.height ?? payload.screenHeight ?? 844);
      const tap = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/wda/tap/0`, {
        x: Math.round(w / 2),
        y: Math.round(h / 2)
      });
      if (!tap.ok) {
        const home = await wdaFetch("POST", `${session.serverUrl}/wda/homescreen`);
        if (!home.ok) return deviceAdminFail(command, "IOS_WAKE_FAILED", JSON.stringify(tap.raw ?? {}));
        hits.push("wake:homescreen-fallback");
        return deviceAdminSuccess(command, action, { locked: false, fallback: "homescreen", hits });
      }
      hits.push("wake:tap-center");
      return deviceAdminSuccess(command, action, { locked: false, tapped: true, hits });
    }
    default:
      return deviceAdminFail(command, "DEVICE_ADMIN_UNSUPPORTED", `unsupported action: ${action}`);
  }
}
