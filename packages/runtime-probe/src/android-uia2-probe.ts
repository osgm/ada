import { spawn } from "node:child_process";

export function defaultUia2ServerUrl(): string {
  return (process.env.ADA_ANDROID_UIA2_SERVER_URL?.trim() || "http://127.0.0.1:8200").replace(/\/$/, "");
}

export function defaultUia2LocalPort(): number {
  const fromEnv = Number(process.env.ADA_ANDROID_UIA2_LOCAL_PORT ?? "8200");
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 8200;
}

export function defaultUia2DevicePort(): number {
  const fromEnv = Number(process.env.ADA_ANDROID_UIA2_DEVICE_PORT ?? "6790");
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 6790;
}

export function runAdbCapture(
  serial: string,
  args: string[],
  pipeStdout = false
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const adbArgs = serial ? ["-s", serial, ...args] : args;
  return new Promise((resolve) => {
    const child = spawn("adb", adbArgs, {
      stdio: pipeStdout ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "pipe"],
      shell: false,
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("exit", (code) => resolve({ ok: code === 0, stdout: out, stderr: err }));
    child.on("error", (error) => resolve({ ok: false, stdout: "", stderr: String(error) }));
  });
}

export async function resolveAndroidDeviceSerial(preferred?: string): Promise<string> {
  const serial = preferred?.trim() || process.env.ADA_ANDROID_DEVICE_SN?.trim() || "";
  if (serial) return serial;
  const listed = await runAdbCapture("", ["devices"]);
  if (!listed.ok) return "";
  for (const line of listed.stdout.split(/\r?\n/).slice(1)) {
    const t = line.trim();
    if (!t || t.startsWith("*")) continue;
    const parts = t.split(/\s+/);
    if (parts.length >= 2 && parts[1] === "device") return parts[0];
  }
  return "";
}

export async function fetchMobileStatus(url: string, timeoutMs = 3000): Promise<{ ok: boolean; body?: Record<string, unknown> }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url.replace(/\/$/, "")}/status`, { signal: controller.signal });
    clearTimeout(timer);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, body };
  } catch {
    return { ok: false };
  }
}

export function androidUia2BootstrapEnabled(): boolean {
  const raw = process.env.ADA_ANDROID_UIA2_BOOTSTRAP?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** UiAutomator2 / Appium server HTTP 是否可达（需已 adb forward 或独立 Server） */
export async function probeAndroidUia2Runtime(options?: {
  serverUrl?: string;
  serial?: string;
  ensureForward?: boolean;
}): Promise<{
  serverUrl: string;
  reachable: boolean;
  forwarded: boolean;
  detail: string;
  status?: Record<string, unknown>;
}> {
  const serverUrl = (options?.serverUrl ?? defaultUia2ServerUrl()).replace(/\/$/, "");
  let forwarded = false;
  if (options?.ensureForward !== false) {
    const serial = await resolveAndroidDeviceSerial(options?.serial);
    if (serial) {
      const localPort = defaultUia2LocalPort();
      const devicePort = defaultUia2DevicePort();
      const fwd = await runAdbCapture(serial, ["forward", `tcp:${localPort}`, `tcp:${devicePort}`]);
      forwarded = fwd.ok;
    }
  }
  const status = await fetchMobileStatus(serverUrl);
  const reachable = status.ok;
  let detail = reachable ? `UIA2 reachable at ${serverUrl}` : `UIA2 not reachable at ${serverUrl}`;
  if (forwarded && !reachable) {
    detail += " (adb forward applied; server may not be running on device)";
  }
  return {
    serverUrl,
    reachable,
    forwarded,
    detail,
    status: status.body
  };
}

/** WDA /status 详情（比 TCP 探针多一层 ready 语义） */
export async function probeWdaStatus(serverUrl?: string): Promise<{
  wdaUrl: string;
  reachable: boolean;
  ready: boolean;
  detail: string;
  status?: Record<string, unknown>;
}> {
  const wdaUrl = (serverUrl ?? (process.env.ADA_WDA_SERVER_URL?.trim() || "http://127.0.0.1:8100")).replace(/\/$/, "");
  const status = await fetchMobileStatus(wdaUrl);
  const value = (status.body?.value ?? status.body) as Record<string, unknown> | undefined;
  const ready = Boolean(status.ok && (value?.ready === true || value?.state === "success" || status.ok));
  return {
    wdaUrl,
    reachable: status.ok,
    ready,
    detail: status.ok ? `WDA reachable at ${wdaUrl}` : `WDA not reachable at ${wdaUrl}`,
    status: status.body
  };
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  options?: { attempts?: number; delayMs?: number; shouldRetry?: (error: unknown) => boolean }
): Promise<T> {
  const attempts = Math.max(1, options?.attempts ?? 3);
  const delayMs = Math.max(0, options?.delayMs ?? 400);
  const shouldRetry = options?.shouldRetry ?? (() => true);
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i >= attempts - 1 || !shouldRetry(error)) break;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}
