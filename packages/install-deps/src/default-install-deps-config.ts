import {
  DEFAULT_NPM_REGISTRY_CANDIDATES,
  DEFAULT_PLAYWRIGHT_HOST_CANDIDATES
} from "@ada/download-probe";
import type { InstallDepsConfig } from "./types.js";

export const DEFAULT_INSTALL_DEPS_CONFIG: InstallDepsConfig = {
  dependencies: {
    autoInstallOnStart: true,
    playwrightBrowser: "chromium",
    playwrightInstallTargets: ["chromium"],
    playwrightDownloadHost: DEFAULT_PLAYWRIGHT_HOST_CANDIDATES[0],
    npmRegistryCandidates: [...DEFAULT_NPM_REGISTRY_CANDIDATES],
    playwrightHostCandidates: [...DEFAULT_PLAYWRIGHT_HOST_CANDIDATES],
    toolsDir: "tools"
  }
};
