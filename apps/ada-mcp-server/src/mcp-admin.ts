import { stopAllIosIproxyForwards } from "@ada/runtime-probe";
import type { AdaPlatform } from "./mcp-normalize.js";
import { clearActionLedger, clearAllActionLedgers } from "./mcp-action-ledger.js";
import { clearAllWebSessionTracks, clearWebSessionTrack } from "./mcp-session-liveness.js";

export function handlePlugins(
  deps: {
    getBuiltInPlugins: () => unknown[];
    mcpTextResult: (data: Record<string, unknown>) => any;
  }
): any {
  const plugins = deps.getBuiltInPlugins();
  return deps.mcpTextResult({ plugins, count: plugins.length });
}

export async function handleConfig(
  deps: {
    loadAgentConfig: () => Promise<Record<string, unknown>>;
    mcpTextResult: (data: Record<string, unknown>) => any;
  }
): Promise<any> {
  return deps.mcpTextResult(await deps.loadAgentConfig());
}

export function handleSessions(
  deps: {
    listActiveSessions: () => unknown[];
    mcpTextResult: (data: Record<string, unknown>) => any;
  }
): any {
  const sessions = deps.listActiveSessions();
  return deps.mcpTextResult({ count: sessions.length, sessions });
}

export async function handleCloseSession(
  args: Record<string, unknown>,
  deps: {
    normalizePlatform: (value: unknown) => AdaPlatform;
    mergeWebEngineIntoPayload: (args: Record<string, unknown>) => Record<string, unknown>;
    closeSession: (
      platform: AdaPlatform,
      sessionId: string,
      options: { engine?: "playwright"; payload?: Record<string, unknown> }
    ) => Promise<boolean>;
    mcpTextResult: (data: Record<string, unknown>) => any;
  }
): Promise<any> {
  const platform = deps.normalizePlatform(args.platform);
  const sessionId = String(args.sessionId ?? "");
  if (!sessionId) {
    throw new Error("sessionId is required");
  }
  const payload = deps.mergeWebEngineIntoPayload(args);
  const engine = platform === "web" && typeof payload.engine === "string" ? (payload.engine as "playwright") : undefined;
  const closed = await deps.closeSession(platform, sessionId, { engine, payload });
  if (closed && platform === "web") {
    clearWebSessionTrack(sessionId);
    clearActionLedger(sessionId);
  }
  return deps.mcpTextResult({ status: "ok", closed, platform, sessionId, engine });
}

export async function handleCloseAllSessions(
  deps: {
    closeAllSessions: () => Promise<number>;
    mcpTextResult: (data: Record<string, unknown>) => any;
  }
): Promise<any> {
  const closed = await deps.closeAllSessions();
  clearAllWebSessionTracks();
  clearAllActionLedgers();
  const iproxyStopped = stopAllIosIproxyForwards();
  return deps.mcpTextResult({ status: "ok", closed, iproxyStopped });
}

export function handleRiskPolicy(
  args: Record<string, unknown>,
  deps: {
    riskyCommandAllowlist: Set<string>;
    riskyCommandDefaults: readonly string[];
    mcpTextResult: (data: Record<string, unknown>) => any;
  }
): any {
  const action = typeof args.action === "string" ? args.action : "view";
  const command = typeof args.command === "string" ? args.command : "";
  if (action === "add" && command) {
    deps.riskyCommandAllowlist.add(command);
  } else if (action === "remove" && command) {
    deps.riskyCommandAllowlist.delete(command);
  } else if (action === "reset") {
    deps.riskyCommandAllowlist.clear();
    for (const item of deps.riskyCommandDefaults) {
      deps.riskyCommandAllowlist.add(item);
    }
  }
  return deps.mcpTextResult({
    status: "ok",
    action,
    allowlist: Array.from(deps.riskyCommandAllowlist.values()).sort()
  });
}

export function handlePerfSummary(
  args: Record<string, unknown>,
  deps: {
    buildPerfSummary: () => Record<string, unknown>;
    perfStats: Map<string, number[]>;
    mcpTextResult: (data: Record<string, unknown>) => any;
  }
): any {
  const summary = deps.buildPerfSummary();
  if (args.reset === true) {
    deps.perfStats.clear();
  }
  return deps.mcpTextResult(summary);
}
