import type { InvokeHttpPayload, InvokeMode, InvokePayload, PluginManifest, WebEngine } from "@ada/contracts";

export type { InvokeHttpPayload, InvokeMode, InvokePayload, WebEngine };

const WEB_ENGINES = new Set<WebEngine>(["playwright", "selenium"]);

export function parseWebEngineFromPayload(payload?: Record<string, unknown>): WebEngine {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const raw = (getString(p.engine) ?? getString(options.engine) ?? "playwright").toLowerCase();
  if (raw === "selenium") {
    return "selenium";
  }
  return "playwright";
}

export function manifestWebEngine(manifest: Pick<PluginManifest, "engine" | "id">): WebEngine {
  if (manifest.engine === "selenium") {
    return "selenium";
  }
  return "playwright";
}

export function isKnownWebEngine(value: string): value is WebEngine {
  return WEB_ENGINES.has(value as WebEngine);
}

const PLAYWRIGHT_OBJECT_TYPES = new Set([
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

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Normalize invoke fields from command payload (supports legacy Appium `custom` block). */
export function normalizeInvokePayload(
  raw: Record<string, unknown> | undefined,
  defaultMode: InvokeMode
): InvokePayload | null {
  const payload = asRecord(raw);
  const legacyCustom = asRecord(payload.custom);
  const httpBlock = asRecord(payload.http);

  const httpMethod = getString(httpBlock.method) ?? getString(legacyCustom.method);
  const httpPath = getString(httpBlock.path) ?? getString(legacyCustom.path);
  const hasHttp = Boolean(httpMethod && httpPath);

  const method = getString(payload.method);
  const target = getString(payload.target);
  const hasMethod = Boolean(method);

  let mode = getString(payload.mode) as InvokeMode | undefined;
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

function pickPayloadString(
  payload: Record<string, unknown>,
  options: Record<string, unknown>,
  key: string,
  aliases: string[] = [],
  envKey?: string
): string {
  const keys = [key, ...aliases];
  for (const k of keys) {
    const top = getString(payload[k]);
    if (top) {
      return top;
    }
    const nested = getString(options[k]);
    if (nested) {
      return nested;
    }
  }
  if (envKey && typeof process.env[envKey] === "string" && process.env[envKey].length > 0) {
    return process.env[envKey];
  }
  return "";
}

/** Resolved local / installed browser connection fields (Playwright web). */
export function resolveLocalBrowserFields(payload?: Record<string, unknown>): {
  cdpEndpoint: string;
  executablePath: string;
  channel: string;
  userDataDir: string;
} {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  return {
    cdpEndpoint: pickPayloadString(p, options, "cdpEndpoint", ["browserURL", "cdpUrl"], "ADA_PLAYWRIGHT_CDP_ENDPOINT"),
    executablePath: pickPayloadString(
      p,
      options,
      "executablePath",
      ["browserPath", "browserExecutable"],
      "ADA_PLAYWRIGHT_EXECUTABLE_PATH"
    ),
    channel: pickPayloadString(p, options, "channel", [], "ADA_PLAYWRIGHT_CHANNEL"),
    userDataDir: pickPayloadString(p, options, "userDataDir", [], "ADA_PLAYWRIGHT_USER_DATA_DIR")
  };
}

/** Stable key to decide whether browser/context should be recreated. */
export function buildSessionKey(payload?: Record<string, unknown>): string {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const local = resolveLocalBrowserFields(p);
  const browser = getString(p.browser) ?? getString(options.browser) ?? "chromium";
  const headless = typeof p.headless === "boolean" ? p.headless : typeof options.headless === "boolean" ? options.headless : "env";
  const storageStatePath = getString(p.storageStatePath) ?? getString(options.storageStatePath) ?? "";
  const storageState = p.storageState ?? options.storageState;
  const storageKey =
    storageStatePath || (storageState !== undefined ? JSON.stringify(storageState) : "");
  return `${browser}|${headless}|${local.cdpEndpoint}|${local.executablePath}|${local.channel}|${local.userDataDir}|${storageKey}`;
}

/** Resolved Selenium / system browser connection fields. */
export function resolveSeleniumBrowserFields(payload?: Record<string, unknown>): {
  browserName: string;
  browserBinary: string;
  profile: string;
  seleniumServerUrl: string;
} {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const browserName =
    getString(p.browserName) ??
    getString(options.browserName) ??
    getString(p.browser) ??
    getString(options.browser) ??
    process.env.ADA_SELENIUM_BROWSER ??
    "firefox";
  return {
    browserName: browserName.toLowerCase(),
    browserBinary: pickPayloadString(
      p,
      options,
      "browserBinary",
      ["executablePath", "browserPath", "browserExecutable"],
      "ADA_SELENIUM_BROWSER_BINARY"
    ),
    profile: pickPayloadString(p, options, "profile", ["userDataDir"], "ADA_SELENIUM_PROFILE"),
    seleniumServerUrl: pickPayloadString(
      p,
      options,
      "seleniumServerUrl",
      ["serverUrl", "gridUrl"],
      "ADA_SELENIUM_SERVER_URL"
    )
  };
}

export function buildSeleniumSessionKey(payload?: Record<string, unknown>): string {
  const p = asRecord(payload);
  const fields = resolveSeleniumBrowserFields(p);
  const headless =
    typeof p.headless === "boolean" ? p.headless : typeof asRecord(p.options).headless === "boolean" ? asRecord(p.options).headless : "env";
  const caps = p.capabilities ?? asRecord(p.options).capabilities;
  const capsKey = caps !== undefined ? JSON.stringify(caps) : "";
  return `selenium|${fields.browserName}|${headless}|${fields.browserBinary}|${fields.profile}|${fields.seleniumServerUrl}|${capsKey}`;
}

export function serializeRpcResult(value: unknown, depth = 0): unknown {
  if (depth > 10) {
    return "[MaxDepth]";
  }
  if (value === undefined) {
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

  const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
  if (ctor && PLAYWRIGHT_OBJECT_TYPES.has(ctor)) {
    return { __type: ctor, hint: "Live Playwright object; chain further invoke calls on page/context" };
  }

  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) {
      out[String(k)] = serializeRpcResult(v, depth + 1);
    }
    return out;
  }

  try {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
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

export function mergeOptionsIntoPayload(payload?: Record<string, unknown>): Record<string, unknown> {
  const p = { ...asRecord(payload) };
  const options = asRecord(p.options);
  for (const key of [
    "browser",
    "headless",
    "userDataDir",
    "storageStatePath",
    "storageState",
    "launchOptions",
    "contextOptions",
    "cdpEndpoint",
    "browserURL",
    "cdpUrl",
    "executablePath",
    "browserPath",
    "browserExecutable",
    "channel",
    "engine",
    "browserName",
    "browserBinary",
    "profile",
    "seleniumServerUrl",
    "geckodriverVersion",
    "chromedriverVersion"
  ]) {
    if (p[key] === undefined && options[key] !== undefined) {
      p[key] = options[key];
    }
  }
  return p;
}
