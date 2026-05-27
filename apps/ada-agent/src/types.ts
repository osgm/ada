export type TransportMode = "stream" | "http" | "auto";
export type StreamProtocol = "websocket" | "grpc";
export type SecretProvider = "auto" | "keychain" | "credman" | "file";
export type SetupMode = "auto" | "cli" | "gui";

export interface AgentConfig {
  agent: {
    id: string;
    mode: "foreground" | "daemon";
    setupOnFirstRun: boolean;
  };
  bootstrapUI: {
    enabled: boolean;
    mode: SetupMode;
    host: string;
    port: number;
    autoOpenBrowser: boolean;
    sessionTtlSec: number;
    secretsProvider: SecretProvider;
    native: {
      enabled: boolean;
      command: string;
      args: string[];
      timeoutMs: number;
      fallbackToWeb: boolean;
    };
  };
  transport: {
    mode: TransportMode;
    streamProtocol: StreamProtocol;
    requestPath?: string;
    healthPath?: string;
    streamPath?: string;
    requestTimeoutMs?: number;
  };
  graphics: {
    enabled: boolean;
    fallbackOnSemanticFailure: boolean;
    minConfidence: number;
  };
  monitoring: {
    enabled: boolean;
    platforms: Array<"web" | "android" | "ios" | "harmony">;
    sampleEvery: number;
    outputDir: string;
    onFailureOnly: boolean;
    groupBySession: boolean;
    nonBlocking: boolean;
    resolution: {
      maxWidth: number;
      maxHeight: number;
      keepAspectRatio: boolean;
    };
  };
  queue: {
    inboxDir: string;
    processedDir: string;
    failedDir: string;
    pollIntervalMs: number;
    maxFileRetryAttempts: number;
  };
  dependencies: {
    autoInstallOnStart: boolean;
    playwrightBrowser: "chromium" | "firefox" | "webkit" | "all";
    playwrightInstallTargets: Array<"chromium" | "chrome" | "msedge" | "firefox" | "webkit" | "all">;
    playwrightDownloadHost: string;
    npmRegistryCandidates: string[];
    playwrightHostCandidates: string[];
    /** 原生 WebDriver 存放目录，默认 `dirver` */
    nativeDriversDir?: string;
    /** geckodriver 版本：如 `0.36.0`、`latest` */
    geckodriverVersion?: string;
    /** chromedriver 主版本：如 `137`、`135`、`latest`、`match-chrome` */
    chromedriverVersion?: string;
    /** HarmonyOS 工具目录（含 hdc），相对工作区，默认 `tools` */
    toolsDir?: string;
    /** 可选：自动下载 hdc 的候选 URL（仅 harmony/all 依赖安装时使用） */
    harmonyHdcDownloadUrls?: string[];
  };
  appium: {
    serverUrl: string;
    requiredDrivers: Array<"uiautomator2" | "xcuitest">;
  };
}

export interface BootstrapDependencyFields {
  /** 启动 Agent 时是否自动执行依赖检测与安装 */
  autoInstallOnStart?: boolean;
  /** Playwright 浏览器包（多选），如 chromium、chrome、firefox、webkit、msedge、all */
  playwrightInstallTargets?: string[];
  /** Playwright 浏览器下载镜像（CDN），留空则用配置文件默认值 */
  playwrightDownloadHost?: string;
  /** 保存向导后立即执行依赖安装并在页面显示日志 */
  runDependencyInstallNow?: boolean;
  /** Appium Server 地址（可选覆盖） */
  appiumServerUrl?: string;
  /** 依赖安装范围：all/playwright/mobile/android/ios/harmony/appium/drivers */
  dependencyInstallScope?: "all" | "playwright" | "mobile" | "android" | "ios" | "harmony" | "appium" | "drivers";
  /** 连接控制面请求超时（毫秒，写入 transport.requestTimeoutMs） */
  requestTimeoutMs?: number;
  /** 可选：启用语义截图回退（graphics.enabled） */
  graphicsEnabled?: boolean;
  /** 可选：启用监控采样（monitoring.enabled） */
  monitoringEnabled?: boolean;
}

export interface BootstrapInput {
  serverUrl: string;
  tenant: string;
  environment: string;
  authType: "token" | "device_code";
  token?: string;
  transportMode: TransportMode;
  streamProtocol: StreamProtocol;
  deviceTags: string[];
  dependencies?: BootstrapDependencyFields;
}

export interface SecretRecord {
  serverUrl: string;
  tenant: string;
  environment: string;
  authType: "token" | "device_code";
  token?: string;
  updatedAt: string;
}
