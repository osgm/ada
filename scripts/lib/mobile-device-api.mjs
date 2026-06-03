/**
 * 移动设备管理 API（P0–P2）— 统一走 deviceAdmin 命令
 * @param {"android"|"harmony"|"ios"} _platform
 * @param {(command: string, extra?: object) => Promise<Record<string, unknown>>} runData
 */
export function createDeviceAdminApi(_platform, runData) {
  const admin = (action, extra = {}) => runData("deviceAdmin", { action, ...extra });

  return {
    /** @alias listApps */
    appList: (opts = {}) => admin("listApps", opts),
    listApps: (opts = {}) => admin("listApps", opts),
    /** @alias appInfo */
    app: (appId) => admin("appInfo", { appId }),
    appInfo: (appId) => admin("appInfo", { appId }),
    isInstalled: (appId) => admin("isInstalled", { appId }),
    install: (apkOrPath) => admin("installApp", { path: apkOrPath }),
    uninstall: (appId) => admin("uninstallApp", { appId }),
    push: (localPath, remotePath) => admin("pushFile", { localPath, remotePath }),
    pull: (remotePath, localPath) => admin("pullFile", { remotePath, localPath }),
    shell: (command) => admin("shell", { command }),
    hdc: (command) => admin("hdc", { command }),
    currentApp: () => admin("currentApp"),
    clearAppData: (appId) => admin("clearAppData", { appId }),
    openDeepLink: (url) => admin("openUrl", { url }),
    openUrl: (url) => admin("openUrl", { url }),
    pressKey: (key) => admin("pressKey", { key }),
    /**
     * @param {[number, number] | import('./ada-fluent.mjs').ElementHandle} target 像素坐标或元素（元素暂未支持）
     * @param {number} [ms]
     */
    longPress: async (target, ms = 800) => {
      if (Array.isArray(target) && target.length === 2) {
        return admin("longPress", { point: target, durationMs: ms });
      }
      throw new Error("longPress: 请传入 [x, y] 像素坐标");
    },
    setClipboard: (text) => admin("setClipboard", { text }),
    getClipboard: () => admin("getClipboard"),
    deviceInfo: () => admin("deviceInfo"),
    grantPermission: (appId, permission) => admin("grantPermission", { appId, permission }),
    setOrientation: (orientation) => admin("setOrientation", { orientation }),
    startScreenRecord: (remotePath) => admin("startScreenRecord", { remotePath }),
    stopScreenRecord: () => admin("stopScreenRecord"),
    reboot: () => admin("reboot")
  };
}
