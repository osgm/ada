import { spawn } from "node:child_process";

import fs from "node:fs/promises";

import path from "node:path";

import {

  commandExists,

  ideviceBootstrapEnabled,

  probeIosIdeviceRuntime

} from "@ada/runtime-probe";

import type { DriverInstallOutcome } from "./install-summary.js";

import { ensureIosLibimobiledeviceInToolsDir } from "./ios-libimobiledevice-install.js";

import { resolveDefaultToolsDir } from "./tools-paths.js";

import type { InstallDepsConfig } from "./types.js";



function shouldUseShell(command: string): boolean {

  return process.platform === "win32" && !command.includes("/") && !command.includes("\\");

}



async function runCommand(command: string, args: string[], onLogLine?: (line: string) => void): Promise<void> {

  onLogLine?.(`[ios-idevice] ${command} ${args.join(" ")}`);

  await new Promise<void>((resolve, reject) => {

    const child = spawn(command, args, {

      stdio: "ignore",

      shell: shouldUseShell(command),

      env: process.env,

      ...(process.platform === "win32" ? { windowsHide: true } : {})

    });

    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exit=${code}`))));

    child.on("error", reject);

  });

}



export interface EnsureIosIdeviceOptions {

  force?: boolean;

  onLogLine?: (line: string) => void;

  /** install-deps scope=ios|all：自动 brew 安装，无需 ADA_IOS_IDEVICE_BOOTSTRAP */

  scopeInstall?: boolean;

  config?: InstallDepsConfig;

}



function ideviceBootstrapAllowed(options?: EnsureIosIdeviceOptions): boolean {

  return ideviceBootstrapEnabled() || options?.scopeInstall === true;

}



/** macOS：brew 安装；Windows：自动下载 libimobiledevice-win32 到 tools/libimobiledevice */

export async function ensureIosIdeviceBootstrap(options?: EnsureIosIdeviceOptions): Promise<{

  outcome: DriverInstallOutcome;

}> {

  const onLogLine = options?.onLogLine;

  const artifact: DriverInstallOutcome = {

    id: "ios-idevice",

    status: "skipped",

    detail: "bootstrap disabled"

  };



  if (process.platform !== "darwin" && process.platform !== "win32") {

    artifact.status = "missing";

    artifact.detail = "idevice bootstrap requires macOS or Windows host";

    return { outcome: artifact };

  }



  if (process.platform === "win32") {

    if (!ideviceBootstrapAllowed(options)) {

      artifact.detail = "bootstrap disabled (use --install-deps=ios|all)";

      return { outcome: artifact };

    }

    const relativeDir = options?.config?.dependencies?.toolsDir?.trim() || "tools";

    const toolsDir = (await resolveDefaultToolsDir({ relativeDir })) ?? null;

    if (!toolsDir) {

      artifact.status = "missing";

      artifact.detail = "tools dir unresolved";

      return { outcome: artifact };

    }

    const config: InstallDepsConfig = options?.config ?? {
      dependencies: {
        autoInstallOnStart: false,
        playwrightBrowser: "chromium",
        playwrightInstallTargets: ["chromium"],
        playwrightDownloadHost: "",
        npmRegistryCandidates: [],
        playwrightHostCandidates: [],
        toolsDir: relativeDir
      }
    };

    const installOutcome = await ensureIosLibimobiledeviceInToolsDir(toolsDir, config, onLogLine, {

      force: options?.force

    });

    const probe = await probeIosIdeviceRuntime();

    if (installOutcome.status === "installed") {

      return { outcome: installOutcome };

    }

    if (probe.detail.includes("idevice_id + iproxy")) {

      return { outcome: { id: "ios-idevice", status: "skipped", detail: probe.detail } };

    }

    artifact.status = installOutcome.status === "skipped" ? "skipped" : "missing";

    artifact.detail = probe.installHint ? `${probe.detail}; ${probe.installHint}` : probe.detail;

    if (artifact.status === "missing") {

      onLogLine?.(`[ios-idevice][warn] ${artifact.detail}`);

    }

    return { outcome: artifact };

  }



  const probe = await probeIosIdeviceRuntime();

  if (probe.ideviceinstallerOk && probe.afcclientOk && !options?.force) {

    artifact.detail = probe.detail;

    return { outcome: artifact };

  }



  if (!ideviceBootstrapAllowed(options)) {

    artifact.detail = `bootstrap disabled (use --install-deps=ios|all or ADA_IOS_IDEVICE_BOOTSTRAP=true); ${probe.installHint || probe.detail}`;

    artifact.status = "missing";

    return { outcome: artifact };

  }



  if (!(await commandExists("brew"))) {

    artifact.status = "missing";

    artifact.detail = probe.installHint || "Homebrew not on PATH";

    onLogLine?.(`[ios-idevice][warn] ${artifact.detail}`);

    return { outcome: artifact };

  }



  try {

    const useHead = ["1", "true", "yes"].includes(

      (process.env.ADA_IOS_LIBIMOBILEDEVICE_HEAD ?? "").trim().toLowerCase()

    );

    if (useHead) {

      await runCommand("brew", ["install", "--HEAD", "libimobiledevice"], onLogLine);

      await runCommand("brew", ["install", "ideviceinstaller"], onLogLine);

    } else {

      await runCommand("brew", ["install", "libimobiledevice", "ideviceinstaller"], onLogLine);

    }

    const after = await probeIosIdeviceRuntime();

    if (after.ideviceinstallerOk && after.afcclientOk) {

      artifact.status = "installed";

      artifact.detail = "libimobiledevice installed via Homebrew (ideviceinstaller + afcclient)";

    } else {

      artifact.status = "missing";

      artifact.detail = "brew install finished but libimobiledevice tools still incomplete on PATH";

      if (useHead) {

        artifact.detail += "; try ADA_IOS_LIBIMOBILEDEVICE_HEAD=1 if Xcode pairing fails";

      }

    }

  } catch (error) {

    artifact.status = "missing";

    artifact.detail = error instanceof Error ? error.message : String(error);

    onLogLine?.(`[ios-idevice][warn] ${artifact.detail}`);

  }



  return { outcome: artifact };

}


