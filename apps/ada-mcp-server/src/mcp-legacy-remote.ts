import type { CommandEnvelope } from "@ada/contracts";
import { closeAllSessions, closeSession, listActiveSessions, runCommand } from "./executor.js";
import { getBuiltInPlugins, getDoctorSnapshot, getHealthSnapshot } from "@ada/agent-core";
import { normalizeCommand, normalizePlatform } from "./mcp-normalize.js";
import type { RemoteServerOptions } from "./remote-server.js";

function isRisky(command: string): boolean {
  return ["custom", "invoke", "launchApp", "exitApp", "terminateApp"].includes(command);
}

function canRunRiskyCommand(
  command: string,
  options: RemoteServerOptions,
  args?: Record<string, unknown>
): boolean {
  if (args?.riskApproved === true) {
    return true;
  }
  if (!isRisky(command)) return true;
  if (!options.allowRisky) return false;
  const riskySet = new Set(
    options.riskyCommands.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0)
  );
  if (options.riskyMode === "blacklist") {
    return !riskySet.has(command);
  }
  return riskySet.has(command);
}

function mergeWebEngine(args: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...((args.payload as Record<string, unknown> | undefined) ?? {}) };
  if (args.engine !== undefined && payload.engine === undefined) {
    payload.engine = args.engine;
  }
  return payload;
}

export async function callLegacyTool(
  name: string,
  args: Record<string, unknown>,
  options: RemoteServerOptions
): Promise<unknown> {
  if (name === "ada_health") return getHealthSnapshot();
  if (name === "ada_diagnostics") return getDoctorSnapshot();
  if (name === "ada_plugins") return getBuiltInPlugins();
  if (name === "ada_sessions") return { sessions: listActiveSessions() };
  if (name === "ada_close_all_sessions") return { closed: await closeAllSessions() };
  if (name === "ada_close_session") {
    const platform = normalizePlatform(args.platform);
    const sessionId = String(args.sessionId ?? "");
    const payload = mergeWebEngine(args);
    const engine =
      platform === "web" && typeof payload.engine === "string"
        ? (payload.engine as "playwright")
        : undefined;
    return { closed: await closeSession(platform, sessionId, { engine, payload }) };
  }
  if (name === "ada_invoke") {
    if (args.riskApproved !== true) {
      throw new Error("ada_invoke requires riskApproved=true (or use POST /mcp Streamable HTTP)");
    }
    const platform = normalizePlatform(args.platform);
    const payload = mergeWebEngine(args);
    const envelope: CommandEnvelope = {
      requestId: String(args.requestId ?? `remote-invoke-${Date.now()}`),
      sessionId: String(args.sessionId ?? "remote-invoke"),
      platform,
      command: "invoke",
      payload
    };
    return runCommand(envelope);
  }
  if (name === "ada_batch_actions") {
    const platform = normalizePlatform(args.platform);
    const sessionId = String(args.sessionId ?? "remote-batch");
    const actions = Array.isArray(args.actions) ? args.actions : [];
    const results: Array<{ index: number; command: string; result: unknown }> = [];
    for (let i = 0; i < actions.length; i += 1) {
      const item = (actions[i] ?? {}) as Record<string, unknown>;
      const command = normalizeCommand(item.command);
      if (!canRunRiskyCommand(command, options, args)) {
        throw new Error(`risky command blocked: ${command}`);
      }
      const envelope: CommandEnvelope = {
        requestId: String(item.requestId ?? `remote-batch-${Date.now()}-${i}`),
        sessionId,
        platform,
        command,
        payload: (item.payload as Record<string, unknown> | undefined) ?? {}
      };
      results.push({ index: i, command, result: await runCommand(envelope) });
    }
    return { platform, sessionId, results };
  }
  if (name === "ada_execute" || name === "ada_web_action" || name === "ada_mobile_action" || name === "ada_mobile_recipe") {
    const platform = name === "ada_web_action" ? "web" : normalizePlatform(args.platform);
    const command = normalizeCommand(args.command);
    if (!canRunRiskyCommand(command, options, args)) {
      throw new Error(
        `risky command blocked: ${command} (allowRisky=${options.allowRisky}, riskyMode=${options.riskyMode}, or set riskApproved=true)`
      );
    }
    const payload = mergeWebEngine(args);
    const envelope: CommandEnvelope = {
      requestId: String(args.requestId ?? `remote-${Date.now()}`),
      sessionId: String(args.sessionId ?? "remote-session"),
      platform,
      command,
      payload
    };
    return runCommand(envelope);
  }
  throw new Error(
    `unsupported legacy tool: ${name}. Prefer POST /mcp Streamable HTTP for full tool catalog and recoveryPlan support.`
  );
}
