/** iOS 自动化仅 macOS 宿主机可驱动（需 Xcode / xcrun / WDA） */
export function isIosHostSupported(): boolean {
  return process.platform === "darwin";
}
