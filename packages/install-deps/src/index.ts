export type { InstallDepsConfig, InstallDepsDependenciesConfig } from "./types.js";
export {
  ensureDriverDependencies,
  getDependencyHealth,
  invalidateDependencyHealthCache,
  type GetDependencyHealthOptions,
  applyPersistedDownloadProbeFromState,
  type InstallScope,
  type InstallSummary,
  type EnsureInstallOptions
} from "./dependency-installer.js";
export {
  legacyDepsStateFileCandidates,
  resolveDepsInstallRoot,
  resolveDepsStateFilePath,
  resolveDepsStateFilePathSync,
  resolveGlobalAdaHome,
  resolveGlobalAdaHomeSync,
  resolveInstallContextCwd,
  resolvePlaywrightBrowsersPath,
  resolveWorkspaceRoot,
  ensureDepsInstallWorkspace
} from "./deps-install-paths.js";
export {
  ensurePackageResolution,
  getPackageSource,
  getSharedDepsRoot,
  isPackageAvailable,
  depsRequire,
  type PackageSource,
  type ResolvedPackage
} from "./deps-resolution.js";
export {
  applyAdaToolsToProcessEnv,
  probeHdc,
  resolveDefaultToolsDir,
  type AdaToolsResolution
} from "./tools-paths.js";
export { detectBestRegistry, registryCandidateList } from "./registry-probe.js";
export {
  InstallDriverTracker,
  mergeInstallSummaries,
  formatInstallSummaryText,
  formatInstallDepsResponse,
  driverArtifactLabel,
  resolveRequestedDriverArtifacts,
  type DriverArtifactId,
  type DriverInstallOutcome,
  type DriverInstallStatus,
  type InstallSummaryLike
} from "./install-summary.js";
export { installPlaywrightBrowsers, detectBestPlaywrightDownloadHost } from "./playwright-browser-install.js";
export { ensureHarmonyHdcForConfig } from "./harmony-hdc-install.js";
export { ensureAndroidUia2Bootstrap } from "./android-uia2-bootstrap.js";
export { ensureIosWdaBootstrap } from "./ios-wda-bootstrap.js";
export { restartAndroidUia2Server, restartIosWdaServer } from "./mobile-server-restart.js";
export { probeHarmonyRuntime } from "./harmony-runtime-probe.js";
export { probeRuntimesForTasks, type TaskRuntimeProbe } from "./task-runtime-probe.js";
