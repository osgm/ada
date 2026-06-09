import { commandExists } from "./runtime-probe.js";
import { resolveIdeviceIdCommand, resolveIproxyCommand } from "./ios-iproxy.js";

export function ideviceBootstrapEnabled(): boolean {
  const raw = process.env.ADA_IOS_IDEVICE_BOOTSTRAP?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function windowsLibimobiledeviceHint(): string {
  return "run install-deps --only=ios (auto-downloads libimobiledevice-win32 to ~/.ada/tools/libimobiledevice)";
}

export async function probeIosIdeviceRuntime(): Promise<{
  hostSupported: boolean;
  ideviceinstallerOk: boolean;
  afcclientOk: boolean;
  brewOnPath: boolean;
  detail: string;
  installHint: string;
}> {
  if (process.platform === "win32") {
    const ideviceIdOk = Boolean(await resolveIdeviceIdCommand());
    const iproxyOk = Boolean(await resolveIproxyCommand());
    const ideviceinstallerOk = await commandExists("ideviceinstaller");
    const afcclientOk = await commandExists("afcclient");
    if (ideviceIdOk && iproxyOk) {
      const parts: string[] = ["libimobiledevice USB tools on PATH (idevice_id + iproxy)"];
      if (!ideviceinstallerOk) parts.push("ideviceinstaller optional (installApp/listApps)");
      if (!afcclientOk) parts.push("afcclient optional (pushFile/pullFile)");
      return {
        hostSupported: true,
        ideviceinstallerOk,
        afcclientOk,
        brewOnPath: false,
        detail: parts.join("; "),
        installHint: ""
      };
    }
    const missing: string[] = [];
    if (!ideviceIdOk) missing.push("idevice_id missing");
    if (!iproxyOk) missing.push("iproxy missing");
    return {
      hostSupported: true,
      ideviceinstallerOk,
      afcclientOk,
      brewOnPath: false,
      detail: missing.join("; "),
      installHint: windowsLibimobiledeviceHint()
    };
  }

  if (process.platform !== "darwin") {
    return {
      hostSupported: false,
      ideviceinstallerOk: false,
      afcclientOk: false,
      brewOnPath: false,
      detail: "libimobiledevice tools require macOS or Windows host",
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
