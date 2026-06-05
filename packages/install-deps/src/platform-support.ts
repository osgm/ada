/** iOS USB 真机控制：macOS 或 Windows + libimobiledevice（方案 C） */
export function isIosUsbHostSupported(): boolean {
  return process.platform === "darwin" || process.platform === "win32";
}

/** WDA xcodebuild bootstrap 仅 macOS */
export function isIosWdaBootstrapSupported(): boolean {
  return process.platform === "darwin";
}

/** iOS 自动化宿主机（含 Windows USB 方案 C） */
export function isIosHostSupported(): boolean {
  return isIosUsbHostSupported();
}

/** install-deps scope 为 ios/all 时自动 bootstrap WDA + ideviceinstaller（macOS；Windows 仅探测） */
export function isIosFullInstallScope(only: string): boolean {
  return only === "ios" || only === "all";
}
