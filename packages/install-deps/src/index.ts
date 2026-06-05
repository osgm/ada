export type { InstallDepsConfig, InstallDepsDependenciesConfig } from "./types.js";
export {
  depsLogLine,
  localizeAdaLogLine,
  resolveAdaLogLocale,
  useEnglishAdaLogs,
  wrapInstallDepsLogEmitter
} from "./log-locale.js";
export {
  emitBootstrapPhaseProgress,
  emitInstallProgress,
  getLatestInstallProgress,
  registerInstallProgressSink,
  tryEmitProgressFromLogLine,
  type AdaInstallProgressEvent,
  type InstallProgressPhase,
  type InstallProgressStatus
} from "./install-progress.js";
export {
  ensureDriverDependencies,
  getDependencyHealth,
  invalidateDependencyHealthCache,
  isInstallScopeComplete,
  getPackagesReadiness,
  type GetDependencyHealthOptions,
  applyPersistedDownloadProbeFromState,
  ensureStandaloneMcpProbeSeed,
  type InstallScope,
  type InstallSummary,
  type EnsureInstallOptions
} from "./dependency-installer.js";
export {
  legacyAdaAgentDataCandidates,
  legacyDepsStateFileCandidates,
  resolveDepsInstallRoot,
  resolveDepsStateFilePath,
  resolveDepsStateFilePathSync,
  resolveAgentEffectiveConfigPathSync,
  resolveDeviceRegistryPathSync,
  ensureGlobalAdaHome,
  resolveGlobalAdaHome,
  resolveGlobalAdaHomeSync,
  resolveInstallContextCwd,
  resolvePlaywrightHostFilePathSync,
  resolvePlaywrightBrowsersPath,
  resolveWorkspaceRoot,
  ensureDepsInstallWorkspace,
  type ResolvePlaywrightBrowsersPathOptions
} from "./deps-install-paths.js";
export {
  discoverPlaywrightBrowsersPath,
  inspectPlaywrightBrowsersDir,
  isPlaywrightBrowsersAutoDiscoverEnabled,
  listPlaywrightBrowsersCandidateDirs,
  playwrightBrowsersDirHasChromium,
  type PlaywrightBrowsersDirInfo
} from "./playwright-browsers-discovery.js";
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
  normalizeToolsRelativeSegment,
  joinWorkspaceToolsDir,
  isFilesystemRootToolsDir,
  resolveAdaHomeToolsDir,
  resolveSafeToolsDirForWrite,
  type AdaToolsResolution
} from "./tools-paths.js";
export { detectBestRegistry, registryCandidateList } from "./registry-probe.js";
export {
  resolveDefaultPlaywrightDownloadHost,
  shouldProbeNpmRegistry,
  shouldProbePlaywrightCdn
} from "./download-probe-persist.js";
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
export { ensureIosIdeviceBootstrap } from "./ios-idevice-bootstrap.js";
export { isIosHostSupported, isIosFullInstallScope } from "./platform-support.js";
export { restartAndroidUia2Server, restartIosWdaServer } from "./mobile-server-restart.js";
export { probeHarmonyRuntime } from "./harmony-runtime-probe.js";
export { probeRuntimesForTasks, type TaskRuntimeProbe } from "./task-runtime-probe.js";
