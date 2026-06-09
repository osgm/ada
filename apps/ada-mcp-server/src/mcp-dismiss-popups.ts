import type { AdaPlatform } from "./mcp-normalize.js";
import type { McpResultOptions } from "./mcp-result.js";
import { loadPopupsModule } from "./mcp-popups-runtime.js";
import { asRecord } from "./mcp-utils.js";

/**
 * 关弹窗：始终返回 ok（无弹窗 / 探测失败 = 业务未命中，非系统异常）。
 */
function dismissFallbackOutcome(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    success: true,
    dismissed: false,
    businessCode: "POPUP_NOT_FOUND",
    reason: "probe_error",
    dismissActions: 0,
    rounds: 0,
    timedOut: false,
    elapsedMs: 0,
    hits: [`error:${message.slice(0, 120)}`]
  };
}

export async function handleWebDismissPopups(
  args: Record<string, unknown>,
  deps: {
    mergeWebEngineIntoPayload: (args: Record<string, unknown>) => Record<string, unknown>;
    mcpTextResult: (data: Record<string, unknown>, options?: McpResultOptions) => unknown;
  }
): Promise<unknown> {
  const sessionId = String(args.sessionId ?? "mcp-session");
  const payload = deps.mergeWebEngineIntoPayload(args);
  const { dismissWebPopups } = await loadPopupsModule();
  let outcome;
  try {
    outcome = await dismissWebPopups(sessionId, payload, {
      timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined,
      attempts: typeof args.attempts === "number" ? args.attempts : undefined
    });
  } catch (error) {
    outcome = dismissFallbackOutcome(error);
  }
  return deps.mcpTextResult(
    {
      ok: true,
      tool: "ada_web_dismiss_popups",
      status: "ok",
      sessionId,
      platform: "web",
      command: "dismiss_popups",
      ...outcome
    },
    { isError: false }
  );
}

export async function handleMobileDismissPopups(
  args: Record<string, unknown>,
  deps: {
    requireMobilePlatform: (value: unknown) => Exclude<AdaPlatform, "web">;
    mcpTextResult: (data: Record<string, unknown>, options?: McpResultOptions) => unknown;
  }
): Promise<unknown> {
  const platform = deps.requireMobilePlatform(args.platform);
  const sessionId = String(args.sessionId ?? "mcp-session");
  const payload = asRecord(args.payload);
  const screen = {
    width: Number(payload.screenWidth ?? 1080),
    height: Number(payload.screenHeight ?? 2400)
  };
  const { dismissMobilePopups } = await loadPopupsModule();
  let outcome;
  try {
    outcome = await dismissMobilePopups(platform, sessionId, payload, screen, {
      timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined,
      attempts: typeof args.attempts === "number" ? args.attempts : undefined
    });
  } catch (error) {
    outcome = dismissFallbackOutcome(error);
  }
  return deps.mcpTextResult(
    {
      ok: true,
      tool: "ada_mobile_dismiss_popups",
      status: "ok",
      sessionId,
      platform,
      command: "dismiss_popups",
      ...outcome
    },
    { isError: false }
  );
}
