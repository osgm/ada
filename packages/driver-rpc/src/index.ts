import type { InvokeHttpPayload, InvokeMode, InvokePayload, PluginManifest, WebEngine } from "@ada/contracts";
import { resolvePlaywrightHeadless } from "./playwright-defaults.js";
import { isKnownWebEngine, parseWebEngineFromPayload } from "./web-engine.js";

export type { InvokeHttpPayload, InvokeMode, InvokePayload, WebEngine };
export { parseWebEngineFromPayload, isKnownWebEngine };

export {
  MOBILE_RECIPE_ACTIONS,
  normalizeCommandEnvelope,
  normalizeCommandName,
  normalizePayload,
  type MobileRecipeAction
} from "./normalize-command.js";

export function manifestWebEngine(manifest: Pick<PluginManifest, "engine" | "id">): WebEngine {
  return "playwright";
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

/** Normalize invoke fields from command payload. */
export function normalizeInvokePayload(
  raw: Record<string, unknown> | undefined,
  defaultMode: InvokeMode
): InvokePayload | null {
  const payload = asRecord(raw);
  const httpBlock = asRecord(payload.http);

  const httpMethod = getString(httpBlock.method);
  const httpPath = getString(httpBlock.path);
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
        body: httpBlock.body
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
  const headless = resolvePlaywrightHeadless(p);
  const storageStatePath = getString(p.storageStatePath) ?? getString(options.storageStatePath) ?? "";
  const storageState = p.storageState ?? options.storageState;
  const storageKey =
    storageStatePath || (storageState !== undefined ? JSON.stringify(storageState) : "");
  const cdpAutoLaunch =
    typeof p.cdpAutoLaunch === "boolean"
      ? p.cdpAutoLaunch
      : typeof options.cdpAutoLaunch === "boolean"
        ? options.cdpAutoLaunch
        : process.env.ADA_PLAYWRIGHT_CDP_AUTO_LAUNCH === "true";
  const cdpPort = getString(p.cdpPort) ?? getString(options.cdpPort) ?? "";
  return `${browser}|${headless}|${local.cdpEndpoint}|${cdpAutoLaunch}|${cdpPort}|${local.executablePath}|${local.channel}|${local.userDataDir}|${storageKey}`;
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

export {
  CommandTimeoutError,
  DEFAULT_COMMAND_TIMEOUT_MS,
  raceCommandTimeout,
  resolveCommandTimeoutMs,
  resolveLocatorTimeoutMs,
  resolveSubOperationTimeoutMs
} from "./command-timeout.js";
export {
  UI_ELEMENT_NOT_FOUND,
  buildOptionalUiMissResult,
  isOptionalUiPayload,
  suppressHypiumOptionalProbeLogs,
  withSuppressedHypiumProbeLogs
} from "./optional-ui.js";
export {
  HARMONY_CLEAR_RECENTS_LABELS,
  HARMONY_KEY_RECENTS,
  harmonySwipePixels,
  type HarmonySwipeNorm
} from "./harmony-gesture.js";
export {
  loadDeviceRegistryDefaults,
  mergeMobileSessionPayload,
  type DeviceRegistryDefaults
} from "./session-defaults.js";
export {
  fillSearchPayloadFromArg,
  parseFillSearchPayload,
  type FillSearchOptions,
  type ParsedFillSearchOptions
} from "./fill-search-options.js";
export {
  detectFillSearchPageTransition,
  FILL_SEARCH_DEFAULT_SETTLE_MS,
  FILL_SEARCH_DIRECT_INPUT_SETTLE_MS,
  FILL_SEARCH_PAGE_TRANSITION_SETTLE_MS,
  isDirectInputTapDetail,
  pickPointDistance,
  resolveFillSearchSettleMs
} from "./fill-search-transition.js";
export {
  recipeDumpUi,
  recipeFillSearch,
  recipeTapPath,
  recipeTapSearch,
  type MobileRecipeContext,
  type MobilePlatform,
  type RecipeResult
} from "./mobile-recipes.js";
export { normalizeMobileCustomAction, runMobileCustomAction, type MobileCustomOutcome } from "./mobile-custom.js";
export {
  DEVICE_ADMIN_ACTIONS,
  deviceAdminFail,
  deviceAdminSuccess,
  normalizeOrientation,
  parseAndroidAppInfo,
  parseAndroidCurrentApp,
  parsePackageList,
  readDeviceAdminAction,
  type DeviceAdminAction
} from "./mobile-device-admin.js";
export {
  buildKernelSessionKey,
  parseKernelSessionKey,
  resolveMobileDeviceId
} from "./session-key.js";
export { UiDumpCache, readUiDumpCacheTtlMs, shouldInvalidateDumpOnAction } from "./ui-dump-cache.js";
export { RECIPE_ERROR_CODES, platformRecipeErrorCode, recipeErrorCodeForAction } from "./recipe-errors.js";
export {
  WEB_VIEW_SCRIPT,
  WEB_INTERACTION_ERROR_CODES,
  normalizeControlPath,
  normalizeRecipeAction,
  resolveExpandStrategy,
  findControlByPath,
  findControlsByHref,
  findControlsByName,
  parseWebViewSnapshot,
  applyControlFilters,
  shapeViewTreeExtract,
  truncateViewTreeValue,
  type ExpandStrategy,
  type ControlObserveItem,
  type ControlObserveResult,
  type WebViewSnapshot,
  type ViewTreeDetail,
  type WebInteractionErrorCode
} from "./web-interaction-recipe.js";
export {
  extractMobilePageSourceText,
  findMobileControlByPath,
  findMobileNodeForSegment,
  parseMobileHierarchy,
  shapeMobileViewTreeFlat,
  type MobileControlItem
} from "./mobile-view-tree.js";
export {
  mergeSmartWait,
  parseSmartWaitFromPayload,
  recipeSettleDelay,
  resolveLaunchSettleWait,
  runSmartWait,
  smartWaitFromEnv,
  type LaunchPlatform,
  type SmartWaitOptions,
  type WaitUntilMode
} from "./smart-wait.js";
export { parseUiHeuristicsFromPayload } from "./ui-heuristics.js";
export {
  findUiNode,
  normalizedSwipePoints,
  parseAndroidHierarchy,
  parseIosHierarchy,
  parseHarmonyLayoutJson,
  extractHarmonyDumpPath,
  type UiNode,
  type UiPickResult,
  type ScreenSize
} from "@ada/mobile-ui";
export { resolvePlaywrightBringToFront, resolvePlaywrightHeadless } from "./playwright-defaults.js";
export { ElementIdCache, locatorCacheKey } from "./mobile-element-cache.js";
export { isTransientMobileErrorCode, MOBILE_TRANSIENT_ERROR_CODES } from "./mobile-transient-errors.js";
export {
  defaultCdpPort,
  ensureCdpEndpointReady,
  parseCdpEndpoint,
  probeCdpEndpoint,
  resolveCdpAutoLaunchPlan,
  resolveCdpBrowserFamily,
  resolveChromiumCdpUserDataDir,
  stopCdpSpawn,
  cleanupCdpSpawns,
  cleanupAllCdpSpawns,
  cleanupAllCdpSpawnsDetached,
  forceKillProcessTree,
  forceKillProcessTreeDetached,
  type CdpAutoLaunchPlan,
  type CdpBrowserFamily,
  type CdpSpawnHandle
} from "./cdp-auto-launch.js";
export {
  executeAndroidMethodInvoke,
  executeMobileHttpInvoke,
  extractWebDriverElementId,
  fetchWebDriverJson,
  isHttpServerUrl,
  resolveMobileHttpPath,
  shouldRecoverMobileServer,
  shouldRecoverWebDriverSession,
  withMobileHttpRecovery,
  withWebDriverSessionRecovery,
  type AdbRunner,
  type WebDriverJsonResponse
} from "./mobile-invoke.js";

export {
  SWIPE_DURATION_MS,
  resolveSwipeDurationMs,
  withSwipeDuration,
  type SwipePreset,
  type ResolveSwipeDurationOptions
} from "./swipe-duration.js";

export {
  SWIPE_POINT_PRESETS,
  resolveSwipeEndpoints,
  resolveSwipePoint,
  type ResolveSwipeCoordsOptions,
  type SwipePointInput
} from "./swipe-coords.js";

export {
  computePinchFingerEnds,
  resolvePinchDistance,
  resolvePinchGesture,
  type PinchFingerEnds,
  type ResolvePinchOptions
} from "./pinch-coords.js";

export { buildDualPointerPinchActions } from "./pinch-gesture.js";
export { readPinchEndsFromPayload } from "./pinch-payload.js";

export function mergeOptionsIntoPayload(payload?: Record<string, unknown>): Record<string, unknown> {
  const p = { ...asRecord(payload) };
  const options = asRecord(p.options);
  for (const key of [
    "browser",
    "headless",
    "bringToFront",
    "userDataDir",
    "storageStatePath",
    "storageState",
    "launchOptions",
    "contextOptions",
    "cdpEndpoint",
    "cdpAutoLaunch",
    "cdpPort",
    "cdpLaunchArgs",
    "browserURL",
    "cdpUrl",
    "executablePath",
    "browserPath",
    "browserExecutable",
    "channel",
    "engine",
    "browserName",
    "browserBinary",
    "profile"
  ]) {
    if (p[key] === undefined && options[key] !== undefined) {
      p[key] = options[key];
    }
  }
  return p;
}
