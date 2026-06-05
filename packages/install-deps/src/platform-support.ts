/** iOS 自动化仅 macOS 宿主机可驱动（需 Xcode / xcrun / WDA） */
export function isIosHostSupported(): boolean {
  return process.platform === "darwin";
}

/** install-deps scope 为 ios/all 时自动 bootstrap WDA + ideviceinstaller（无需 ADA_IOS_*_BOOTSTRAP） */
export function isIosFullInstallScope(only: string): boolean {
  return only === "ios" || only === "all";
}
