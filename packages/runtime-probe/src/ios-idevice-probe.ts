import { commandExists } from "./runtime-probe.js";

export function ideviceBootstrapEnabled(): boolean {
  const raw = process.env.ADA_IOS_IDEVICE_BOOTSTRAP?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function probeIosIdeviceRuntime(): Promise<{
  hostSupported: boolean;
  ideviceinstallerOk: boolean;
  brewOnPath: boolean;
  detail: string;
  installHint: string;
}> {
  if (process.platform !== "darwin") {
    return {
      hostSupported: false,
      ideviceinstallerOk: false,
      brewOnPath: false,
      detail: "ideviceinstaller requires macOS host",
      installHint: ""
    };
  }

  const ideviceinstallerOk = await commandExists("ideviceinstaller");
  const brewOnPath = await commandExists("brew");

  if (ideviceinstallerOk) {
    return {
      hostSupported: true,
      ideviceinstallerOk: true,
      brewOnPath,
      detail: "ideviceinstaller on PATH",
      installHint: ""
    };
  }

  const installHint = brewOnPath
    ? "brew install libimobiledevice ideviceinstaller (or MCP --install-deps=ios|all on macOS)"
    : "install Homebrew, then: brew install libimobiledevice ideviceinstaller (or --install-deps=ios|all)";

  return {
    hostSupported: true,
    ideviceinstallerOk: false,
    brewOnPath,
    detail:
      "ideviceinstaller not on PATH (optional for WDA UI automation; needed for deviceAdmin installApp/listApps)",
    installHint
  };
}
