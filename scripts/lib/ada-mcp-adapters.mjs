/**
 * MCP 适配器：与 ada-fluent 相同的 phone / page 方法，底层走 MCP 工具
 */
import path from "node:path";
import { harmonyKillAllApps, androidKillAllAppsViaRun, createMcpActionRun } from "./mobile-kill-all-apps.mjs";
import { normalizeDismissOpts } from "./popups.mjs";
import { assertMcpOk, mcpNeedsRisk, parseMcpToolResult } from "./ada-mcp.mjs";
import {
  buildAndroidDevice,
  buildHarmonyDevice,
  buildWebDevice,
  resolveSession
} from "./ada-fluent.mjs";

function basePayload(cfg) {
  const p = { ...cfg };
  delete p._openKind;
  delete p.platform;
  delete p.probeDevice;
  if (p.real === undefined) p.real = true;
  if (p.mock === undefined) p.mock = false;
  return p;
}

function normalizeDismissMcpResult(data, timeoutMs) {
  return {
    success: true,
    dismissed: Boolean(data.dismissed),
    businessCode: data.businessCode ?? "POPUP_NOT_FOUND",
    reason: data.reason ?? (data.ok === false ? "probe_error" : "no_popup"),
    hits: data.hits ?? [],
    rounds: data.rounds ?? 0,
    dismissActions: data.dismissActions ?? 0,
    timedOut: Boolean(data.timedOut),
    elapsedMs: data.elapsedMs ?? 0,
    timeoutMs
  };
}

function createMcpMobileRunners(client, platform, sessionId, cfg) {
  const payload = basePayload(cfg);

  const run = async (command, extra = {}) => {
    const res = await client.callTool({
      name: "ada_mobile_action",
      arguments: {
        command,
        platform,
        sessionId,
        payload: { ...payload, ...extra },
        ...(mcpNeedsRisk(platform, command, extra) ? { riskApproved: true } : {})
      }
    });
    const data = parseMcpToolResult(res);
    assertMcpOk(command, data);
    return data;
  };

  const recipe = async (action, text = "", extra = {}) => {
    const res = await client.callTool({
      name: "ada_mobile_recipe",
      arguments: {
        platform,
        sessionId,
        action,
        text,
        payload: { ...payload, ...extra }
      }
    });
    const data = parseMcpToolResult(res);
    assertMcpOk(action, data);
    return data;
  };

  const close = async () => {
    const res = await client.callTool({
      name: "ada_close_session",
      arguments: { platform, sessionId }
    });
    return parseMcpToolResult(res);
  };

  const dismissPopups = async (dismissArg, attemptsArg) => {
    const { timeoutMs, attempts } = normalizeDismissOpts(dismissArg, attemptsArg);
    try {
      const res = await client.callTool({
        name: "ada_mobile_dismiss_popups",
        arguments: {
          platform,
          sessionId,
          payload,
          timeoutMs,
          attempts: Number.isFinite(attempts) ? attempts : undefined
        }
      });
      return normalizeDismissMcpResult(parseMcpToolResult(res), timeoutMs);
    } catch (error) {
      return normalizeDismissMcpResult(
        {
          dismissed: false,
          businessCode: "POPUP_NOT_FOUND",
          reason: "client_error",
          hits: [`error:${String(error?.message ?? error).slice(0, 120)}`]
        },
        timeoutMs
      );
    }
  };

  const killAllApps = async (opts = {}) => {
    const mcpRun = createMcpActionRun(run);
    if (platform === "android") {
      return androidKillAllAppsViaRun(mcpRun, payload, opts);
    }
    if (platform === "ios") {
      const { iosKillAllAppsViaRun } = await import("./mobile-kill-all-apps.mjs");
      return iosKillAllAppsViaRun(mcpRun, opts);
    }
    return harmonyKillAllApps(mcpRun, payload, opts);
  };

  const wake = async () => {
    if (platform === "android") {
      await run("custom", { custom: { action: "shell", command: "input keyevent KEYCODE_WAKEUP" } });
      return;
    }
    if (platform === "ios") {
      await run("deviceAdmin", { action: "wake" });
      return;
    }
    await run("custom", { custom: { action: "shell", command: "power-shell wakeup" } });
  };

  return { run, recipe, close, dismissPopups, killAllApps, wake };
}

function createMcpWebRunners(client, sessionId, cfg) {
  const payload = basePayload(cfg);

  const run = async (command, extra = {}) => {
    const res = await client.callTool({
      name: "ada_web_action",
      arguments: {
        command,
        sessionId,
        payload: { ...payload, ...extra },
        ...(mcpNeedsRisk("web", command, extra) ? { riskApproved: true } : {})
      }
    });
    const data = parseMcpToolResult(res);
    assertMcpOk(command, data);
    return data;
  };

  const close = async () => {
    const res = await client.callTool({
      name: "ada_close_session",
      arguments: { platform: "web", sessionId, engine: "playwright", payload }
    });
    return parseMcpToolResult(res);
  };

  const dismissPopups = async (dismissArg, attemptsArg) => {
    const { timeoutMs, attempts } = normalizeDismissOpts(dismissArg, attemptsArg);
    try {
      const res = await client.callTool({
        name: "ada_web_dismiss_popups",
        arguments: {
          sessionId,
          payload,
          timeoutMs,
          attempts: Number.isFinite(attempts) ? attempts : undefined
        }
      });
      return normalizeDismissMcpResult(parseMcpToolResult(res), timeoutMs);
    } catch (error) {
      return normalizeDismissMcpResult(
        {
          dismissed: false,
          businessCode: "POPUP_NOT_FOUND",
          reason: "client_error",
          hits: [`error:${String(error?.message ?? error).slice(0, 120)}`]
        },
        timeoutMs
      );
    }
  };

  return { run, close, dismissPopups };
}

/** @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client */
export function harmonyViaMcp(client, sessionIdOrBase, base) {
  const { sessionId, base: cfg } = resolveSession("harmony", sessionIdOrBase, base);
  return buildHarmonyDevice(sessionId, cfg, createMcpMobileRunners(client, "harmony", sessionId, cfg));
}

/** @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client */
export function androidViaMcp(client, sessionIdOrBase, base) {
  const { sessionId, base: cfg } = resolveSession("android", sessionIdOrBase, base);
  const screen = { width: cfg.screenWidth ?? 1080, height: cfg.screenHeight ?? 2400 };
  return buildAndroidDevice(sessionId, cfg, screen, createMcpMobileRunners(client, "android", sessionId, cfg));
}

/** @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client */
export function webViaMcp(client, sessionIdOrOptions, options) {
  const { sessionId, base: cfg } = resolveSession("web", sessionIdOrOptions, options);
  return buildWebDevice(sessionId, cfg, createMcpWebRunners(client, sessionId, cfg));
}

/**
 * 绑定 MCP 句柄；`phone.close()` / `page.close()` 仅释放浏览器/真机会话（ada_close_session），
 * 不断开 MCP 传输。脚本末尾请调 `exit()`（内部会 `releaseMcpTransport()`）释放客户端连接。
 * @param {object} handle phone / page
 * @param {{ client: import('@modelcontextprotocol/sdk/client/index.js').Client, owned: { close: () => Promise<void> } | null }} mcp
 */
export function attachMcpLifecycle(handle, mcp) {
  handle._mcp = mcp;
  return handle;
}

/** @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client */
/** @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client */
export function iosViaMcp(client, sessionIdOrBase, base) {
  const { sessionId, base: cfg } = resolveSession("ios", sessionIdOrBase, base);
  const screen = { width: cfg.screenWidth ?? 390, height: cfg.screenHeight ?? 844 };
  return buildIosDevice(sessionId, cfg, screen, createMcpMobileRunners(client, "ios", sessionId, cfg));
}

/** @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client */
export function openDeviceViaMcp(client, platform, cfg) {
  if (platform === "android") return androidViaMcp(client, cfg);
  if (platform === "harmony") return harmonyViaMcp(client, cfg);
  if (platform === "ios") return iosViaMcp(client, cfg);
  throw new Error(`openDeviceViaMcp: 不支持的平台 "${platform}"`);
}

/** @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client */
export function openWebViaMcp(client, cfg) {
  return webViaMcp(client, cfg);
}
