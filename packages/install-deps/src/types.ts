/** install-deps 所需配置（与 AgentConfig.dependencies 对齐，避免依赖 apps/ada-agent） */
export interface InstallDepsDependenciesConfig {
  autoInstallOnStart: boolean;
  playwrightBrowser: "chromium" | "firefox" | "webkit" | "all";
  playwrightInstallTargets: Array<"chromium" | "chrome" | "msedge" | "firefox" | "webkit" | "all">;
  playwrightDownloadHost: string;
  npmRegistryCandidates: string[];
  playwrightHostCandidates: string[];
  toolsDir?: string;
  harmonyHdcDownloadUrls?: string[];
  iosLibimobiledeviceDownloadUrls?: string[];
}

export interface InstallDepsConfig {
  dependencies: InstallDepsDependenciesConfig;
}
