import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  ElementIdCache,
  executeMobileHttpInvoke,
  extractWebDriverElementId,
  fetchWebDriverJson,
  locatorCacheKey,
  normalizeInvokePayload,
  normalizeMobileCustomAction,
  parseUiHeuristicsFromPayload,
  platformRecipeErrorCode,
  normalizedSwipePoints,
  buildDualPointerPinchActions,
  readPinchEndsFromPayload,
  resolveSwipeDurationMs,
  runMobileCustomAction,
  withMobileHttpRecovery
} from "@ada/driver-rpc";
import { buildIosRecipeContext } from "./recipe-context.js";
import { restartIosWdaServer } from "@ada/install-deps";
import { ensureIosIproxyForward, retryAsync } from "@ada/runtime-probe";
import type { UiPickResult } from "@ada/mobile-ui";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  IOSAdapter,
  IOSAdapterSession,
  IOSControlChannel,
  IOSObserveChannel,
  IOSPayload
} from "./adapter.js";
import { capsOf, iosSessionSignature, serverUrlOf } from "./session-signature.js";
import { executeIosDeviceAdmin } from "./device-admin.js";
import { iosLocatorToUsing, isIosClearTypeOp } from "./ios-locator.js";
import { iosPickToXpathCandidates } from "./ios-pick-locator.js";
import { tapAtPointWithFallback } from "./ios-tap-at.js";

function fail(command: CommandEnvelope, code: string, message: string): CommandResult {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}

function ensurePoint(v?: [number, number]): [number, number] | null {
  if (!v || v.length !== 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(x), Math.round(y)];
}

function ensureElementCache(session: IOSAdapterSession): ElementIdCache {
  if (!session.elementCache) {
    session.elementCache = new ElementIdCache();
  }
  return session.elementCache;
}

function invalidateElementCache(session: IOSAdapterSession): void {
  session.elementCache?.clear();
}

type WdaFetchFn = (
  method: string,
  url: string,
  body?: unknown
) => Promise<Awaited<ReturnType<typeof fetchWebDriverJson>>>;

async function findElement(
  session: IOSAdapterSession,
  payload: IOSPayload,
  wdaFetch: WdaFetchFn,
  opts?: { attempts?: number; delayMs?: number }
): Promise<{ ok: true; elementId: string } | { ok: false; code: string; message: string }> {
  if (payload.elementId) return { ok: true, elementId: payload.elementId };
  const cacheKey = locatorCacheKey(payload.locator);
  if (cacheKey) {
    const cached = ensureElementCache(session).get(cacheKey);
    if (cached) return { ok: true, elementId: cached };
  }
  const locator = payload.locator;
  if (!locator) return { ok: false, code: "IOS_LOCATOR_MISSING", message: "missing locator or point" };
  const mapped = iosLocatorToUsing(locator);
  if (!mapped) return { ok: false, code: "IOS_LOCATOR_UNSUPPORTED", message: "unsupported locator type" };
  const { using, value } = mapped;
  const attempts = opts?.attempts ?? 3;
  const delayMs = opts?.delayMs ?? 500;
  const res = await retryAsync(
    () => wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/element`, { using, value }),
    { attempts, delayMs }
  ).catch(() => ({ ok: false, status: 0, value: undefined, raw: {} as Record<string, unknown> }));
  if (!res.ok) return { ok: false, code: "IOS_LOCATOR_LOOKUP_FAILED", message: JSON.stringify(res.raw ?? {}) };
  const elementId = extractWebDriverElementId(res.value);
  if (!elementId) return { ok: false, code: "IOS_ELEMENT_NOT_FOUND", message: "element id missing" };
  if (cacheKey) {
    ensureElementCache(session).set(cacheKey, elementId);
  }
  return { ok: true, elementId };
}

async function tapAtPoint(session: IOSAdapterSession, point: [number, number], wdaFetch: WdaFetchFn): Promise<void> {
  await tapAtPointWithFallback(wdaFetch, session.serverUrl, session.sessionId, point);
}

async function clickPickElement(
  session: IOSAdapterSession,
  pick: UiPickResult,
  wdaFetch: WdaFetchFn,
  control: IOSControlChannel
): Promise<void> {
  let lastErr = "element not found";
  for (const xpath of iosPickToXpathCandidates(pick)) {
    const el = await findElement(session, { locator: { xpath } }, wdaFetch, { attempts: 1, delayMs: 0 });
    if (!el.ok) {
      lastErr = el.message;
      continue;
    }
    await control.click(el.elementId);
    return;
  }
  throw new Error(lastErr);
}

async function typeOnPickElement(
  session: IOSAdapterSession,
  pick: UiPickResult,
  text: string,
  wdaFetch: WdaFetchFn,
  control: IOSControlChannel
): Promise<void> {
  let lastErr = "search input element not found";
  for (const xpath of iosPickToXpathCandidates(pick.kind === "input" ? pick : { ...pick, kind: "input" })) {
    const el = await findElement(session, { locator: { xpath } }, wdaFetch, { attempts: 1, delayMs: 0 });
    if (!el.ok) {
      lastErr = el.message;
      continue;
    }
    await control.click(el.elementId);
    const clearRes = await wdaFetch(
      "POST",
      `${session.serverUrl}/session/${session.sessionId}/element/${el.elementId}/clear`
    );
    if (!clearRes.ok) {
      await control.type(el.elementId, "");
    }
    await control.type(el.elementId, text);
    return;
  }
  throw new Error(lastErr);
}

async function executeInvoke(
  session: IOSAdapterSession,
  command: CommandEnvelope,
  payload: IOSPayload,
  recoverSession: () => Promise<void>
): Promise<CommandResult> {
  const invoke = normalizeInvokePayload(payload as unknown as Record<string, unknown>, "http");
  if (!invoke?.http?.method || !invoke.http.path) {
    return fail(
      command,
      "INVOKE_INVALID_PAYLOAD",
      "invoke requires http.method and http.path (or legacy custom.method/path)"
    );
  }
  return executeMobileHttpInvoke(command, {
    baseUrl: session.serverUrl,
    sessionId: session.sessionId,
    invoke: invoke.http,
    driver: "ios",
    platform: "ios",
    recoverSession,
    restartServer: () => restartIosWdaServer(),
    lastServerRestartAt: WdaClientAdapter.lastServerRestartAt
  });
}

export class WdaClientAdapter implements IOSAdapter {
  readonly name = "wda-http-adapter";
  static lastServerRestartAt = { value: 0 };

  private async recoverWdaSession(session: IOSAdapterSession, payload: IOSPayload): Promise<void> {
    await this.destroySession(session).catch(() => undefined);
    invalidateElementCache(session);
    const fresh = await this.createSession(payload);
    session.sessionId = fresh.sessionId;
    session.serverUrl = fresh.serverUrl;
    session.signature = fresh.signature;
    session.elementCache = fresh.elementCache;
  }

  private bindWdaFetch(session: IOSAdapterSession, payload: IOSPayload): WdaFetchFn {
    const recoverSession = () => this.recoverWdaSession(session, payload);
    const restartServer = () => restartIosWdaServer();
    return (method, url, body) =>
      withMobileHttpRecovery(() => fetchWebDriverJson(method, url, body), {
        recoverSession,
        restartServer,
        lastServerRestartAt: WdaClientAdapter.lastServerRestartAt
      });
  }

  private async createWdaSession(serverUrl: string, payload: IOSPayload): Promise<IOSAdapterSession> {
    const res = await withMobileHttpRecovery(
      () => fetchWebDriverJson("POST", `${serverUrl}/session`, { capabilities: capsOf(payload) }),
      {
        recoverSession: async () => undefined,
        restartServer: () => restartIosWdaServer(),
        lastServerRestartAt: WdaClientAdapter.lastServerRestartAt
      }
    );
    const value = (res.value ?? {}) as Record<string, unknown>;
    const sessionId = value.sessionId;
    if (!res.ok || typeof sessionId !== "string") {
      throw new Error(`create session failed: ${JSON.stringify(res.raw ?? {})}`);
    }
    return { sessionId, serverUrl, signature: iosSessionSignature(payload), elementCache: new ElementIdCache() };
  }

  async createSession(payload: IOSPayload): Promise<IOSAdapterSession> {
    if (payload.mock === true) {
      return {
        sessionId: `mock-ios-${Date.now()}`,
        serverUrl: "mock",
        signature: iosSessionSignature(payload),
        elementCache: new ElementIdCache()
      };
    }
    const caps = capsOf(payload);
    const udid = String(caps.udid ?? "").trim();
    const fwd = await ensureIosIproxyForward({ udid: udid || undefined });
    if (fwd.serverUrl && !payload.serverUrl && !process.env.ADA_WDA_SERVER_URL?.trim()) {
      process.env.ADA_WDA_SERVER_URL = fwd.serverUrl;
    }
    const serverUrl = serverUrlOf(payload);
    return this.createWdaSession(serverUrl, payload);
  }

  async execute(session: IOSAdapterSession, command: CommandEnvelope, payload: IOSPayload): Promise<CommandResult> {
    if (payload.mock === true) {
      if (command.command === "invoke") {
        const invoke = normalizeInvokePayload(payload as unknown as Record<string, unknown>, "http");
        if (!invoke?.http?.method || !invoke.http.path) {
          return fail(command, "INVOKE_INVALID_PAYLOAD", "invoke requires http.method and http.path");
        }
        return {
          requestId: command.requestId,
          success: true,
          data: {
            driver: "ios",
            platform: "ios",
            command: "invoke",
            mode: "mock",
            rpcMode: "http",
            http: invoke.http
          }
        };
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "ios", platform: "ios", command: command.command, mode: "mock" }
      };
    }
    const wdaFetch = this.bindWdaFetch(session, payload);
    const recoverSession = () => this.recoverWdaSession(session, payload);
    const control: IOSControlChannel = {
      click: async (elementId: string) => {
        const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/element/${elementId}/click`);
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      type: async (elementId: string, text: string) => {
        const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/element/${elementId}/value`, {
          value: Array.from(text)
        });
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      swipe: async (from: [number, number], to: [number, number], durationSec = 0.3) => {
        const res = await wdaFetch(
          "POST",
          `${session.serverUrl}/session/${session.sessionId}/wda/dragfromtoforduration`,
          { fromX: from[0], fromY: from[1], toX: to[0], toY: to[1], duration: durationSec }
        );
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      back: async () => {
        const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/back`);
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      home: async () => {
        const res = await wdaFetch("POST", `${session.serverUrl}/wda/homescreen`);
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      launchApp: async (bundleId: string) => {
        const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/wda/apps/launch`, { bundleId });
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      exitApp: async (bundleId: string) => {
        const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/wda/apps/terminate`, { bundleId });
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      }
    };
    const observe: IOSObserveChannel = {
      screenshot: async (outputPath: string) => {
        const res = await wdaFetch("GET", `${session.serverUrl}/session/${session.sessionId}/screenshot`);
        if (!res.ok || typeof res.value !== "string") throw new Error(JSON.stringify(res.raw ?? {}));
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, Buffer.from(res.value, "base64"));
        return outputPath;
      },
      pageSource: async () => {
        const res = await wdaFetch("GET", `${session.serverUrl}/session/${session.sessionId}/source`);
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
        return String(res.value ?? "");
      }
    };

    if (command.command === "wait") {
      const timeoutMs = typeof payload.timeoutMs === "number" ? Math.max(0, payload.timeoutMs) : 300;
      await new Promise((r) => setTimeout(r, timeoutMs));
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "wait", timeoutMs } };
    }
    if (command.command === "back") {
      await control.back();
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "back" } };
    }
    if (command.command === "pressHome" || command.command === "home") {
      await control.home();
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "pressHome" } };
    }
    if (command.command === "screenshot") {
      const output = payload.screenshotPath ?? path.join(process.cwd(), "artifacts", `${command.requestId}-ios.png`);
      await observe.screenshot(output);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "screenshot", screenshot: output } };
    }
    if (command.command === "swipe") {
      const from = ensurePoint(payload.from);
      const to = ensurePoint(payload.to);
      if (!from || !to) return fail(command, "IOS_SWIPE_MISSING_POINTS", "swipe requires from/to");
      const screen = {
        width: Number(payload.screenWidth ?? 390),
        height: Number(payload.screenHeight ?? 844)
      };
      const relative = (payload as Record<string, unknown>).relative === true;
      const norm = normalizedSwipePoints(screen, from, to, { relative });
      const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, { fallbackMs: 300 });
      const legacyMs =
        typeof payload.timeoutMs === "number" && payload.durationMs === undefined && payload.swipePreset === undefined
          ? Math.max(100, payload.timeoutMs)
          : durationMs;
      await control.swipe(norm.from, norm.to, Math.max(0.1, legacyMs / 1000));
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "swipe", from: norm.from, to: norm.to } };
    }
    if (command.command === "pinch") {
      const ends = readPinchEndsFromPayload(payload as Record<string, unknown>);
      if (!ends) return fail(command, "IOS_PINCH_MISSING_POINTS", "pinch requires finger1/finger2/finger1End/finger2End");
      const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, { fallbackMs: 400 });
      const pinchRes = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/actions`, {
        actions: buildDualPointerPinchActions(ends, durationMs)
      });
      if (!pinchRes.ok) {
        const legacySec = Math.max(0.1, durationMs / 1000);
        await Promise.all([
          control.swipe(ends.finger1Start, ends.finger1End, legacySec),
          control.swipe(ends.finger2Start, ends.finger2End, legacySec)
        ]);
        invalidateElementCache(session);
        return {
          requestId: command.requestId,
          success: true,
          data: {
            driver: "ios",
            command: "pinch",
            durationMs,
            pinchIn: payload.pinchIn,
            fallback: "dual-swipe"
          }
        };
      }
      invalidateElementCache(session);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "ios", command: "pinch", durationMs, pinchIn: payload.pinchIn, mode: "w3c-actions" }
      };
    }
    if (command.command === "deviceAdmin") {
      return executeIosDeviceAdmin(command, session, payload as Record<string, unknown>, wdaFetch, (point) =>
        tapAtPoint(session, point, wdaFetch)
      );
    }
    if (command.command === "launchApp" || command.command === "exitApp") {
      const appId = String(payload.bundleId ?? payload.appId ?? "");
      if (!appId) return fail(command, "IOS_BUNDLE_ID_MISSING", "launch/exit requires bundleId");
      if (command.command === "launchApp") {
        await control.launchApp(appId);
      } else {
        await control.exitApp(appId);
      }
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: command.command, bundleId: appId } };
    }
    if (command.command === "invoke") {
      return executeInvoke(session, command, payload, recoverSession);
    }
    if (command.command === "custom") {
      const rawAction = String(payload.custom?.action ?? payload.custom?.method ?? "");
      const action = normalizeMobileCustomAction(rawAction, payload.custom?.method);
      if (["dump_ui", "tap_search", "fill_search", "smart_wait"].includes(action)) {
        const screen = {
          width: Number((payload as { screenWidth?: number }).screenWidth ?? 390),
          height: Number((payload as { screenHeight?: number }).screenHeight ?? 844)
        };
        const ctx = buildIosRecipeContext(observe, control, screen, {
          tapAt: (point) => tapAtPoint(session, point, wdaFetch),
          sendKeys: async (text) => {
            const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/wda/keys`, {
              value: Array.from(text)
            });
            if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
          },
          clickPick: async (pick) => {
            await clickPickElement(session, pick, wdaFetch, control);
            invalidateElementCache(session);
            if (pick.kind === "entry") {
              await recoverSession();
            }
          },
          typeOnPick: (pick, text) => typeOnPickElement(session, pick, text, wdaFetch, control),
          heuristics: parseUiHeuristicsFromPayload(payload as unknown as Record<string, unknown>)
        });
        const outcome = await runMobileCustomAction(action, ctx, {
          text: String(payload.text ?? payload.custom?.text ?? ""),
          maxBack: typeof payload.custom?.maxBack === "number" ? payload.custom.maxBack : 3,
          payload: payload as unknown as Record<string, unknown>
        });
        if (outcome.handled) {
          const ok = outcome.recipe?.ok !== false;
          invalidateElementCache(session);
          return {
            requestId: command.requestId,
            success: ok,
            ...(ok
              ? {
                  data: {
                    driver: "ios",
                    command: "custom",
                    action,
                    value: outcome.value,
                    recipe: outcome.recipe
                  }
                }
              : {
                  errorCode:
                    outcome.errorCode ??
                    outcome.recipe?.errorCode ??
                    platformRecipeErrorCode("ios", action as "tap_search"),
                  errorMessage: outcome.recipe?.detail ?? "recipe failed"
                })
          };
        }
      }
      const method = String(payload.custom?.method ?? "").toLowerCase();
      if (method === "page_source") {
        const source = await observe.pageSource?.();
        return { requestId: command.requestId, success: true, data: { driver: "ios", command: "custom", action: "page_source", value: source ?? "" } };
      }
      return fail(
        command,
        "IOS_CUSTOM_UNSUPPORTED",
        "supported custom: dump_ui|tap_search|fill_search|smart_wait|method=page_source"
      );
    }
    if (command.command === "click") {
      const point = ensurePoint(payload.point);
      if (point) {
        await tapAtPoint(session, point, wdaFetch);
        invalidateElementCache(session);
        return { requestId: command.requestId, success: true, data: { driver: "ios", command: "click", point } };
      }
    }
    const el = await findElement(session, payload, wdaFetch);
    if (!el.ok) return fail(command, el.code, el.message);
    if (command.command === "click") {
      await control.click(el.elementId);
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "click" } };
    }
    if (command.command === "type") {
      if (isIosClearTypeOp(payload)) {
        const clickRes = await wdaFetch(
          "POST",
          `${session.serverUrl}/session/${session.sessionId}/element/${el.elementId}/click`
        );
        if (!clickRes.ok) return fail(command, "IOS_CLEAR_CLICK_FAILED", JSON.stringify(clickRes.raw ?? {}));
        const clearRes = await wdaFetch(
          "POST",
          `${session.serverUrl}/session/${session.sessionId}/element/${el.elementId}/clear`
        );
        if (!clearRes.ok) {
          await control.type(el.elementId, "");
        }
        invalidateElementCache(session);
        return { requestId: command.requestId, success: true, data: { driver: "ios", command: "type", inputOp: "clear" } };
      }
      const text = String(payload.text ?? "");
      await control.type(el.elementId, text);
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "type" } };
    }
    if (command.command === "getText" || command.command === "assertText") {
      const res = await wdaFetch("GET", `${session.serverUrl}/session/${session.sessionId}/element/${el.elementId}/text`);
      if (!res.ok) return fail(command, "IOS_GET_TEXT_FAILED", JSON.stringify(res.raw ?? {}));
      const text = String(res.value ?? "");
      if (command.command === "assertText") {
        const expected = String(payload.expectedText ?? payload.text ?? "");
        if (!text.includes(expected)) return fail(command, "IOS_ASSERT_TEXT_FAILED", `expected "${expected}", got "${text}"`);
      }
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: command.command, text } };
    }
    if (command.command === "assertVisible") {
      const res = await wdaFetch("GET", `${session.serverUrl}/session/${session.sessionId}/element/${el.elementId}/displayed`);
      if (!res.ok || !res.value) return fail(command, "IOS_ASSERT_VISIBLE_FAILED", JSON.stringify(res.raw ?? {}));
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "assertVisible" } };
    }
    return fail(command, "IOS_UNSUPPORTED_COMMAND", `unsupported command: ${command.command}`);
  }

  async destroySession(session: IOSAdapterSession): Promise<void> {
    if (session.serverUrl === "mock") return;
    await fetchWebDriverJson("DELETE", `${session.serverUrl}/session/${session.sessionId}`).catch(() => undefined);
  }
}
