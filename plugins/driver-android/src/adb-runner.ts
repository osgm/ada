import { spawn } from "node:child_process";

export type AdbRunResult = { ok: boolean; stdout: string; stderr: string };

const serialQueues = new Map<string, Promise<AdbRunResult>>();

function queueKey(serial: string): string {
  return serial.trim() || "__default__";
}

/** Serialize adb invocations per device to reduce spawn storms and race conditions. */
function runQueued<T>(serial: string, task: () => Promise<T>): Promise<T> {
  const key = queueKey(serial);
  const prev = serialQueues.get(key) ?? Promise.resolve({ ok: true, stdout: "", stderr: "" });
  const next = prev.catch(() => undefined).then(task);
  serialQueues.set(
    key,
    next.then(
      () => ({ ok: true, stdout: "", stderr: "" }),
      () => ({ ok: false, stdout: "", stderr: "" })
    )
  );
  return next;
}

async function spawnAdb(serial: string, args: string[], pipeStdout = false): Promise<AdbRunResult> {
  const adbArgs = serial ? ["-s", serial, ...args] : args;
  return new Promise((resolve) => {
    const child = spawn("adb", adbArgs, {
      stdio: pipeStdout ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "pipe"],
      shell: false,
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      err += c.toString("utf8");
    });
    child.on("exit", (code) => resolve({ ok: code === 0, stdout: out, stderr: err }));
    child.on("error", (error) => resolve({ ok: false, stdout: "", stderr: String(error) }));
  });
}

export async function runAdb(serial: string, args: string[], pipeStdout = false): Promise<AdbRunResult> {
  return runQueued(serial, () => spawnAdb(serial, args, pipeStdout));
}
