"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugins/driver-appium/src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);

// packages/driver-rpc/src/index.ts
var PLAYWRIGHT_OBJECT_TYPES = /* @__PURE__ */ new Set([
  "Page",
  "Frame",
  "Locator",
  "BrowserContext",
  "Browser",
  "Response",
  "CDPSession",
  "ElementHandle",
  "JSHandle",
  "Worker",
  "Request",
  "Route",
  "WebSocket"
]);
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function getString(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function normalizeInvokePayload(raw, defaultMode) {
  const payload = asRecord(raw);
  const legacyCustom = asRecord(payload.custom);
  const httpBlock = asRecord(payload.http);
  const httpMethod = getString(httpBlock.method) ?? getString(legacyCustom.method);
  const httpPath = getString(httpBlock.path) ?? getString(legacyCustom.path);
  const hasHttp = Boolean(httpMethod && httpPath);
  const method = getString(payload.method);
  const target = getString(payload.target);
  const hasMethod = Boolean(method);
  let mode = getString(payload.mode);
  if (mode !== "method" && mode !== "http") {
    mode = hasHttp ? "http" : hasMethod ? "method" : defaultMode;
  }
  if (mode === "http" && !hasHttp && hasMethod) {
    mode = "method";
  }
  if (mode === "method" && !hasMethod && hasHttp) {
    mode = "http";
  }
  if (mode === "http") {
    if (!httpMethod || !httpPath) {
      return null;
    }
    return {
      mode: "http",
      http: {
        method: httpMethod,
        path: httpPath,
        body: httpBlock.body ?? legacyCustom.body
      },
      options: asRecord(payload.options)
    };
  }
  if (!method) {
    return null;
  }
  return {
    mode: "method",
    target: target ?? "page",
    method,
    args: Array.isArray(payload.args) ? payload.args : [],
    locator: asRecord(payload.locator),
    options: asRecord(payload.options)
  };
}
function serializeRpcResult(value, depth = 0) {
  if (depth > 10) {
    return "[MaxDepth]";
  }
  if (value === void 0) {
    return { __undefined: true };
  }
  if (value === null || typeof value !== "function") {
    if (value === null || typeof value !== "object") {
      return value;
    }
  } else {
    return { __type: "Function", hint: "Functions are not serializable over invoke RPC" };
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return { __type: "Buffer", encoding: "base64", data: value.toString("base64") };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeRpcResult(item, depth + 1));
  }
  const ctor = value.constructor?.name;
  if (ctor && PLAYWRIGHT_OBJECT_TYPES.has(ctor)) {
    return { __type: ctor, hint: "Live Playwright object; chain further invoke calls on page/context" };
  }
  if (value instanceof Map) {
    const out = {};
    for (const [k, v] of value.entries()) {
      out[String(k)] = serializeRpcResult(v, depth + 1);
    }
    return out;
  }
  try {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function") {
        continue;
      }
      out[k] = serializeRpcResult(v, depth + 1);
    }
    return out;
  } catch {
    return String(value);
  }
}

// plugins/driver-appium/src/index.ts
var import_node_child_process = require("node:child_process");
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
async function runCommandCapture(command, args) {
  return new Promise((resolve) => {
    const child = (0, import_node_child_process.spawn)(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
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
async function runAppiumVersionProbe() {
  const candidates = [
    { cmd: "appium", args: ["--version"] },
    { cmd: "npm", args: ["exec", "appium", "--", "--version"] }
  ];
  const errors = [];
  for (const candidate of candidates) {
    const result = await runCommandCapture(candidate.cmd, candidate.args);
    if (result.ok) {
      return result;
    }
    errors.push(`${candidate.cmd} ${candidate.args.join(" ")} => ${result.error ?? "unknown error"}`);
  }
  return { ok: false, error: errors.join("; ") };
}
var REAL_SESSION_TTL_MS = 2 * 60 * 1e3;
var REAL_SESSION_MAX = 8;
var realSessionCache = /* @__PURE__ */ new Map();
function formatSessionCreateError(raw) {
  const text = JSON.stringify(raw);
  if (text.toLowerCase().includes("device unauthorized")) {
    return "Android device unauthorized. Please unlock phone and accept the USB debugging authorization dialog, then retry.";
  }
  if (text.includes("Neither ANDROID_HOME nor ANDROID_SDK_ROOT")) {
    return "Android SDK env missing. Please set ANDROID_HOME / ANDROID_SDK_ROOT before starting Appium.";
  }
  return `Failed to create Appium session: ${text}`;
}
function normalizeServerUrl(url) {
  return (url ?? "http://127.0.0.1:4723").replace(/\/$/, "");
}
async function requestJson(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : void 0
  });
  const raw = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    value: raw.value,
    raw
  };
}
function toCustomValueText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object") {
        const rec = item;
        const pkg = rec.packageName ?? rec.appPackage ?? rec.package;
        if (typeof pkg === "string" && pkg.trim()) {
          return pkg.trim();
        }
        return JSON.stringify(item);
      }
      return String(item ?? "");
    }).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value ?? "");
}
function asNumberPoint(input) {
  if (!input || input.length !== 2) {
    return null;
  }
  const [x, y] = input;
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  return [x, y];
}
async function createRemoteSession(command, payload) {
  try {
    const serverUrl = normalizeServerUrl(payload.serverUrl);
    const capabilities = payload.capabilities ?? (command.platform === "harmony" ? {
      platformName: "harmonyos",
      "appium:automationName": "harmonyos"
    } : {
      platformName: "Android",
      "appium:automationName": "UiAutomator2"
    });
    const result = await requestJson("POST", `${serverUrl}/session`, {
      capabilities: { alwaysMatch: capabilities, firstMatch: [{}] }
    });
    if (!result.ok || !result.value?.sessionId) {
      return { error: formatSessionCreateError(result.raw) };
    }
    return { sessionId: result.value.sessionId, serverUrl };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
async function deleteRemoteSession(serverUrl, sessionId) {
  await requestJson("DELETE", `${serverUrl}/session/${sessionId}`);
}
function stableCapabilities(payload, command) {
  return payload.capabilities ?? (command.platform === "harmony" ? {
    platformName: "harmonyos",
    "appium:automationName": "harmonyos"
  } : {
    platformName: "Android",
    "appium:automationName": "UiAutomator2"
  });
}
function buildSessionCacheKey(command, payload, serverUrl) {
  return JSON.stringify({
    platform: command.platform,
    sessionKey: command.sessionId,
    serverUrl,
    capabilities: stableCapabilities(payload, command)
  });
}
async function pruneExpiredRealSessions(now = Date.now()) {
  const staleKeys = [];
  for (const [key, value] of realSessionCache.entries()) {
    if (now - value.lastUsedAt > REAL_SESSION_TTL_MS) {
      staleKeys.push(key);
    }
  }
  for (const key of staleKeys) {
    const stale = realSessionCache.get(key);
    realSessionCache.delete(key);
    if (stale) {
      await deleteRemoteSession(stale.serverUrl, stale.sessionId).catch(() => void 0);
    }
  }
}
async function getOrCreateRealSession(command, payload) {
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
      await deleteRemoteSession(oldest.serverUrl, oldest.sessionId).catch(() => void 0);
    }
  }
  return { sessionId: created.sessionId, serverUrl: created.serverUrl, cacheKey, reused: false };
}
async function getViewport(serverUrl, sessionId) {
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
function mapPoint(point, viewport) {
  const [x, y] = point;
  if (!viewport) {
    return [Math.round(x), Math.round(y)];
  }
  const mappedX = x >= 0 && x <= 1 ? Math.round(x * viewport.width) : Math.round(x);
  const mappedY = y >= 0 && y <= 1 ? Math.round(y * viewport.height) : Math.round(y);
  return [mappedX, mappedY];
}
async function runW3CActions(serverUrl, sessionId, actions) {
  const result = await requestJson("POST", `${serverUrl}/session/${sessionId}/actions`, {
    actions
  });
  if (!result.ok) {
    return { ok: false, error: JSON.stringify(result.raw) };
  }
  await requestJson("DELETE", `${serverUrl}/session/${sessionId}/actions`);
  return { ok: true };
}
async function executeSync(serverUrl, sessionId, script, args = []) {
  const result = await requestJson("POST", `${serverUrl}/session/${sessionId}/execute/sync`, { script, args });
  if (!result.ok) {
    return { ok: false, error: JSON.stringify(result.raw) };
  }
  return { ok: true, value: result.value };
}
async function findElement(serverUrl, sessionId, payload) {
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
async function executeAppiumInvokeHttp(command, serverUrl, sessionId, payload, reused) {
  const invoke = normalizeInvokePayload(payload, "http");
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
  const url = requestPath.includes("/session/") ? `${serverUrl}${requestPath}` : `${serverUrl}/session/${sessionId}${requestPath}`;
  const result = await requestJson(method.toUpperCase(), url, body);
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
async function executeRealCommand(command, payload) {
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
        const code = target.code === "MISSING_TARGET" ? "APPIUM_CLICK_MISSING_ELEMENT" : target.code === "LOOKUP_NOT_FOUND" ? "APPIUM_CLICK_ELEMENT_NOT_FOUND" : "APPIUM_CLICK_LOOKUP_FAILED";
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
        const code = target.code === "MISSING_TARGET" ? "APPIUM_TYPE_MISSING_ELEMENT" : target.code === "LOOKUP_NOT_FOUND" ? "APPIUM_TYPE_ELEMENT_NOT_FOUND" : "APPIUM_TYPE_LOOKUP_FAILED";
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
        const code = target.code === "MISSING_TARGET" ? "APPIUM_ASSERT_MISSING_ELEMENT" : target.code === "LOOKUP_NOT_FOUND" ? "APPIUM_ASSERT_ELEMENT_NOT_FOUND" : "APPIUM_ASSERT_LOOKUP_FAILED";
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
        const code = target.code === "MISSING_TARGET" ? "APPIUM_GET_TEXT_MISSING_ELEMENT" : target.code === "LOOKUP_NOT_FOUND" ? "APPIUM_GET_TEXT_ELEMENT_NOT_FOUND" : "APPIUM_GET_TEXT_LOOKUP_FAILED";
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
        const code = target.code === "MISSING_TARGET" ? "APPIUM_ASSERT_TEXT_MISSING_ELEMENT" : target.code === "LOOKUP_NOT_FOUND" ? "APPIUM_ASSERT_TEXT_ELEMENT_NOT_FOUND" : "APPIUM_ASSERT_TEXT_LOOKUP_FAILED";
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
      const defaultPath = import_node_path.default.join(process.cwd(), "artifacts", `${command.requestId}-appium.png`);
      const output = payload.screenshotPath ?? defaultPath;
      await import_promises.default.mkdir(import_node_path.default.dirname(output), { recursive: true });
      await import_promises.default.writeFile(output, Buffer.from(result.value, "base64"));
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
      const invoke = normalizeInvokePayload(payload, "http");
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
      await deleteRemoteSession(serverUrl, sessionId).catch(() => void 0);
    } else {
      const cached = realSessionCache.get(cacheKey);
      if (cached) {
        cached.lastUsedAt = Date.now();
      }
    }
  }
}
var appiumPlugin = {
  manifest: {
    id: "driver-appium",
    version: "0.1.0",
    engine: "appium",
    platforms: ["android", "ios", "harmony"],
    capabilities: ["tap", "type", "swipe", "assertVisible", "screenshot"].concat(["click", "getText", "assertText", "wait", "back", "home", "launchApp", "terminateApp", "custom", "invoke"]),
    semanticCommands: ["tap", "type", "swipe", "assertVisible", "screenshot", "click", "getText", "assertText", "wait", "back", "home", "launchApp", "terminateApp", "custom"],
    invoke: {
      modes: ["http"],
      targets: ["session"]
    }
  },
  async init() {
  },
  async createSession(platform) {
    return { id: `appium-${Date.now()}`, platform };
  },
  async execute(_session, command) {
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
    const payload = command.payload ?? {};
    if (payload.real === true) {
      return executeRealCommand(command, payload);
    }
    return {
      requestId: command.requestId,
      success: true,
      data: {
        driver: "appium",
        platform: command.platform,
        command: command.command,
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
var index_default = appiumPlugin;
