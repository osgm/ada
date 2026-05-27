import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import { normalizeInvokePayload, serializeRpcResult } from "@ada/driver-rpc";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const commandPathCache = new Map<string, string | null>();

function resolveCommandPath(command: string): string | null {
  if (path.isAbsolute(command)) {
    return command;
  }
  if (commandPathCache.has(command)) {
    return commandPathCache.get(command) ?? null;
  }
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(checker, [command], {
    encoding: "utf8",
    shell: false,
    ...(process.platform === "win32" ? { windowsHide: true } : {})
  });
  const text = String(result.stdout ?? "");
  const resolved = text
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .find(Boolean);
  commandPathCache.set(command, resolved ?? null);
  return resolved ?? null;
}

function resolveAppiumNodeEntrypoint(): string | null {
  const candidates = [
    path.join(process.cwd(), "node_modules", "appium", "build", "lib", "main.js"),
    path.join(process.cwd(), "..", "node_modules", "appium", "build", "lib", "main.js"),
    path.join(process.cwd(), "..", "..", "node_modules", "appium", "build", "lib", "main.js")
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }
  return null;
}

async function runCommandCapture(
  command: string,
  args: string[]
): Promise<{ ok: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
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

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ ok: true, output: out.trim() });
        return;
      }
      resolve({
        ok: false,
        error: err.trim() || out.trim() || `${command} ${args.join(" ")} exited with ${code}`
      });
    });
    child.on("error", (error) => {
      resolve({ ok: false, error: String(error) });
    });
  });
}

async function runAppiumVersionProbe(): Promise<{ ok: boolean; output?: string; error?: string }> {
  const candidates: Array<{ cmd: string; args: string[] }> = [];
  const appiumPath = resolveCommandPath("appium");
  if (appiumPath) {
    candidates.push({ cmd: appiumPath, args: ["--version"] });
  }
  const nodeCmd = process.execPath;
  const nodeEntry = resolveAppiumNodeEntrypoint();
  if (nodeEntry) {
    candidates.push({ cmd: nodeCmd, args: [nodeEntry, "--version"] });
  }
  const errors: string[] = [];
  for (const candidate of candidates) {
    const result = await runCommandCapture(candidate.cmd, candidate.args);
    if (result.ok) {
      return result;
    }
    errors.push(`${candidate.cmd} ${candidate.args.join(" ")} => ${result.error ?? "unknown error"}`);
  }
  return { ok: false, error: errors.join("; ") };
}

interface RealAppiumPayload {
  real?: boolean;
  mock?: boolean;
  serverUrl?: string;
  capabilities?: Record<string, unknown>;
  point?: [number, number];
  from?: [number, number];
  to?: [number, number];
  text?: string;
  elementId?: string;
  screenshotPath?: string;
  locator?: {
    id?: string;
    accessibilityId?: string;
    xpath?: string;
    uiautomator?: string;
  };
  timeoutMs?: number;
  expectedText?: string;
  appId?: string;
  bundleId?: string;
  custom?: {
    method?: string;
    path?: string;
    body?: Record<string, unknown>;
  };
  action?: string;
  keepSession?: boolean;
}

interface CachedRealSession {
  cacheKey: string;
  sessionId: string;
  serverUrl: string;
  lastUsedAt: number;
}

const REAL_SESSION_TTL_MS = 2 * 60 * 1000;
const REAL_SESSION_MAX = 8;
const realSessionCache = new Map<string, CachedRealSession>();

function formatSessionCreateError(raw: unknown): string {
  const text = JSON.stringify(raw);
  if (text.toLowerCase().includes("device unauthorized")) {
    return "Android device unauthorized. Please unlock phone and accept the USB debugging authorization dialog, then retry.";
  }
  if (text.includes("Neither ANDROID_HOME nor ANDROID_SDK_ROOT")) {
    return "Android SDK env missing. Please set ANDROID_HOME / ANDROID_SDK_ROOT before starting Appium.";
  }
  return `Failed to create Appium session: ${text}`;
}

function normalizeServerUrl(url?: string): string {
  return (url ?? "http://127.0.0.1:4723").replace(/\/$/, "");
}

async function requestJson(
  method: string,
  url: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; value?: any; raw?: any }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    value: (raw as any).value,
    raw
  };
}

function toCustomValueText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          const pkg = rec.packageName ?? rec.appPackage ?? rec.package;
          if (typeof pkg === "string" && pkg.trim()) {
            return pkg.trim();
          }
          return JSON.stringify(item);
        }
        return String(item ?? "");
      })
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value ?? "");
}

function asNumberPoint(input?: [number, number]): [number, number] | null {
  if (!input || input.length !== 2) {
    return null;
  }
  const [x, y] = input;
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  return [x, y];
}

async function createRemoteSession(
  command: CommandEnvelope,
  payload: RealAppiumPayload
): Promise<{ sessionId: string; serverUrl: string } | { error: string }> {
  try {
    const serverUrl = normalizeServerUrl(payload.serverUrl);
    const capabilities = stableCapabilities(payload, command);
    const result = await requestJson("POST", `${serverUrl}/session`, {
      capabilities: { alwaysMatch: capabilities, firstMatch: [{}] }
    });
    if (!result.ok || !result.value?.sessionId) {
      return { error: formatSessionCreateError(result.raw) };
    }
    return { sessionId: result.value.sessionId as string, serverUrl };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function deleteRemoteSession(serverUrl: string, sessionId: string): Promise<void> {
  await requestJson("DELETE", `${serverUrl}/session/${sessionId}`);
}

function mergeAndroidLightweightCaps(
  caps: Record<string, unknown>,
  payload: RealAppiumPayload
): Record<string, unknown> {
  if (process.platform !== "win32") {
    return caps;
  }
  const lightweight =
    process.env.ADA_APPIUM_LIGHTWEIGHT_ANDROID === "1" ||
    process.env.ADA_APPIUM_SKIP_DEVICE_INIT === "1" ||
    payload.capabilities?.["appium:skipDeviceInitialization"] === true ||
    caps["appium:skipDeviceInitialization"] === true;
  if (!lightweight) {
    return caps;
  }
  return {
    ...caps,
    "appium:skipDeviceInitialization":
      caps["appium:skipDeviceInitialization"] ?? payload.capabilities?.["appium:skipDeviceInitialization"] ?? true,
    "appium:skipServerInstallation":
      caps["appium:skipServerInstallation"] ?? payload.capabilities?.["appium:skipServerInstallation"] ?? true
  };
}

function stableCapabilities(payload: RealAppiumPayload, command: CommandEnvelope): Record<string, unknown> {
  const base =
    payload.capabilities ??
    (command.platform === "harmony"
      ? {
          platformName: "harmonyos",
          "appium:automationName": "harmonyos"
        }
      : {
          platformName: "Android",
          "appium:automationName": "UiAutomator2"
        });
  if (command.platform === "android") {
    return mergeAndroidLightweightCaps(base, payload);
  }
  return base;
}

function buildSessionCacheKey(command: CommandEnvelope, payload: RealAppiumPayload, serverUrl: string): string {
  return JSON.stringify({
    platform: command.platform,
    sessionKey: command.sessionId,
    serverUrl,
    capabilities: stableCapabilities(payload, command)
  });
}

async function pruneExpiredRealSessions(now = Date.now()): Promise<void> {
  const staleKeys: string[] = [];
  for (const [key, value] of realSessionCache.entries()) {
    if (now - value.lastUsedAt > REAL_SESSION_TTL_MS) {
      staleKeys.push(key);
    }
  }
  for (const key of staleKeys) {
    const stale = realSessionCache.get(key);
    realSessionCache.delete(key);
    if (stale) {
      await deleteRemoteSession(stale.serverUrl, stale.sessionId).catch(() => undefined);
    }
  }
}

async function getOrCreateRealSession(
  command: CommandEnvelope,
  payload: RealAppiumPayload
): Promise<{ sessionId: string; serverUrl: string; cacheKey: string; reused: boolean } | { error: string }> {
  const serverUrl = normalizeServerUrl(payload.serverUrl);
  const cacheKey = buildSessionCacheKey(command, payload, serverUrl);
  await pruneExpiredRealSessions();
  const cached = realSessionCache.get(cacheKey);
  if (cached) {
    cached.lastUsedAt = Date.now();
    return { sessionId: cached.sessionId, serverUrl: cached.serverUrl, cacheKey, reused: true };
  }
  const created = await createRemoteSession(command, payload);
  if ("error" in created) {
    return created;
  }
  realSessionCache.set(cacheKey, {
    cacheKey,
    sessionId: created.sessionId,
    serverUrl: created.serverUrl,
    lastUsedAt: Date.now()
  });
  if (realSessionCache.size > REAL_SESSION_MAX) {
    const oldest = Array.from(realSessionCache.values()).sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
    if (oldest) {
      realSessionCache.delete(oldest.cacheKey);
      await deleteRemoteSession(oldest.serverUrl, oldest.sessionId).catch(() => undefined);
    }
  }
  return { sessionId: created.sessionId, serverUrl: created.serverUrl, cacheKey, reused: false };
}

async function getViewport(serverUrl: string, sessionId: string): Promise<{ width: number; height: number } | null> {
  const result = await requestJson("GET", `${serverUrl}/session/${sessionId}/window/rect`);
  if (!result.ok || !result.value) {
    return null;
  }
  const width = Number(result.value.width ?? 0);
  const height = Number(result.value.height ?? 0);
  if (!width || !height) {
    return null;
  }
  return { width, height };
}

function mapPoint(point: [number, number], viewport: { width: number; height: number } | null): [number, number] {
  const [x, y] = point;
  if (!viewport) {
    return [Math.round(x), Math.round(y)];
  }
  const mappedX = x >= 0 && x <= 1 ? Math.round(x * viewport.width) : Math.round(x);
  const mappedY = y >= 0 && y <= 1 ? Math.round(y * viewport.height) : Math.round(y);
  return [mappedX, mappedY];
}

async function runW3CActions(serverUrl: string, sessionId: string, actions: any[]): Promise<{ ok: boolean; error?: string }> {
  const result = await requestJson("POST", `${serverUrl}/session/${sessionId}/actions`, {
    actions
  });
  if (!result.ok) {
    return { ok: false, error: JSON.stringify(result.raw) };
  }
  await requestJson("DELETE", `${serverUrl}/session/${sessionId}/actions`);
  return { ok: true };
}

async function executeSync(
  serverUrl: string,
  sessionId: string,
  script: string,
  args: Array<Record<string, unknown> | string | number | boolean> = []
): Promise<{ ok: boolean; value?: unknown; error?: string }> {
  const result = await requestJson("POST", `${serverUrl}/session/${sessionId}/execute/sync`, { script, args });
  if (!result.ok) {
    return { ok: false, error: JSON.stringify(result.raw) };
  }
  return { ok: true, value: result.value };
}

async function findElement(
  serverUrl: string,
  sessionId: string,
  payload: RealAppiumPayload
): Promise<
  | { ok: true; elementId: string }
  | { ok: false; code: "MISSING_TARGET" | "LOOKUP_FAILED" | "LOOKUP_NOT_FOUND"; error: string }
> {
  if (payload.elementId) {
    return { ok: true, elementId: payload.elementId };
  }

  const locator = payload.locator;
  if (!locator) {
    return { ok: false, code: "MISSING_TARGET", error: "Missing locator. Provide payload.elementId or payload.locator." };
  }

  let using = "";
  let value = "";
  if (locator.id) {
    using = "id";
    value = locator.id;
  } else if (locator.accessibilityId) {
    using = "accessibility id";
    value = locator.accessibilityId;
  } else if (locator.xpath) {
    using = "xpath";
    value = locator.xpath;
  } else if (locator.uiautomator) {
    using = "-android uiautomator";
    value = locator.uiautomator;
  } else {
    return {
      ok: false,
      code: "MISSING_TARGET",
      error: "Unsupported locator. Use id/accessibilityId/xpath/uiautomator."
    };
  }

  const result = await requestJson("POST", `${serverUrl}/session/${sessionId}/element`, {
    using,
    value
  });
  if (!result.ok) {
    if (result.status === 404) {
      return { ok: false, code: "LOOKUP_NOT_FOUND", error: `Element not found: ${JSON.stringify(result.raw)}` };
    }
    return { ok: false, code: "LOOKUP_FAILED", error: `Element lookup failed: ${JSON.stringify(result.raw)}` };
  }
  if (!result.value) {
    return { ok: false, code: "LOOKUP_NOT_FOUND", error: "Element lookup returned empty value." };
  }
  const elementId = result.value["ELEMENT"] ?? result.value["element-6066-11e4-a52e-4f735466cecf"];
  if (typeof elementId !== "string") {
    return { ok: false, code: "LOOKUP_NOT_FOUND", error: "Element lookup returned invalid element id." };
  }
  return { ok: true, elementId };
}

async function executeAppiumInvokeHttp(
  command: CommandEnvelope,
  serverUrl: string,
  sessionId: string,
  payload: RealAppiumPayload,
  reused: boolean
): Promise<CommandResult> {
  const invoke = normalizeInvokePayload(payload as Record<string, unknown>, "http");
  if (!invoke?.http) {
    return {
      requestId: command.requestId,
      success: false,
      errorCode: "INVOKE_INVALID_PAYLOAD",
      errorMessage: "invoke requires payload.http.{method,path} or legacy payload.custom.{method,path}"
    };
  }

  const { method, path: rawPath, body } = invoke.http;
  const requestPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const url = requestPath.includes("/session/")
    ? `${serverUrl}${requestPath}`
    : `${serverUrl}/session/${sessionId}${requestPath}`;
  const result = await requestJson(method.toUpperCase(), url, body as Record<string, unknown> | undefined);
  if (!result.ok) {
    return {
      requestId: command.requestId,
      success: false,
      errorCode: "INVOKE_HTTP_FAILED",
      errorMessage: JSON.stringify(result.raw)
    };
  }
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "appium",
      mode: "real",
      command: command.command,
      rpcMode: "http",
      http: { method, path: requestPath },
      value: serializeRpcResult(result.value),
      reusedSession: reused
    }
  };
}

async function executeRealCommand(command: CommandEnvelope, payload: RealAppiumPayload): Promise<CommandResult> {
  const session = await getOrCreateRealSession(command, payload);
  if ("error" in session) {
    return {
      requestId: command.requestId,
      success: false,
      errorCode: "APPIUM_SESSION_CREATE_FAILED",
      errorMessage: session.error
    };
  }

  const { serverUrl, sessionId, cacheKey, reused } = session;
  try {
    const viewport = await getViewport(serverUrl, sessionId);

    if (command.command === "click") {
      const point = asNumberPoint(payload.point);
      if (point) {
        const [x, y] = mapPoint(point, viewport);
        const actionResult = await runW3CActions(serverUrl, sessionId, [
          {
            type: "pointer",
            id: "finger1",
            parameters: { pointerType: "touch" },
            actions: [
              { type: "pointerMove", duration: 0, x, y },
              { type: "pointerDown", button: 0 },
              { type: "pause", duration: 60 },
              { type: "pointerUp", button: 0 }
            ]
          }
        ]);
        if (!actionResult.ok) {
          return {
            requestId: command.requestId,
            success: false,
            errorCode: "APPIUM_CLICK_FAILED",
            errorMessage: actionResult.error
          };
        }
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "appium", mode: "real", command: "click", x, y, sessionId, reusedSession: reused }
        };
      }
      const target = await findElement(serverUrl, sessionId, payload);
      if (!target.ok) {
        const code =
          target.code === "MISSING_TARGET"
            ? "APPIUM_CLICK_MISSING_ELEMENT"
            : target.code === "LOOKUP_NOT_FOUND"
              ? "APPIUM_CLICK_ELEMENT_NOT_FOUND"
              : "APPIUM_CLICK_LOOKUP_FAILED";
        return {
          requestId: command.requestId,
          success: false,
          errorCode: code,
          errorMessage: target.error
        };
      }
      const clickResult = await requestJson("POST", `${serverUrl}/session/${sessionId}/element/${target.elementId}/click`);
      if (!clickResult.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_CLICK_FAILED",
          errorMessage: JSON.stringify(clickResult.raw)
        };
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "appium", mode: "real", command: "click", elementId: target.elementId, sessionId, reusedSession: reused }
      };
    }

    if (command.command === "swipe") {
      const from = asNumberPoint(payload.from);
      const to = asNumberPoint(payload.to);
      if (!from || !to) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_SWIPE_MISSING_POINTS",
          errorMessage: "Real swipe requires payload.from and payload.to"
        };
      }
      const [fromX, fromY] = mapPoint(from, viewport);
      const [toX, toY] = mapPoint(to, viewport);
      const actionResult = await runW3CActions(serverUrl, sessionId, [
        {
          type: "pointer",
          id: "finger1",
          parameters: { pointerType: "touch" },
          actions: [
            { type: "pointerMove", duration: 0, x: fromX, y: fromY },
            { type: "pointerDown", button: 0 },
            { type: "pause", duration: 100 },
            { type: "pointerMove", duration: 300, x: toX, y: toY },
            { type: "pointerUp", button: 0 }
          ]
        }
      ]);
      if (!actionResult.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_SWIPE_FAILED",
          errorMessage: actionResult.error
        };
      }
      return {
        requestId: command.requestId,
        success: true,
        data: {
          driver: "appium",
          mode: "real",
          command: "swipe",
          from: [fromX, fromY],
          to: [toX, toY],
          sessionId,
          reusedSession: reused
        }
      };
    }

    if (command.command === "type") {
      const target = await findElement(serverUrl, sessionId, payload);
      if (!target.ok) {
        const code =
          target.code === "MISSING_TARGET"
            ? "APPIUM_TYPE_MISSING_ELEMENT"
            : target.code === "LOOKUP_NOT_FOUND"
              ? "APPIUM_TYPE_ELEMENT_NOT_FOUND"
              : "APPIUM_TYPE_LOOKUP_FAILED";
        return {
          requestId: command.requestId,
          success: false,
          errorCode: code,
          errorMessage: target.error
        };
      }
      const text = payload.text ?? "";
      const result = await requestJson("POST", `${serverUrl}/session/${sessionId}/element/${target.elementId}/value`, {
        text,
        value: Array.from(text)
      });
      if (!result.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_TYPE_FAILED",
          errorMessage: JSON.stringify(result.raw)
        };
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "appium", mode: "real", command: "type", elementId: target.elementId, text, reusedSession: reused }
      };
    }

    if (command.command === "assertVisible") {
      const target = await findElement(serverUrl, sessionId, payload);
      if (!target.ok) {
        const code =
          target.code === "MISSING_TARGET"
            ? "APPIUM_ASSERT_MISSING_ELEMENT"
            : target.code === "LOOKUP_NOT_FOUND"
              ? "APPIUM_ASSERT_ELEMENT_NOT_FOUND"
              : "APPIUM_ASSERT_LOOKUP_FAILED";
        return {
          requestId: command.requestId,
          success: false,
          errorCode: code,
          errorMessage: target.error
        };
      }
      const result = await requestJson("GET", `${serverUrl}/session/${sessionId}/element/${target.elementId}/displayed`);
      if (!result.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_ASSERT_FAILED",
          errorMessage: JSON.stringify(result.raw)
        };
      }
      const visible = Boolean(result.value);
      if (!visible) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_ASSERT_NOT_VISIBLE",
          errorMessage: "Element not visible"
        };
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "appium", mode: "real", command: "assertVisible", elementId: target.elementId, reusedSession: reused }
      };
    }

    if (command.command === "getText") {
      const target = await findElement(serverUrl, sessionId, payload);
      if (!target.ok) {
        const code =
          target.code === "MISSING_TARGET"
            ? "APPIUM_GET_TEXT_MISSING_ELEMENT"
            : target.code === "LOOKUP_NOT_FOUND"
              ? "APPIUM_GET_TEXT_ELEMENT_NOT_FOUND"
              : "APPIUM_GET_TEXT_LOOKUP_FAILED";
        return {
          requestId: command.requestId,
          success: false,
          errorCode: code,
          errorMessage: target.error
        };
      }
      const result = await requestJson("GET", `${serverUrl}/session/${sessionId}/element/${target.elementId}/text`);
      if (!result.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_GET_TEXT_FAILED",
          errorMessage: JSON.stringify(result.raw)
        };
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "appium", mode: "real", command: "getText", elementId: target.elementId, text: String(result.value ?? ""), reusedSession: reused }
      };
    }

    if (command.command === "assertText") {
      const target = await findElement(serverUrl, sessionId, payload);
      if (!target.ok) {
        const code =
          target.code === "MISSING_TARGET"
            ? "APPIUM_ASSERT_TEXT_MISSING_ELEMENT"
            : target.code === "LOOKUP_NOT_FOUND"
              ? "APPIUM_ASSERT_TEXT_ELEMENT_NOT_FOUND"
              : "APPIUM_ASSERT_TEXT_LOOKUP_FAILED";
        return {
          requestId: command.requestId,
          success: false,
          errorCode: code,
          errorMessage: target.error
        };
      }
      const result = await requestJson("GET", `${serverUrl}/session/${sessionId}/element/${target.elementId}/text`);
      if (!result.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_ASSERT_TEXT_FAILED",
          errorMessage: JSON.stringify(result.raw)
        };
      }
      const expectedText = String(payload.expectedText ?? "");
      const actualText = String(result.value ?? "");
      if (!actualText.includes(expectedText)) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_ASSERT_TEXT_MISMATCH",
          errorMessage: `Expected text includes "${expectedText}", got "${actualText}"`
        };
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "appium", mode: "real", command: "assertText", elementId: target.elementId, text: actualText, reusedSession: reused }
      };
    }

    if (command.command === "wait") {
      const timeoutMs = typeof payload.timeoutMs === "number" ? Math.max(0, payload.timeoutMs) : 300;
      await new Promise((resolve) => setTimeout(resolve, timeoutMs));
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "appium", mode: "real", command: "wait", timeoutMs, reusedSession: reused }
      };
    }

    if (command.command === "back") {
      const result = await requestJson("POST", `${serverUrl}/session/${sessionId}/back`);
      if (!result.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_BACK_FAILED",
          errorMessage: JSON.stringify(result.raw)
        };
      }
      return { requestId: command.requestId, success: true, data: { driver: "appium", mode: "real", command: "back", reusedSession: reused } };
    }

    if (command.command === "home") {
      const result = await executeSync(serverUrl, sessionId, "mobile: pressButton", [{ name: "home" }]);
      if (!result.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_HOME_FAILED",
          errorMessage: result.error
        };
      }
      return { requestId: command.requestId, success: true, data: { driver: "appium", mode: "real", command: "home", reusedSession: reused } };
    }

    if (command.command === "launchApp") {
      const appId = payload.appId ?? payload.bundleId;
      if (!appId || typeof appId !== "string") {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_LAUNCH_APP_MISSING_APP_ID",
          errorMessage: "launchApp requires payload.appId or payload.bundleId"
        };
      }
      const result = await executeSync(serverUrl, sessionId, "mobile: activateApp", [{ appId }]);
      if (!result.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_LAUNCH_APP_FAILED",
          errorMessage: result.error
        };
      }
      return { requestId: command.requestId, success: true, data: { driver: "appium", mode: "real", command: "launchApp", appId, reusedSession: reused } };
    }

    if (command.command === "terminateApp") {
      const appId = payload.appId ?? payload.bundleId;
      if (!appId || typeof appId !== "string") {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_TERMINATE_APP_MISSING_APP_ID",
          errorMessage: "terminateApp requires payload.appId or payload.bundleId"
        };
      }
      const result = await executeSync(serverUrl, sessionId, "mobile: terminateApp", [{ appId }]);
      if (!result.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_TERMINATE_APP_FAILED",
          errorMessage: result.error
        };
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "appium", mode: "real", command: "terminateApp", appId, reusedSession: reused }
      };
    }

    if (command.command === "screenshot") {
      const result = await requestJson("GET", `${serverUrl}/session/${sessionId}/screenshot`);
      if (!result.ok || typeof result.value !== "string") {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_SCREENSHOT_FAILED",
          errorMessage: JSON.stringify(result.raw)
        };
      }
      const defaultPath = path.join(process.cwd(), "artifacts", `${command.requestId}-appium.png`);
      const output = payload.screenshotPath ?? defaultPath;
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, Buffer.from(result.value, "base64"));
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "appium", mode: "real", command: "screenshot", screenshot: output, reusedSession: reused }
      };
    }

    if (command.command === "invoke") {
      return executeAppiumInvokeHttp(command, serverUrl, sessionId, payload, reused);
    }

    if (command.command === "custom") {
      if ((payload.action ?? "").toLowerCase() === "listapps") {
        const listAppsResult = await executeSync(serverUrl, sessionId, "mobile: listApps", [{}]);
        if (!listAppsResult.ok) {
          return {
            requestId: command.requestId,
            success: false,
            errorCode: "APPIUM_CUSTOM_LIST_APPS_FAILED",
            errorMessage: listAppsResult.error
          };
        }
        return {
          requestId: command.requestId,
          success: true,
          data: {
            driver: "appium",
            mode: "real",
            command: "custom",
            value: toCustomValueText(listAppsResult.value),
            source: "mobile:listApps",
            reusedSession: reused
          }
        };
      }
      const invoke = normalizeInvokePayload(payload as Record<string, unknown>, "http");
      if (invoke?.http) {
        return executeAppiumInvokeHttp(command, serverUrl, sessionId, payload, reused);
      }
      return {
        requestId: command.requestId,
        success: false,
        errorCode: "APPIUM_CUSTOM_MISSING_METHOD_OR_PATH",
        errorMessage: "custom requires payload.custom.{method,path} or use command=invoke with payload.http"
      };
    }

    return {
      requestId: command.requestId,
      success: false,
      errorCode: "APPIUM_REAL_UNSUPPORTED_COMMAND",
      errorMessage: `Real mode does not support command: ${command.command}`
    };
  } finally {
    if (payload.keepSession === false) {
      realSessionCache.delete(cacheKey);
      await deleteRemoteSession(serverUrl, sessionId).catch(() => undefined);
    } else {
      const cached = realSessionCache.get(cacheKey);
      if (cached) {
        cached.lastUsedAt = Date.now();
      }
    }
  }
}

const appiumPlugin: DriverPlugin = {
  manifest: {
    id: "driver-appium",
    version: "0.1.0",
    engine: "appium",
    platforms: ["android", "ios"],
    capabilities: ["tap", "type", "swipe", "assertVisible", "screenshot"]
      .concat(["click", "getText", "assertText", "wait", "back", "home", "launchApp", "terminateApp", "custom", "invoke"]),
    semanticCommands: ["tap", "type", "swipe", "assertVisible", "screenshot", "click", "getText", "assertText", "wait", "back", "home", "launchApp", "terminateApp", "custom"],
    invoke: {
      modes: ["http"],
      targets: ["session"]
    }
  },

  async init() {},

  async createSession(platform): Promise<DriverSession> {
    return { id: `appium-${Date.now()}`, platform };
  },

  async execute(_session: DriverSession, command: CommandEnvelope): Promise<CommandResult> {
    if (command.payload?.probe === true) {
      const probe = await runAppiumVersionProbe();
      if (!probe.ok) {
        return {
          requestId: command.requestId,
          success: false,
          errorCode: "APPIUM_PROBE_FAILED",
          errorMessage: probe.error ?? "Appium probe failed"
        };
      }
      return {
        requestId: command.requestId,
        success: true,
        data: {
          driver: "appium",
          platform: command.platform,
          probe: "ok",
          version: probe.output ?? "unknown"
        }
      };
    }

    const payload = (command.payload ?? {}) as RealAppiumPayload;
    if (payload.mock !== true && payload.real !== false) {
      return executeRealCommand(command, payload);
    }

    return {
      requestId: command.requestId,
      success: true,
      data: {
        driver: "appium",
        platform: command.platform,
        command: command.command,
        mode: "mock",
        message: "Mock mobile command executed"
      }
    };
  },

  async dispose() {
    const sessions = Array.from(realSessionCache.values());
    realSessionCache.clear();
    await Promise.allSettled(sessions.map((s) => deleteRemoteSession(s.serverUrl, s.sessionId)));
  }
};

export default appiumPlugin;
