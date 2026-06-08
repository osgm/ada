/** @deprecated import from `@ada/install-deps` — kept for ada-agent package.json export stability */
export type {
  InstallDepsParseResult,
  McpBootstrapStatus,
  RunBootstrapInstallDepsOptions
} from "@ada/install-deps";
export {
  awaitBootstrapInstallDeps,
  getBootstrapInstallPromise,
  getMcpBootstrapStatus,
  isBootstrapInstallActive,
  parseInstallDepsSpec,
  previewBootstrapInstallPlan,
  resolveBootstrapInstallDeps,
  runBootstrapInstallDeps,
  scheduleBootstrapInstallDeps,
  setBootstrapLogEmitter
} from "@ada/install-deps";
