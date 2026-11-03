import {
  probeAndroidRuntime,
  probeAndroidUia2Runtime,
  probeIosIdeviceRuntime,
  probeIosWdaRuntime
} from "@ada/runtime-probe";
import type { InstallDriverTracker } from "./install-summary.js";
import { isIosHostSupported } from "./platform-support.js";

type MobileProbeScope = "all" | "playwright" | "mobile" | "android" | "ios" | "harmony" | "drivers";

/** Android / iOS 运行时探测（安装后的 readiness 提示，不改包）。 */
export async function probeMobileRuntimes(
  only: MobileProbeScope,
  tracker: InstallDriverTracker,
  onLogLine?: (line: string) => void
): Promise<void> {
  const checkAndroid = only === "all" || only === "mobile" || only === "android" || only === "drivers";
  const checkIos =
    isIosHostSupported() &&
    (only === "all" || only === "mobile" || only === "ios" || only === "drivers");
  if (checkAndroid) {
    const android = await probeAndroidRuntime();
    tracker.record({
      id: "android-adb",
      status: android.adbOnPath && android.deviceConnected ? "skipped" : "missing",
      detail: android.detail
    });
    onLogLine?.(
      android.adbOnPath && android.deviceConnected
        ? `[mobile] ${android.detail}`
        : `[mobile][warn] ${android.detail}`
    );
    if (!android.adbOnPath) {
      tracker.record({
        id: "android-uia2",
        status: "missing",
        detail: "adb not on PATH"
      });
    } else if (!android.deviceConnected) {
      tracker.record({
        id: "android-uia2",
        status: "skipped",
        detail: "no adb device; UIA2 deferred until device connected"
      });
      onLogLine?.("[mobile] UIA2 probe skipped (no adb device)");
    } else {
      const uia2 = await probeAndroidUia2Runtime({ ensureForward: true });
      tracker.record({
        id: "android-uia2",
        status: uia2.reachable ? "skipped" : "missing",
        detail: uia2.detail
      });
      onLogLine?.(uia2.reachable ? `[mobile] ${uia2.detail}` : `[mobile][warn] ${uia2.detail}`);
    }
  }
  if (checkIos) {
    const wda = await probeIosWdaRuntime({ ensureForward: true });
    const ready = wda.ready || (wda.reachable && wda.forwarded);
    tracker.record({
      id: "ios-xcrun",
      status: process.platform === "darwin" || process.platform === "win32" ? "skipped" : "missing",
      detail:
        process.platform === "darwin"
          ? "macOS host"
          : process.platform === "win32"
            ? "Windows USB host (no xcrun; WDA must be preinstalled on device)"
            : "iOS requires macOS or Windows host"
    });
    tracker.record({
      id: "ios-wda",
      status: wda.ready ? "skipped" : "missing",
      detail: wda.detail
    });
    const idevice = await probeIosIdeviceRuntime();
    tracker.record({
      id: "ios-idevice",
      status: idevice.ideviceinstallerOk && idevice.afcclientOk ? "skipped" : "missing",
      detail: idevice.detail
    });
    onLogLine?.(ready ? `[mobile] ${wda.detail}` : `[mobile][warn] ${wda.detail}`);
    if ((!idevice.ideviceinstallerOk || !idevice.afcclientOk) && idevice.installHint) {
      onLogLine?.(`[ios][hint] ${idevice.installHint}`);
    }
  }
}
