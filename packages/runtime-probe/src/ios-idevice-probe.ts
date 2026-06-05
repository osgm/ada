import { commandExists } from "./runtime-probe.js";

export function ideviceBootstrapEnabled(): boolean {
  const raw = process.env.ADA_IOS_IDEVICE_BOOTSTRAP?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function probeIosIdeviceRuntime(): Promise<{
  hostSupported: boolean;
  ideviceinstallerOk: boolean;
  afcclientOk: boolean;
  brewOnPath: boolean;
  detail: string;
  installHint: string;
}> {
  if (process.platform !== "darwin") {
    return {
      hostSupported: false,
      ideviceinstallerOk: false,
      afcclientOk: false,
      brewOnPath: false,
      detail: "libimobiledevice tools require macOS host",
      installHint: ""
    };
  }

  const ideviceinstallerOk = await commandExists("ideviceinstaller");
  const afcclientOk = await commandExists("afcclient");
  const brewOnPath = await commandExists("brew");

  if (ideviceinstallerOk && afcclientOk) {
    return {
      hostSupported: true,
      ideviceinstallerOk: true,
      afcclientOk: true,
      brewOnPath,
      detail: "libimobiledevice on PATH (ideviceinstaller + afcclient)",
      installHint: ""
    };
  }

  const installHint = brewOnPath
    ? "brew install libimobiledevice ideviceinstaller (or MCP --install-deps=ios|all on macOS)"
    : "install Homebrew, then: brew install libimobiledevice ideviceinstaller (or --install-deps=ios|all)";

  const parts: string[] = [];
  if (!ideviceinstallerOk) parts.push("ideviceinstaller missing (installApp/listApps)");
  if (!afcclientOk) parts.push("afcclient missing (pushFile/pullFile)");

  return {
    hostSupported: true,
    ideviceinstallerOk,
    afcclientOk,
    brewOnPath,
    detail: parts.length ? parts.join("; ") : "libimobiledevice tools not on PATH",
    installHint
  };
}
