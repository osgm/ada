import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  ElementIdCache,
  executeAndroidMethodInvoke,
  executeMobileHttpInvoke,
  extractWebDriverElementId,
  fetchWebDriverJson,
  locatorCacheKey,
  normalizeInvokePayload,
  normalizeMobileCustomAction,
  normalizedSwipePoints,
  parseUiHeuristicsFromPayload,
  platformRecipeErrorCode,
  buildDualPointerPinchActions,
  resolveSwipeDurationMs,
  readPinchEndsFromPayload,
  runMobileCustomAction,
  withMobileHttpRecovery
} from "@ada/driver-rpc";
import { buildAndroidRecipeContext } from "./recipe-context.js";
import { restartAndroidUia2Server } from "@ada/install-deps";
import { retryAsync } from "@ada/runtime-probe";
import fs from "node:fs/promises";
import path from "node:path";
import { runAdb } from "./adb-runner.js";
import type {
  AndroidAdapter,
  AndroidAdapterSession,
  AndroidControlChannel,
  AndroidObserveChannel,
  AndroidPayload
} from "./adapter.js";
import { resolveAndroidTransport } from "./resolve-transport.js";
import { androidSessionSignature, deviceSerialOf } from "./session-signature.js";
import { executeAndroidDeviceAdmin } from "./device-admin.js";

interface UiNode {
  text: string;
  contentDesc: string;
  resourceId: string;
  bounds: [number, number, number, number] | null;
}

function fail(command: CommandEnvelope, code: string, message: string): CommandResult {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}

async function runAndroidDeviceShell(payload: AndroidPayload, cmd: string) {
  const serial = deviceSerialOf(payload);
  if (!serial) {
    return { ok: false as const, stdout: "", stderr: "device serial missing (capabilities.udid)" };
  }
  return runAdb(serial, ["shell", "sh", "-c", cmd]);
}

function customShellSuccess(command: CommandEnvelope, value: string): CommandResult {
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "android", mode: "real", command: "custom", action: "shell", value }
  };
}

const HIERARCHY_CACHE_MS = Number(process.env.ADA_ANDROID_HIERARCHY_CACHE_MS ?? 2000);

function ensureElementCache(session: AndroidAdapterSession): ElementIdCache {
  if (!session.elementCache) {
    session.elementCache = new ElementIdCache();
  }
  return session.elementCache;
}

function invalidateUiCaches(session: AndroidAdapterSession): void {
  session.hierarchyCache = undefined;
  session.elementCache?.clear();
}

function hierarchyCacheTtlMs(): number {
  const n = HIERARCHY_CACHE_MS;
  return Number.isFinite(n) && n > 0 ? n : 2000;
}

function ensurePoint(v?: [number, number]): [number, number] | null {
  if (!v || v.length !== 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(x), Math.round(y)];
}

function decodeXmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseBounds(raw: string): [number, number, number, number] | null {
  const m = raw.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function centerOf(bounds: [number, number, number, number]): [number, number] {
  const [x1, y1, x2, y2] = bounds;
  return [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)];
}

function parseUiNodes(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  const tagRe = /<node\s+[^>]*\/?>/g;
  const attrRe = /([a-zA-Z0-9:_-]+)="([^"]*)"/g;
  for (const tag of xml.match(tagRe) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(attrRe)) {
      attrs[m[1]] = decodeXmlAttr(m[2]);
    }
    nodes.push({
      text: attrs.text ?? "",
      contentDesc: attrs["content-desc"] ?? "",
      resourceId: attrs["resource-id"] ?? "",
      bounds: parseBounds(attrs.bounds ?? "")
    });
  }
  return nodes;
}

function nodeText(node: UiNode): string {
  return node.text || node.contentDesc || "";
}

function escapeXpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return `concat(${value
    .split('"')
    .map((part, i) => (i === 0 ? `"${part}"` : `, '"', "${part}"`))
    .join("")})`;
}

function findNode(nodes: UiNode[], payload: AndroidPayload): UiNode | null {
  const locator = payload.locator;
  if (!locator) return null;
  if (locator.text) {
    const label = String(locator.text);
    return (
      nodes.find((n) => (n.text && n.text.includes(label)) || (n.contentDesc && n.contentDesc.includes(label))) ??
      null
    );
  }
  if (locator.id) {
    return nodes.find((n) => n.resourceId === locator.id || n.resourceId.endsWith(`:${locator.id}`)) ?? null;
  }
  if (locator.accessibilityId) {
    return nodes.find((n) => n.contentDesc === locator.accessibilityId) ?? null;
  }
  if (locator.xpath) {
    const textEq = locator.xpath.match(/@text=['"](.+?)['"]/);
    if (textEq?.[1]) return nodes.find((n) => n.text === textEq[1]) ?? null;
    const ridEq = locator.xpath.match(/@resource-id=['"](.+?)['"]/);
    if (ridEq?.[1]) return nodes.find((n) => n.resourceId === ridEq[1]) ?? null;
    const descEq = locator.xpath.match(/@content-desc=['"](.+?)['"]/);
    if (descEq?.[1]) return nodes.find((n) => n.contentDesc === descEq[1]) ?? null;
  }
  return null;
}

class AdbControlChannel implements AndroidControlChannel {
  constructor(private readonly serial: string) {}

  async click(point: [number, number]): Promise<void> {
    const [x, y] = point;
    const res = await runAdb(this.serial, ["shell", "input", "tap", String(x), String(y)]);
    if (!res.ok) throw new Error(res.stderr || "adb tap failed");
  }

  async type(text: string): Promise<void> {
    const escaped = text.replace(/ /g, "%s");
    const res = await runAdb(this.serial, ["shell", "input", "text", escaped]);
    if (!res.ok) throw new Error(res.stderr || "adb input text failed");
  }

  async swipe(from: [number, number], to: [number, number], durationMs = 300): Promise<void> {
    const res = await runAdb(this.serial, [
      "shell",
      "input",
      "swipe",
      String(from[0]),
      String(from[1]),
      String(to[0]),
      String(to[1]),
      String(durationMs)
    ]);
    if (!res.ok) throw new Error(res.stderr || "adb swipe failed");
  }

  async back(): Promise<void> {
    const res = await runAdb(this.serial, ["shell", "input", "keyevent", "4"]);
    if (!res.ok) throw new Error(res.stderr || "adb back failed");
  }

  async home(): Promise<void> {
    const res = await runAdb(this.serial, ["shell", "input", "keyevent", "3"]);
    if (!res.ok) throw new Error(res.stderr || "adb home failed");
  }

  async launchApp(appId: string): Promise<void> {
    const res = await runAdb(this.serial, ["shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]);
    if (!res.ok) throw new Error(res.stderr || "adb launch app failed");
  }

  async exitApp(appId: string): Promise<void> {
    const res = await runAdb(this.serial, ["shell", "am", "force-stop", appId]);
    if (!res.ok) throw new Error(res.stderr || "adb exit app failed");
  }
}

class AdbObserveChannel implements AndroidObserveChannel {
  constructor(private readonly serial: string) {}

  async screenshot(outputPath: string): Promise<string> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const res = await runAdb(this.serial, ["exec-out", "screencap", "-p"], true);
    if (!res.ok || !res.stdout) {
      throw new Error(res.stderr || "adb screencap failed");
    }
    await fs.writeFile(outputPath, Buffer.from(res.stdout, "binary"));
    return outputPath;
  }

  async dumpHierarchy(): Promise<string> {
    const res = await runAdb(this.serial, ["shell", "uiautomator", "dump", "/sdcard/ada-uix.xml"]);
    if (!res.ok) throw new Error(res.stderr || "uiautomator dump failed");
    const pull = await runAdb(this.serial, ["exec-out", "cat", "/sdcard/ada-uix.xml"], true);
    if (!pull.ok) throw new Error(pull.stderr || "cat hierarchy failed");
    return pull.stdout;
  }
}

async function loadHierarchyWithRetry(observe: AdbObserveChannel): Promise<string | null> {
  if (!observe.dumpHierarchy) return null;
  try {
    return await retryAsync(() => observe.dumpHierarchy!(), { attempts: 3, delayMs: 500 });
  } catch {
    return null;
  }
}

async function getCachedHierarchy(
  session: AndroidAdapterSession,
  observe: AdbObserveChannel
): Promise<string | null> {
  const ttl = hierarchyCacheTtlMs();
  const cached = session.hierarchyCache;
  if (cached && Date.now() - cached.at < ttl) {
    return cached.xml;
  }
  const xml = await loadHierarchyWithRetry(observe);
  if (xml) {
    session.hierarchyCache = { xml, at: Date.now() };
  }
  return xml;
}

function locatorToUsing(payload: AndroidPayload): { using: string; value: string } | null {
  const locator = payload.locator;
  if (!locator) return null;
  if (locator.id) return { using: "id", value: locator.id };
  if (locator.accessibilityId) return { using: "accessibility id", value: locator.accessibilityId };
  if (locator.xpath) return { using: "xpath", value: locator.xpath };
  if (locator.text) {
    const lit = escapeXpathLiteral(String(locator.text));
    return {
      using: "xpath",
      value: `//*[contains(@text, ${lit}) or contains(@content-desc, ${lit})]`
    };
  }
  return null;
}

function isAndroidClearOp(payload: AndroidPayload): boolean {
  return payload.inputOp === "clear" || payload.androidInputOp === "clear";
}

async function clearAndroidInputAdb(
  serial: string,
  control: AdbControlChannel,
  observe: AdbObserveChannel,
  session: AndroidAdapterSession,
  payload: AndroidPayload
): Promise<void> {
  let point = ensurePoint(payload.point);
  if (!point && payload.locator) {
    const xml = await getCachedHierarchy(session, observe);
    const node = xml ? findNode(parseUiNodes(xml), payload) : null;
    if (node?.bounds) point = centerOf(node.bounds);
  }
  if (point) {
    await control.click(point);
    await new Promise((r) => setTimeout(r, 400));
  }
  for (let i = 0; i < 16; i++) {
    await runAdb(serial, ["shell", "input", "keyevent", "67"]);
    await new Promise((r) => setTimeout(r, 40));
  }
}

async function findHttpElement(
  session: AndroidAdapterSession,
  base: string,
  payload: AndroidPayload,
  httpFetch: (method: string, url: string, body?: unknown) => ReturnType<typeof fetchWebDriverJson>
): Promise<string | null> {
  if (payload.elementId) return payload.elementId;
  const cacheKey = locatorCacheKey(payload.locator);
  if (cacheKey) {
    const cached = ensureElementCache(session).get(cacheKey);
    if (cached) return cached;
  }
  const using = locatorToUsing(payload);
  if (!using) return null;
  const el = await retryAsync(() => httpFetch("POST", `${base}/element`, using), { attempts: 3, delayMs: 500 }).catch(
    () => ({ ok: false, status: 0, value: undefined, raw: {} as Record<string, unknown> })
  );
  if (!el.ok) return null;
  const elementId = extractWebDriverElementId(el.value);
  if (elementId && cacheKey) {
    ensureElementCache(session).set(cacheKey, elementId);
  }
  return elementId;
}

export class Uia2AdbAdapter implements AndroidAdapter {
  readonly name = "adb-uia2-adapter";
  private static lastServerRestartAt = { value: 0 };

  async createSession(payload: AndroidPayload): Promise<AndroidAdapterSession> {
    const signature = androidSessionSignature(payload);
    if (payload.mock === true) {
      const resolved = await resolveAndroidTransport(payload).catch(() => ({
        transport: "adb" as const,
        serverUrl: deviceSerialOf(payload) || "mock"
      }));
      return {
        sessionId: `mock-${deviceSerialOf(payload) || "default"}-${Date.now()}`,
        serverUrl: resolved.transport === "http" ? resolved.serverUrl : deviceSerialOf(payload) || "mock",
        signature,
        transport: resolved.transport,
        elementCache: new ElementIdCache()
      };
    }
    const resolved = await resolveAndroidTransport(payload);
    if (resolved.transport === "http") {
      const baseUrl = resolved.serverUrl;
      const res = await withMobileHttpRecovery(
        () =>
          fetchWebDriverJson("POST", `${baseUrl}/session`, {
            capabilities: payload.capabilities ?? { platformName: "Android", automationName: "UiAutomator2" }
          }),
        {
          recoverSession: async () => undefined,
          restartServer: () => restartAndroidUia2Server({ serial: deviceSerialOf(payload) }),
          lastServerRestartAt: Uia2AdbAdapter.lastServerRestartAt
        }
      );
      const value = (res.value ?? {}) as Record<string, unknown>;
      const sessionId = value.sessionId;
      if (!res.ok || typeof sessionId !== "string") {
        throw new Error(`UIA2 create session failed: ${JSON.stringify(res.raw ?? {})}`);
      }
      return {
        sessionId,
        serverUrl: baseUrl,
        signature,
        transport: "http",
        elementCache: new ElementIdCache()
      };
    }
    const serial = resolved.serverUrl;
    const check = await runAdb(serial, ["get-state"]);
    if (!check.ok) {
      throw new Error(`adb device unavailable: ${check.stderr || "no device"}`);
    }
    return {
      sessionId: `${serial || "default"}-${Date.now()}`,
      serverUrl: serial,
      signature,
      transport: "adb",
      elementCache: new ElementIdCache()
    };
  }

  private async recoverHttpSession(session: AndroidAdapterSession, payload: AndroidPayload): Promise<void> {
    await fetchWebDriverJson("DELETE", `${session.serverUrl}/session/${session.sessionId}`).catch(() => undefined);
    invalidateUiCaches(session);
    const fresh = await this.createSession(payload);
    session.sessionId = fresh.sessionId;
    session.serverUrl = fresh.serverUrl;
    session.signature = fresh.signature;
    session.transport = fresh.transport;
    session.elementCache = fresh.elementCache;
    session.hierarchyCache = fresh.hierarchyCache;
  }

  private bindHttpFetch(session: AndroidAdapterSession, payload: AndroidPayload) {
    const serial = deviceSerialOf(payload);
    return (method: string, url: string, body?: unknown) =>
      withMobileHttpRecovery(() => fetchWebDriverJson(method, url, body), {
        recoverSession: () => this.recoverHttpSession(session, payload),
        restartServer: () => restartAndroidUia2Server({ serial }),
        lastServerRestartAt: Uia2AdbAdapter.lastServerRestartAt
      });
  }

  private async executeInvoke(
    session: AndroidAdapterSession,
    command: CommandEnvelope,
    payload: AndroidPayload
  ): Promise<CommandResult> {
    const normalized = normalizeInvokePayload(payload as unknown as Record<string, unknown>, "http");
    if (normalized?.mode === "http" && normalized.http?.method && normalized.http.path) {
      if (session.transport !== "http") {
        return fail(
          command,
          "ANDROID_INVOKE_HTTP_REQUIRES_UIA2",
          "http invoke requires payload.serverUrl or ADA_ANDROID_UIA2_SERVER_URL (UiAutomator2/Appium server)"
        );
      }
      return executeMobileHttpInvoke(command, {
        baseUrl: session.serverUrl,
        sessionId: session.sessionId,
        invoke: normalized.http,
        driver: "android",
        platform: "android",
        recoverSession: () => this.recoverHttpSession(session, payload),
        restartServer: () => restartAndroidUia2Server({ serial: deviceSerialOf(payload) }),
        lastServerRestartAt: Uia2AdbAdapter.lastServerRestartAt
      });
    }
    const methodInvoke = normalizeInvokePayload(payload as unknown as Record<string, unknown>, "method");
    if (!methodInvoke?.method) {
      return fail(
        command,
        "INVOKE_INVALID_PAYLOAD",
        "invoke requires http.method/path or method (adb: shell|tap|swipe|dumpHierarchy|getState|screenshot)"
      );
    }
    if (session.transport === "http") {
      return fail(command, "ANDROID_INVOKE_METHOD_REQUIRES_ADB", "method invoke is only available in adb transport mode");
    }
    const observe = new AdbObserveChannel(session.serverUrl);
    return executeAndroidMethodInvoke(command, {
      serial: session.serverUrl,
      invoke: {
        target: methodInvoke.target,
        method: methodInvoke.method,
        args: methodInvoke.args
      },
      runAdb,
      dumpHierarchy: () => observe.dumpHierarchy!()
    });
  }

  async execute(session: AndroidAdapterSession, command: CommandEnvelope, payload: AndroidPayload): Promise<CommandResult> {
    if (payload.mock === true) {
      if (command.command === "invoke") {
        const normalized = normalizeInvokePayload(payload as unknown as Record<string, unknown>, "http");
        const methodInvoke = normalizeInvokePayload(payload as unknown as Record<string, unknown>, "method");
        if (normalized?.http?.method && normalized.http.path) {
          return {
            requestId: command.requestId,
            success: true,
            data: {
              driver: "android",
              platform: "android",
              command: "invoke",
              mode: "mock",
              rpcMode: "http",
              http: normalized.http
            }
          };
        }
        if (methodInvoke?.method) {
          return {
            requestId: command.requestId,
            success: true,
            data: {
              driver: "android",
              platform: "android",
              command: "invoke",
              mode: "mock",
              rpcMode: "method",
              target: methodInvoke.target ?? "adb",
              method: methodInvoke.method
            }
          };
        }
        return fail(command, "INVOKE_INVALID_PAYLOAD", "invoke requires http.method/path or method");
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "android", platform: "android", command: command.command, mode: "mock" }
      };
    }
    if (session.transport === "http") {
      return this.executeHttpSession(session, command, payload);
    }
    const control = new AdbControlChannel(session.serverUrl);
    const observe = new AdbObserveChannel(session.serverUrl);
    if (command.command === "wait") {
      const timeoutMs = typeof payload.timeoutMs === "number" ? Math.max(0, payload.timeoutMs) : 300;
      await new Promise((r) => setTimeout(r, timeoutMs));
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "wait", timeoutMs } };
    }
    if (command.command === "back") {
      await control.back();
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "back" } };
    }
    if (command.command === "pressHome" || command.command === "home") {
      await control.home();
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "home" } };
    }
    if (command.command === "screenshot") {
      const output = payload.screenshotPath ?? path.join(process.cwd(), "artifacts", `${command.requestId}-android.png`);
      await observe.screenshot(output);
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "screenshot", screenshot: output } };
    }
    if (command.command === "swipe") {
      const from = ensurePoint(payload.from);
      const to = ensurePoint(payload.to);
      if (!from || !to) return fail(command, "ANDROID_SWIPE_MISSING_POINTS", "swipe requires from/to");
      const screen = {
        width: Number(payload.screenWidth ?? 1080),
        height: Number(payload.screenHeight ?? 2400)
      };
      const relative = (payload as Record<string, unknown>).relative === true;
      const norm = normalizedSwipePoints(screen, from, to, { relative });
      const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, { fallbackMs: 300 });
      invalidateUiCaches(session);
      await control.swipe(norm.from, norm.to, durationMs);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "android", command: "swipe", durationMs }
      };
    }
    if (command.command === "pinch") {
      const ends = readPinchEndsFromPayload(payload as Record<string, unknown>);
      if (!ends) return fail(command, "ANDROID_PINCH_MISSING_POINTS", "pinch requires finger1/finger2/finger1End/finger2End");
      const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, { fallbackMs: 400 });
      invalidateUiCaches(session);
      await Promise.all([
        control.swipe(ends.finger1Start, ends.finger1End, durationMs),
        control.swipe(ends.finger2Start, ends.finger2End, durationMs)
      ]);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "android", command: "pinch", durationMs, pinchIn: payload.pinchIn }
      };
    }
    if (command.command === "launchApp" || command.command === "exitApp") {
      const appId = String(payload.appId ?? payload.packageId ?? "");
      if (!appId) return fail(command, "ANDROID_APP_ID_MISSING", "launch/exit requires appId");
      invalidateUiCaches(session);
      if (command.command === "launchApp") {
        await control.launchApp(appId);
      } else {
        await control.exitApp(appId);
      }
      return { requestId: command.requestId, success: true, data: { driver: "android", command: command.command, appId } };
    }
    if (command.command === "deviceAdmin") {
      return executeAndroidDeviceAdmin(command, payload);
    }
    if (command.command === "invoke") {
      return this.executeInvoke(session, command, payload);
    }
    if (command.command === "custom") {
      const rawAction = String(payload.custom?.action ?? payload.custom?.method ?? "").toLowerCase();
      if (rawAction === "shell") {
        const cmd = String(payload.custom?.command ?? "");
        if (!cmd) {
          return fail(command, "ANDROID_CUSTOM_SHELL_MISSING_COMMAND", "custom shell requires payload.custom.command");
        }
        const res = await runAndroidDeviceShell(payload, cmd);
        if (!res.ok) {
          return fail(command, "ANDROID_CUSTOM_SHELL_FAILED", res.stderr || "adb shell failed");
        }
        return customShellSuccess(command, res.stdout.trim());
      }
      const action = normalizeMobileCustomAction(rawAction, payload.custom?.method);
      if (["dump_ui", "tap_search", "fill_search", "tap_path", "smart_wait", "dismiss_popups"].includes(action)) {
        const screen = {
          width: Number(payload.screenWidth ?? 1080),
          height: Number(payload.screenHeight ?? 2400)
        };
        const ctx = buildAndroidRecipeContext(
          session.serverUrl,
          observe,
          control,
          screen,
          payload,
          parseUiHeuristicsFromPayload(payload),
          {
            getCachedRaw: async () => {
              const xml = await getCachedHierarchy(session, observe);
              if (!xml) throw new Error("hierarchy unavailable");
              return xml;
            },
            invalidate: () => invalidateUiCaches(session)
          }
        );
        const outcome = await runMobileCustomAction(action, ctx, {
          text: String(payload.text ?? payload.custom?.text ?? ""),
          maxBack: typeof payload.custom?.maxBack === "number" ? payload.custom.maxBack : 3,
          payload: payload as unknown as Record<string, unknown>
        });
        if (outcome.handled && action === "dismiss_popups" && outcome.recipe?.data) {
          return {
            requestId: command.requestId,
            success: true,
            data: {
              driver: "android",
              command: "custom",
              action: "dismissPopups",
              ...(outcome.recipe.data as Record<string, unknown>)
            }
          };
        }
        if (outcome.handled) {
          const ok = outcome.recipe?.ok !== false;
          return {
            requestId: command.requestId,
            success: ok,
            ...(ok
              ? {
                  data: {
                    driver: "android",
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
                    platformRecipeErrorCode("android", action as "tap_search"),
                  errorMessage: outcome.recipe?.detail ?? "recipe failed"
                })
          };
        }
      }
      return fail(
        command,
        "ANDROID_CUSTOM_UNSUPPORTED",
        "supported custom: shell|dump_ui|tap_search|fill_search|tap_path|smart_wait|dismissPopups"
      );
    }
    if (command.command === "click") {
      let point = ensurePoint(payload.point);
      if (!point && payload.locator) {
        const xml = await getCachedHierarchy(session, observe);
        const node = xml ? findNode(parseUiNodes(xml), payload) : null;
        if (node?.bounds) {
          point = centerOf(node.bounds);
        }
      }
      if (!point) return fail(command, "ANDROID_CLICK_REQUIRES_POINT", "click requires payload.point or a resolvable locator");
      invalidateUiCaches(session);
      await control.click(point);
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "click" } };
    }
    if (command.command === "type") {
      if (isAndroidClearOp(payload)) {
        invalidateUiCaches(session);
        await clearAndroidInputAdb(session.serverUrl, control, observe, session, payload);
        return { requestId: command.requestId, success: true, data: { driver: "android", command: "type", inputOp: "clear" } };
      }
      const text = String(payload.text ?? "");
      if (!text) return fail(command, "ANDROID_TYPE_REQUIRES_TEXT", "type requires payload.text");
      invalidateUiCaches(session);
      await control.type(text);
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "type" } };
    }
    if (command.command === "assertVisible" || command.command === "getText" || command.command === "assertText") {
      const xml = await getCachedHierarchy(session, observe);
      if (!xml) return fail(command, "ANDROID_DUMP_HIERARCHY_FAILED", "cannot load ui hierarchy");
      const node = findNode(parseUiNodes(xml), payload);
      if (!node) return fail(command, "ANDROID_ELEMENT_NOT_FOUND", "element not found by locator");
      const actualText = nodeText(node);
      if (command.command === "assertVisible") {
        return { requestId: command.requestId, success: true, data: { driver: "android", command: "assertVisible", visible: true } };
      }
      if (command.command === "getText") {
        return { requestId: command.requestId, success: true, data: { driver: "android", command: "getText", text: actualText } };
      }
      const expected = String(payload.expectedText ?? payload.text ?? "");
      if (!actualText.includes(expected)) {
        return fail(command, "ANDROID_ASSERT_TEXT_FAILED", `expected "${expected}", got "${actualText}"`);
      }
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "assertText", text: actualText } };
    }
    return fail(command, "ANDROID_UNSUPPORTED_COMMAND", `unsupported command: ${command.command}`);
  }

  private async executeHttpSession(
    session: AndroidAdapterSession,
    command: CommandEnvelope,
    payload: AndroidPayload
  ): Promise<CommandResult> {
    const base = `${session.serverUrl}/session/${session.sessionId}`;
    const httpFetch = this.bindHttpFetch(session, payload);
    if (command.command === "invoke") {
      return this.executeInvoke(session, command, payload);
    }
    if (command.command === "wait") {
      const timeoutMs = typeof payload.timeoutMs === "number" ? Math.max(0, payload.timeoutMs) : 300;
      await new Promise((r) => setTimeout(r, timeoutMs));
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "wait", timeoutMs } };
    }
    if (command.command === "back") {
      const res = await httpFetch("POST", `${base}/back`);
      if (!res.ok) return fail(command, "ANDROID_BACK_FAILED", JSON.stringify(res.raw ?? {}));
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "back" } };
    }
    if (command.command === "screenshot") {
      const output = payload.screenshotPath ?? path.join(process.cwd(), "artifacts", `${command.requestId}-android.png`);
      const res = await httpFetch("GET", `${base}/screenshot`);
      if (!res.ok || typeof res.value !== "string") return fail(command, "ANDROID_SCREENSHOT_FAILED", JSON.stringify(res.raw ?? {}));
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, Buffer.from(res.value, "base64"));
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "screenshot", screenshot: output } };
    }
    if (command.command === "click") {
      let point = ensurePoint(payload.point);
      if (!point) {
        const elementId = await findHttpElement(session, base, payload, httpFetch);
        if (elementId) {
          const clickRes = await httpFetch("POST", `${base}/element/${elementId}/click`);
          if (!clickRes.ok) return fail(command, "ANDROID_CLICK_FAILED", JSON.stringify(clickRes.raw ?? {}));
          invalidateUiCaches(session);
          return { requestId: command.requestId, success: true, data: { driver: "android", command: "click" } };
        }
      }
      if (!point) return fail(command, "ANDROID_CLICK_REQUIRES_POINT", "click requires payload.point or resolvable locator");
      const tapRes = await httpFetch("POST", `${base}/actions`, {
        actions: [
          {
            type: "pointer",
            id: "finger1",
            parameters: { pointerType: "touch" },
            actions: [
              { type: "pointerMove", duration: 0, x: point[0], y: point[1] },
              { type: "pointerDown", button: 0 },
              { type: "pointerUp", button: 0 }
            ]
          }
        ]
      });
      if (!tapRes.ok) return fail(command, "ANDROID_CLICK_FAILED", JSON.stringify(tapRes.raw ?? {}));
      invalidateUiCaches(session);
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "click", point } };
    }
    if (command.command === "type") {
      if (isAndroidClearOp(payload)) {
        const elementId = await findHttpElement(session, base, payload, httpFetch);
        if (elementId) {
          const clickRes = await httpFetch("POST", `${base}/element/${elementId}/click`);
          if (!clickRes.ok) return fail(command, "ANDROID_CLEAR_FAILED", JSON.stringify(clickRes.raw ?? {}));
          await new Promise((r) => setTimeout(r, 400));
        } else {
          let point = ensurePoint(payload.point);
          if (point) {
            const tapRes = await httpFetch("POST", `${base}/actions`, {
              actions: [
                {
                  type: "pointer",
                  id: "finger1",
                  parameters: { pointerType: "touch" },
                  actions: [
                    { type: "pointerMove", duration: 0, x: point[0], y: point[1] },
                    { type: "pointerDown", button: 0 },
                    { type: "pointerUp", button: 0 }
                  ]
                }
              ]
            });
            if (!tapRes.ok) return fail(command, "ANDROID_CLEAR_FAILED", JSON.stringify(tapRes.raw ?? {}));
            await new Promise((r) => setTimeout(r, 400));
          }
        }
        for (let i = 0; i < 16; i++) {
          await httpFetch("POST", `${base}/appium/device/press_keycode`, { keycode: 67 });
        }
        invalidateUiCaches(session);
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "android", command: "type", inputOp: "clear" }
        };
      }
      const text = String(payload.text ?? "");
      if (!text) return fail(command, "ANDROID_TYPE_REQUIRES_TEXT", "type requires payload.text");
      const elementId = await findHttpElement(session, base, payload, httpFetch);
      if (!elementId) return fail(command, "ANDROID_LOCATOR_MISSING", "type requires locator in http mode");
      const typeRes = await httpFetch("POST", `${base}/element/${elementId}/value`, { text });
      if (!typeRes.ok) return fail(command, "ANDROID_TYPE_FAILED", JSON.stringify(typeRes.raw ?? {}));
      invalidateUiCaches(session);
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "type" } };
    }
    if (command.command === "swipe") {
      const from = ensurePoint(payload.from);
      const to = ensurePoint(payload.to);
      if (!from || !to) return fail(command, "ANDROID_SWIPE_MISSING_POINTS", "swipe requires from/to");
      const screen = {
        width: Number(payload.screenWidth ?? 1080),
        height: Number(payload.screenHeight ?? 2400)
      };
      const relative = (payload as Record<string, unknown>).relative === true;
      const norm = normalizedSwipePoints(screen, from, to, { relative });
      const swipePayload = payload as Record<string, unknown>;
      const hasSwipeDuration =
        swipePayload.durationMs != null ||
        swipePayload.speed != null ||
        swipePayload.swipePreset != null ||
        swipePayload.swipeSpeed != null;
      const durationMs = hasSwipeDuration
        ? resolveSwipeDurationMs(swipePayload, { fallbackMs: 300 })
        : typeof payload.timeoutMs === "number"
          ? Math.max(100, payload.timeoutMs)
          : resolveSwipeDurationMs(swipePayload, { fallbackMs: 300 });
      const swipeRes = await httpFetch("POST", `${base}/actions`, {
        actions: [
          {
            type: "pointer",
            id: "finger1",
            parameters: { pointerType: "touch" },
            actions: [
              { type: "pointerMove", duration: 0, x: norm.from[0], y: norm.from[1] },
              { type: "pointerDown", button: 0 },
              { type: "pointerMove", duration: durationMs, x: norm.to[0], y: norm.to[1] },
              { type: "pointerUp", button: 0 }
            ]
          }
        ]
      });
      if (!swipeRes.ok) return fail(command, "ANDROID_SWIPE_FAILED", JSON.stringify(swipeRes.raw ?? {}));
      invalidateUiCaches(session);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "android", command: "swipe", from: norm.from, to: norm.to, durationMs }
      };
    }
    if (command.command === "pinch") {
      const ends = readPinchEndsFromPayload(payload as Record<string, unknown>);
      if (!ends) return fail(command, "ANDROID_PINCH_MISSING_POINTS", "pinch requires finger1/finger2/finger1End/finger2End");
      const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, { fallbackMs: 400 });
      const pinchRes = await httpFetch("POST", `${base}/actions`, {
        actions: buildDualPointerPinchActions(ends, durationMs)
      });
      if (!pinchRes.ok) return fail(command, "ANDROID_PINCH_FAILED", JSON.stringify(pinchRes.raw ?? {}));
      invalidateUiCaches(session);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "android", command: "pinch", durationMs, pinchIn: payload.pinchIn }
      };
    }
    if (command.command === "pressHome" || command.command === "home") {
      const keyRes = await httpFetch("POST", `${base}/appium/device/press_keycode`, { keycode: 3 });
      if (!keyRes.ok) return fail(command, "ANDROID_HOME_FAILED", JSON.stringify(keyRes.raw ?? {}));
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "home" } };
    }
    if (command.command === "launchApp" || command.command === "exitApp") {
      const appId = String(payload.appId ?? payload.packageId ?? "");
      if (!appId) return fail(command, "ANDROID_APP_ID_MISSING", "launch/exit requires appId");
      if (command.command === "launchApp") {
        const res = await httpFetch("POST", `${base}/appium/device/activate_app`, { appId });
        if (!res.ok) {
          const fallback = await httpFetch("POST", `${session.serverUrl}/session/${session.sessionId}/appium/device/activate_app`, {
            appId
          });
          if (!fallback.ok) return fail(command, "ANDROID_LAUNCH_FAILED", JSON.stringify(res.raw ?? {}));
        }
      } else {
        const res = await httpFetch("POST", `${base}/appium/device/terminate_app`, { appId });
        if (!res.ok) return fail(command, "ANDROID_EXIT_APP_FAILED", JSON.stringify(res.raw ?? {}));
      }
      return { requestId: command.requestId, success: true, data: { driver: "android", command: command.command, appId } };
    }
    if (command.command === "custom") {
      const rawAction = String(payload.custom?.action ?? payload.custom?.method ?? "").toLowerCase();
      if (rawAction === "shell") {
        const cmd = String(payload.custom?.command ?? "");
        if (!cmd) {
          return fail(command, "ANDROID_CUSTOM_SHELL_MISSING_COMMAND", "custom shell requires payload.custom.command");
        }
        const res = await runAndroidDeviceShell(payload, cmd);
        if (!res.ok) {
          return fail(command, "ANDROID_CUSTOM_SHELL_FAILED", res.stderr || "adb shell failed");
        }
        return customShellSuccess(command, res.stdout.trim());
      }
      const method = String(payload.custom?.method ?? "").toLowerCase();
      if (method === "dump_hierarchy" || method === "page_source") {
        const res = await httpFetch("GET", `${base}/source`);
        if (!res.ok) return fail(command, "ANDROID_SOURCE_FAILED", JSON.stringify(res.raw ?? {}));
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "android", command: "custom", action: method, value: String(res.value ?? "") }
        };
      }
      return fail(
        command,
        "ANDROID_CUSTOM_UNSUPPORTED",
        "supported custom: shell|method=dump_hierarchy|page_source"
      );
    }
    if (command.command === "assertVisible" || command.command === "getText" || command.command === "assertText") {
      const elementId = await findHttpElement(session, base, payload, httpFetch);
      if (!elementId) return fail(command, "ANDROID_ELEMENT_NOT_FOUND", "element not found by locator");
      if (command.command === "assertVisible") {
        const res = await httpFetch("GET", `${base}/element/${elementId}/displayed`);
        if (!res.ok || !res.value) return fail(command, "ANDROID_ASSERT_VISIBLE_FAILED", JSON.stringify(res.raw ?? {}));
        return { requestId: command.requestId, success: true, data: { driver: "android", command: "assertVisible", visible: true } };
      }
      const res = await httpFetch("GET", `${base}/element/${elementId}/text`);
      if (!res.ok) return fail(command, "ANDROID_GET_TEXT_FAILED", JSON.stringify(res.raw ?? {}));
      const text = String(res.value ?? "");
      if (command.command === "assertText") {
        const expected = String(payload.expectedText ?? payload.text ?? "");
        if (!text.includes(expected)) {
          return fail(command, "ANDROID_ASSERT_TEXT_FAILED", `expected "${expected}", got "${text}"`);
        }
      }
      return { requestId: command.requestId, success: true, data: { driver: "android", command: command.command, text } };
    }
    return fail(command, "ANDROID_UNSUPPORTED_COMMAND", `unsupported command in http mode: ${command.command}`);
  }

  async destroySession(session: AndroidAdapterSession): Promise<void> {
    if (session.transport === "http" && session.serverUrl !== "mock") {
      await fetchWebDriverJson("DELETE", `${session.serverUrl}/session/${session.sessionId}`).catch(() => undefined);
    }
  }
}

