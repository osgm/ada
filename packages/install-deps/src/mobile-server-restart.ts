import {
  androidUia2BootstrapEnabled,
  probeAndroidUia2Runtime,
  probeWdaStatus,
  wdaBootstrapEnabled
} from "@ada/runtime-probe";
import { ensureAndroidUia2Bootstrap } from "./android-uia2-bootstrap.js";
import { ensureIosWdaBootstrap } from "./ios-wda-bootstrap.js";

export interface RestartMobileServerOptions {
  force?: boolean;
  serial?: string;
  onLogLine?: (line: string) => void;
}

/** WDA 进程不可达时强制 xcodebuild 重启（需 ADA_IOS_WDA_BOOTSTRAP=true） */
export async function restartIosWdaServer(options?: RestartMobileServerOptions): Promise<boolean> {
  if (!wdaBootstrapEnabled()) return false;
  await ensureIosWdaBootstrap({ force: options?.force ?? true, onLogLine: options?.onLogLine });
  const probe = await probeWdaStatus();
  return probe.reachable;
}

/** UiAutomator2 Server 不可达时重装 APK 并 instrument 重启（需 ADA_ANDROID_UIA2_BOOTSTRAP=true） */
export async function restartAndroidUia2Server(options?: RestartMobileServerOptions): Promise<boolean> {
  if (!androidUia2BootstrapEnabled()) return false;
  await ensureAndroidUia2Bootstrap({
    force: options?.force ?? true,
    serial: options?.serial,
    onLogLine: options?.onLogLine
  });
  const probe = await probeAndroidUia2Runtime({
    serial: options?.serial,
    ensureForward: true
  });
  return probe.reachable;
}
