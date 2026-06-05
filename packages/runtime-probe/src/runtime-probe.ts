import net from "node:net";

import { spawn } from "node:child_process";

import { isIosIproxyHostSupported, probeIosWdaRuntime } from "./ios-iproxy.js";



export async function commandExists(command: string): Promise<boolean> {

  return new Promise((resolve) => {

    const checker = process.platform === "win32" ? "where" : "which";

    const child = spawn(checker, [command], {

      stdio: "ignore",

      shell: process.platform === "win32"

    });

    child.on("exit", (code) => resolve(code === 0));

    child.on("error", () => resolve(false));

  });

}



function runCommandCapture(command: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {

  return new Promise((resolve) => {

    const child = spawn(command, args, {

      stdio: ["ignore", "pipe", "pipe"],

      shell: process.platform === "win32",

      ...(process.platform === "win32" ? { windowsHide: true } : {})

    });

    let stdout = "";

    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {

      stdout += chunk.toString("utf8");

    });

    child.stderr?.on("data", (chunk: Buffer) => {

      stderr += chunk.toString("utf8");

    });

    child.on("exit", (code) => resolve({ code, stdout, stderr }));

    child.on("error", () => resolve({ code: 1, stdout, stderr }));

  });

}



/** adb 是否在 PATH 且至少有一台 device 状态设备 */

export async function probeAndroidRuntime(): Promise<{

  adbOnPath: boolean;

  deviceConnected: boolean;

  detail: string;

}> {

  const adbOnPath = await commandExists("adb");

  if (!adbOnPath) {

    return { adbOnPath: false, deviceConnected: false, detail: "adb not found in PATH" };

  }

  const { code, stdout, stderr } = await runCommandCapture("adb", ["devices"]);

  if (code !== 0) {

    return {

      adbOnPath: true,

      deviceConnected: false,

      detail: `adb devices failed: ${stderr.trim() || stdout.trim() || `exit ${code}`}`

    };

  }

  const lines = stdout.split(/\r?\n/).slice(1);

  const connected = lines.some((line) => {

    const t = line.trim();

    if (!t || t.startsWith("*")) return false;

    return /\bdevice\b/i.test(t) && !/\boffline\b/i.test(t);

  });

  return {

    adbOnPath: true,

    deviceConnected: connected,

    detail: connected ? "adb device connected" : "no adb device in 'device' state"

  };

}



export async function isTcpPortOpen(host: string, port: number, timeoutMs = 2000): Promise<boolean> {

  return new Promise((resolve) => {

    const socket = net.connect({ host, port });

    const done = (ok: boolean) => {

      socket.removeAllListeners();

      socket.destroy();

      resolve(ok);

    };

    socket.once("connect", () => done(true));

    socket.once("error", () => done(false));

    socket.setTimeout(timeoutMs, () => done(false));

  });

}



export type IosRuntimeProbe = {

  hostSupported: boolean;

  xcrunOk: boolean;

  wdaReachable: boolean;

  wdaUrl: string;

  detail: string;

  ready: boolean;

};



function defaultWdaUrl(): string {

  return (process.env.ADA_WDA_SERVER_URL?.trim() || "http://127.0.0.1:8100").replace(/\/$/, "");

}



/** iOS：macOS(xcrun+WDA) 或 Windows USB(iproxy+WDA)；真机自动 iproxy */

export async function probeIosRuntime(): Promise<IosRuntimeProbe> {

  const wdaUrlDefault = defaultWdaUrl();



  if (!isIosIproxyHostSupported()) {

    return {

      hostSupported: false,

      xcrunOk: false,

      wdaReachable: false,

      wdaUrl: wdaUrlDefault,

      detail: "iOS requires macOS or Windows host",

      ready: false

    };

  }



  if (process.platform === "win32") {

    const ideviceIdOk = await commandExists("idevice_id");

    const iproxyOk = await commandExists("iproxy");

    const hasUdidEnv = Boolean(process.env.ADA_IOS_DEVICE_UDID?.trim());

    if (!ideviceIdOk && !hasUdidEnv) {

      return {

        hostSupported: true,

        xcrunOk: false,

        wdaReachable: false,

        wdaUrl: wdaUrlDefault,

        detail: "idevice_id not found (run install-deps --only=ios or connect iPhone via USB)",

        ready: false

      };

    }

    if (!iproxyOk && !["1", "true", "yes"].includes((process.env.ADA_IOS_IPROXY_DISABLED ?? "").trim().toLowerCase())) {

      return {

        hostSupported: true,

        xcrunOk: false,

        wdaReachable: false,

        wdaUrl: wdaUrlDefault,

        detail: "iproxy not found (run install-deps --only=ios on Windows)",

        ready: false

      };

    }

    const wda = await probeIosWdaRuntime({ ensureForward: true });

    const wdaReachable = wda.reachable || wda.ready;

    return {

      hostSupported: true,

      xcrunOk: false,

      wdaReachable,

      wdaUrl: wda.wdaUrl,

      detail: wda.detail,

      ready: wdaReachable

    };

  }



  const xcrunOk = await commandExists("xcrun");

  if (!xcrunOk) {

    return {

      hostSupported: true,

      xcrunOk: false,

      wdaReachable: false,

      wdaUrl: wdaUrlDefault,

      detail: "xcrun not found",

      ready: false

    };

  }

  const wda = await probeIosWdaRuntime({ ensureForward: true });

  const wdaReachable = wda.reachable || wda.ready;

  return {

    hostSupported: true,

    xcrunOk: true,

    wdaReachable,

    wdaUrl: wda.wdaUrl,

    detail: wda.detail,

    ready: xcrunOk && wdaReachable

  };

}


