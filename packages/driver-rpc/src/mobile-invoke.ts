import type { CommandEnvelope, CommandResult, InvokePayload } from "@ada/contracts";

export function isHttpServerUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Resolve WebDriver/WDA relative path against base URL and optional session id. */
export function resolveMobileHttpPath(baseUrl: string, path: string, sessionId?: string): string {
  const trimmed = path.trim();
  if (isHttpServerUrl(trimmed)) {
    return trimmed;
  }
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  let resolved = normalizedPath;
  if (sessionId) {
    resolved = resolved.replace(/\{sessionId\}/g, sessionId);
    const globalPrefixes = ["/wda/", "/status", "/health"];
    const isGlobal = globalPrefixes.some((prefix) => resolved.startsWith(prefix));
    if (!isGlobal && !resolved.includes("/session/")) {
      resolved = `/session/${sessionId}${resolved}`;
    }
  }
  return `${baseUrl.replace(/\/$/, "")}${resolved}`;
}

export interface WebDriverJsonResponse {
  ok: boolean;
  status: number;
  value?: unknown;
  raw?: Record<string, unknown>;
  text?: string;
}

export async function fetchWebDriverJson(
  method: string,
  url: string,
  body?: unknown
): Promise<WebDriverJsonResponse> {
  const upper = method.toUpperCase();
  const hasBody = body !== undefined && upper !== "GET" && upper !== "HEAD";
  try {
    const res = await fetch(url, {
      method: upper,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined
    });
    const text = await res.text().catch(() => "");
    let raw: Record<string, unknown> = {};
    if (text) {
      try {
        raw = JSON.parse(text) as Record<string, unknown>;
      } catch {
        raw = { raw: text };
      }
    }
    return { ok: res.ok, status: res.status, value: raw.value, raw, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, value: undefined, raw: {}, text: message };
  }
}

export function extractWebDriverElementId(value: unknown): string | null {
  const record = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const elementId = record["element-6066-11e4-a52e-4f735466cecf"] ?? record.ELEMENT;
  return typeof elementId === "string" ? elementId : null;
}

/** Detect WDA / UIA2 HTTP server unreachable (process down / port closed). */
export function shouldRecoverMobileServer(res: WebDriverJsonResponse): boolean {
  if (res.status === 0) return true;
  if (res.status === 502 || res.status === 503 || res.status === 504) return true;
  const blob = `${res.text ?? ""}`.toLowerCase();
  return (
    blob.includes("econnrefused") ||
    blob.includes("connection refused") ||
    blob.includes("fetch failed") ||
    blob.includes("network") ||
    blob.includes("socket hang up") ||
    blob.includes("econnreset") ||
    blob.includes("enotfound")
  );
}

/** Detect stale / invalid WebDriver session responses (WDA / UiAutomator2). */
export function shouldRecoverWebDriverSession(res: WebDriverJsonResponse): boolean {
  if (shouldRecoverMobileServer(res)) return false;
  if (res.status === 404) return true;
  const blob = `${res.text ?? ""} ${JSON.stringify(res.raw ?? {})}`.toLowerCase();
  return (
    blob.includes("invalid session") ||
    blob.includes("session does not exist") ||
    blob.includes("session not created") ||
    blob.includes("no such session")
  );
}

export async function withMobileHttpRecovery(
  attempt: () => Promise<WebDriverJsonResponse>,
  opts: {
    recoverSession: () => Promise<void>;
    restartServer?: () => Promise<boolean>;
    restartCooldownMs?: number;
    lastServerRestartAt?: { value: number };
  }
): Promise<WebDriverJsonResponse> {
  let res = await attempt();
  const cooldown = opts.restartCooldownMs ?? 30_000;
  const canRestart =
    !opts.lastServerRestartAt || Date.now() - opts.lastServerRestartAt.value >= cooldown;
  if (opts.restartServer && shouldRecoverMobileServer(res) && canRestart) {
    const restarted = await opts.restartServer();
    if (restarted) {
      if (opts.lastServerRestartAt) opts.lastServerRestartAt.value = Date.now();
      res = await attempt();
    }
  }
  if (shouldRecoverWebDriverSession(res)) {
    await opts.recoverSession();
    res = await attempt();
  }
  return res;
}

export async function withWebDriverSessionRecovery<T>(
  attempt: () => Promise<T>,
  shouldRecover: (result: T) => boolean,
  recover: () => Promise<void>
): Promise<T> {
  let result = await attempt();
  if (!shouldRecover(result)) return result;
  await recover();
  return attempt();
}

function invokeFail(command: CommandEnvelope, code: string, message: string): CommandResult {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}

function safeJson(value: unknown): unknown {
  if (value === undefined) return { __undefined: true };
  if (value === null || typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export interface MobileHttpInvokeOptions {
  baseUrl: string;
  sessionId?: string;
  invoke: NonNullable<InvokePayload["http"]> & { method: string; path: string };
  driver: string;
  platform: string;
  recoverSession?: () => Promise<void>;
  restartServer?: () => Promise<boolean>;
  restartCooldownMs?: number;
  lastServerRestartAt?: { value: number };
}

/** HTTP invoke passthrough for WDA / UiAutomator2 / Appium-compatible servers. */
export async function executeMobileHttpInvoke(command: CommandEnvelope, opts: MobileHttpInvokeOptions): Promise<CommandResult> {
  let requestUrl = resolveMobileHttpPath(opts.baseUrl, opts.invoke.path, opts.sessionId);
  const res = await withMobileHttpRecovery(
    () => {
      requestUrl = resolveMobileHttpPath(opts.baseUrl, opts.invoke.path, opts.sessionId);
      return fetchWebDriverJson(opts.invoke.method, requestUrl, opts.invoke.body);
    },
    {
      recoverSession: async () => {
        await opts.recoverSession?.();
      },
      restartServer: opts.restartServer,
      restartCooldownMs: opts.restartCooldownMs,
      lastServerRestartAt: opts.lastServerRestartAt
    }
  );
  if (!res.ok) {
    const detail = res.text || JSON.stringify(res.raw ?? {});
    return invokeFail(command, "INVOKE_HTTP_FAILED", `HTTP ${res.status} ${requestUrl}: ${detail}`);
  }
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: opts.driver,
      platform: opts.platform,
      command: "invoke",
      mode: "real",
      rpcMode: "http",
      http: { method: opts.invoke.method, path: opts.invoke.path, url: requestUrl },
      status: res.status,
      value: safeJson(res.value ?? res.raw)
    }
  };
}

export type AdbRunner = (
  serial: string,
  args: string[],
  pipeStdout?: boolean
) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

/** Method invoke for adb-backed Android when no UIA2 HTTP server is configured. */
export async function executeAndroidMethodInvoke(
  command: CommandEnvelope,
  opts: {
    serial: string;
    invoke: { target?: string; method: string; args?: unknown[] };
    runAdb: AdbRunner;
    dumpHierarchy?: () => Promise<string>;
  }
): Promise<CommandResult> {
  const target = (opts.invoke.target ?? "adb").toLowerCase();
  if (target !== "adb" && target !== "device" && target !== "session") {
    return invokeFail(command, "INVOKE_TARGET_UNSUPPORTED", `unsupported invoke target: ${target}`);
  }
  const method = opts.invoke.method;
  const args = Array.isArray(opts.invoke.args) ? opts.invoke.args : [];

  try {
    if (method === "shell") {
      const cmd = String(args[0] ?? "");
      if (!cmd) return invokeFail(command, "INVOKE_INVALID_ARGS", "adb.shell requires args[0] command string");
      const shellArgs = args.slice(1).map(String);
      const res = await opts.runAdb(opts.serial, ["shell", cmd, ...shellArgs]);
      if (!res.ok) return invokeFail(command, "INVOKE_ADB_FAILED", res.stderr || "adb shell failed");
      return methodSuccess(command, target, method, { stdout: res.stdout.trim(), stderr: res.stderr.trim() });
    }
    if (method === "tap") {
      const x = Number(args[0]);
      const y = Number(args[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return invokeFail(command, "INVOKE_INVALID_ARGS", "adb.tap requires args [x, y]");
      }
      const res = await opts.runAdb(opts.serial, ["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))]);
      if (!res.ok) return invokeFail(command, "INVOKE_ADB_FAILED", res.stderr || "adb tap failed");
      return methodSuccess(command, target, method, { tapped: [x, y] });
    }
    if (method === "swipe") {
      const [x1, y1, x2, y2, durationMs = 300] = args.map(Number);
      if (![x1, y1, x2, y2].every(Number.isFinite)) {
        return invokeFail(command, "INVOKE_INVALID_ARGS", "adb.swipe requires args [x1,y1,x2,y2,durationMs?]");
      }
      const res = await opts.runAdb(opts.serial, [
        "shell",
        "input",
        "swipe",
        String(Math.round(x1)),
        String(Math.round(y1)),
        String(Math.round(x2)),
        String(Math.round(y2)),
        String(Math.round(durationMs) || 300)
      ]);
      if (!res.ok) return invokeFail(command, "INVOKE_ADB_FAILED", res.stderr || "adb swipe failed");
      return methodSuccess(command, target, method, { from: [x1, y1], to: [x2, y2] });
    }
    if (method === "dumpHierarchy") {
      if (!opts.dumpHierarchy) {
        return invokeFail(command, "INVOKE_METHOD_NOT_FOUND", "dumpHierarchy not available");
      }
      const xml = await opts.dumpHierarchy();
      return methodSuccess(command, target, method, { xml });
    }
    if (method === "getState") {
      const res = await opts.runAdb(opts.serial, ["get-state"]);
      if (!res.ok) return invokeFail(command, "INVOKE_ADB_FAILED", res.stderr || "adb get-state failed");
      return methodSuccess(command, target, method, { state: res.stdout.trim() });
    }
    if (method === "screenshot") {
      const res = await opts.runAdb(opts.serial, ["exec-out", "screencap", "-p"], true);
      if (!res.ok || !res.stdout) return invokeFail(command, "INVOKE_ADB_FAILED", res.stderr || "screencap failed");
      return methodSuccess(command, target, method, {
        encoding: "base64",
        data: Buffer.from(res.stdout, "binary").toString("base64")
      });
    }
    return invokeFail(command, "INVOKE_METHOD_NOT_FOUND", `Method not found: ${target}.${method}`);
  } catch (error) {
    return invokeFail(command, "INVOKE_FAILED", error instanceof Error ? error.message : String(error));
  }
}

function methodSuccess(command: CommandEnvelope, target: string, method: string, value: unknown): CommandResult {
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "android",
      platform: "android",
      command: "invoke",
      mode: "real",
      rpcMode: "method",
      target,
      method,
      value: safeJson(value)
    }
  };
}
