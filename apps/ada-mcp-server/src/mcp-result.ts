import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { AdaPlatform } from "./mcp-normalize.js";
import {
  buildRecoveryPlan,
  buildUiCandidatesHint,
  classifyErrorKind,
  isLocatorFailure,
  suggestRecoveryTool
} from "./mcp-recovery.js";
import { resolveRecoveryFields } from "./mcp-payload-slim.js";
import {
  isMcpJsonPretty,
  isMcpVerboseResult,
  MCP_VERBOSE_RESULT_HINT,
  resolveResultForMcp
} from "./mcp-response-mode.js";
import { asRecord } from "./mcp-utils.js";

export type McpErrorKind =
  | "validation"
  | "environment"
  | "assertion_failed"
  | "command_failed"
  | "timeout"
  | "risk_denied"
  | "unknown";

export interface McpResultOptions {
  isError?: boolean;
  errorKind?: McpErrorKind;
  recoverable?: boolean;
  suggestedNextTool?: string;
  recoveryHint?: string;
  recoveryPlan?: ReturnType<typeof buildRecoveryPlan>;
  uiCandidates?: Record<string, unknown>;
}

function inferIsError(data: Record<string, unknown>): boolean {
  if (data.ok === false) return true;
  if (data.status === "failed") return true;
  const result = data.result;
  if (result && typeof result === "object" && (result as CommandResult).success === false) {
    return true;
  }
  if (data.success === false) return true;
  return false;
}

export function enrichMcpPayload(
  data: Record<string, unknown>,
  options?: McpResultOptions
): Record<string, unknown> {
  const isError = options?.isError ?? inferIsError(data);
  const out: Record<string, unknown> = {
    ...data,
    ok: !isError
  };
  if (options?.errorKind) out.errorKind = options.errorKind;
  if (options?.recoverable !== undefined) out.recoverable = options.recoverable;
  if (options?.suggestedNextTool) out.suggestedNextTool = options.suggestedNextTool;
  if (options?.recoveryHint) out.recoveryHint = options.recoveryHint;
  if (options?.recoveryPlan) out.recoveryPlan = options.recoveryPlan;
  if (options?.uiCandidates) out.uiCandidates = options.uiCandidates;
  return out;
}

function mcpJsonPretty(): boolean {
  return isMcpJsonPretty();
}

function serializeMcpPayload(payload: unknown): string {
  return JSON.stringify(payload, null, mcpJsonPretty() ? 2 : undefined);
}

export function mcpTextResult(data: unknown, options?: McpResultOptions) {
  if (Array.isArray(data)) {
    const isError = options?.isError ?? false;
    const payload = { ok: !isError, items: data };
    return {
      content: [{ type: "text" as const, text: serializeMcpPayload(payload) }],
      ...(isError ? { isError: true as const } : {})
    };
  }
  const record =
    typeof data === "object" && data !== null ? (data as Record<string, unknown>) : { value: data };
  const isError = options?.isError ?? inferIsError(record);
  const payload = enrichMcpPayload(record, { ...options, isError });
  return {
    content: [{ type: "text" as const, text: serializeMcpPayload(payload) }],
    ...(isError ? { isError: true as const } : {})
  };
}

function extractSessionContext(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  const hints: Record<string, unknown> = {};
  if (typeof data.url === "string") hints.activeUrl = data.url;
  if (typeof data.href === "string") hints.activeUrl = data.href;
  if (typeof data.title === "string") hints.pageTitle = data.title;
  if (typeof data.pageTextPreview === "string") hints.pageTextPreview = data.pageTextPreview;
  if (typeof data.locatorUsed === "string") hints.locatorUsed = data.locatorUsed;
  if (typeof data.locatorHint === "string") hints.locatorHint = data.locatorHint;
  if (typeof data.screenshot === "string") hints.screenshot = data.screenshot;
  if (typeof data.package === "string") hints.currentPackage = data.package;
  if (typeof data.appPackage === "string") hints.currentPackage = data.appPackage;
  return hints;
}

function extractAssertionDiff(result?: CommandResult): Record<string, unknown> {
  if (!result?.data || typeof result.data !== "object") {
    return {};
  }
  const data = result.data as Record<string, unknown>;
  const diff = data.assertionDiff;
  if (!diff || typeof diff !== "object") {
    return {};
  }
  const d = diff as Record<string, unknown>;
  const out: Record<string, unknown> = { assertionDiff: d };
  if (d.expected !== undefined) out.expected = d.expected;
  if (d.actual !== undefined) out.actual = d.actual;
  if (typeof d.locatorUsed === "string") out.locatorUsed = d.locatorUsed;
  if (typeof d.type === "string") out.assertionType = d.type;
  return out;
}

function buildFailureOptions(input: {
  tool: string;
  envelope: CommandEnvelope;
  result: CommandResult;
}) {
  const { tool, envelope, result } = input;
  const errorKind = classifyErrorKind(result, envelope.platform);
  const recoveryInput = { tool, envelope, result, errorKind };
  const locatorMiss = isLocatorFailure(result);
  const recovery = resolveRecoveryFields(recoveryInput);
  return {
    isError: true as const,
    errorKind,
    recoverable:
      errorKind === "timeout" ||
      errorKind === "environment" ||
      errorKind === "assertion_failed" ||
      locatorMiss,
    suggestedNextTool: suggestRecoveryTool(result, envelope.platform),
    ...recovery,
    uiCandidates: buildUiCandidatesHint({ platform: envelope.platform, tool, result })
  };
}

/** payload.bestEffort 或顶层 bestEffort：定位未命中视为业务跳过，不标 MCP isError */
export function isBestEffortRequest(args: Record<string, unknown>): boolean {
  if (args.bestEffort === true) return true;
  return asRecord(args.payload).bestEffort === true;
}

export function wrapBestEffortCommandResult(input: {
  tool: string;
  envelope: CommandEnvelope;
  result: CommandResult;
  attempts?: number;
}) {
  const { tool, envelope, result, attempts } = input;
  const { result: mcpResult, resultMode } = resolveResultForMcp(result);
  const payload: Record<string, unknown> = {
    tool,
    status: "ok",
    ok: true,
    outcome: "skipped",
    businessCode: "LOCATOR_NOT_FOUND",
    sessionId: envelope.sessionId,
    platform: envelope.platform,
    command: envelope.command,
    requestId: result.requestId,
    note:
      "bestEffort: UI element not found or not clickable; treated as business miss, not a system failure. " +
      "For dismiss flows use ada_web_dismiss_popups / ada_mobile_dismiss_popups.",
    result: mcpResult,
    resultMode,
    ...(typeof attempts === "number" ? { attempts } : {}),
    ...extractSessionContext(
      result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : undefined
    )
  };
  return mcpTextResult(payload, { isError: false });
}

export function wrapCommandToolResult(input: {
  tool: string;
  envelope: CommandEnvelope;
  result: CommandResult;
  attempts?: number;
}) {
  const { tool, envelope, result, attempts } = input;
  const sessionContext = extractSessionContext(
    result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : undefined
  );
  const { result: mcpResult, resultMode } = resolveResultForMcp(result);
  const payload: Record<string, unknown> = {
    tool,
    sessionId: envelope.sessionId,
    platform: envelope.platform,
    command: envelope.command,
    requestId: result.requestId,
    result: mcpResult,
    resultMode,
    ...(resultMode === "slim" ? { resultHint: MCP_VERBOSE_RESULT_HINT } : {}),
    ...(typeof attempts === "number" ? { attempts } : {}),
    ...sessionContext
  };

  if (!result.success) {
    return mcpTextResult(payload, buildFailureOptions({ tool, envelope, result }));
  }

  const data = result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : {};
  payload.status = "ok";
  payload.ok = true;
  payload.businessCode =
    typeof data.businessCode === "string" ? data.businessCode : "COMMAND_OK";
  payload.message = typeof data.message === "string" ? data.message : "ok";

  return mcpTextResult(payload);
}

export function wrapAssertionResult(input: {
  tool: string;
  sessionId: string;
  platform?: AdaPlatform;
  type: string;
  pass: boolean;
  details: Record<string, unknown>;
  result?: CommandResult;
}) {
  const normalizedDetails = {
    ...extractAssertionDiff(input.result),
    ...input.details
  };
  const payload: Record<string, unknown> = {
    tool: input.tool,
    sessionId: input.sessionId,
    platform: input.platform ?? "web",
    status: input.pass ? "ok" : "failed",
    type: input.type,
    ...normalizedDetails
  };
  if (input.result) {
    if (isMcpVerboseResult()) {
      payload.result = input.result;
      payload.resultMode = "verbose";
    } else {
      const { result: mcpResult, resultMode } = resolveResultForMcp(input.result);
      payload.result = mcpResult;
      payload.resultMode = resultMode;
      if (resultMode === "slim") {
        payload.resultHint = MCP_VERBOSE_RESULT_HINT;
      }
    }
  }
  if (!input.pass) {
    const platform = input.platform ?? "web";
    const extractTool = platform !== "web" ? "ada_mobile_extract" : "ada_extract";
    const errorKind: McpErrorKind = "assertion_failed";
    const recoveryInput = {
      tool: input.tool,
      sessionId: input.sessionId,
      platform,
      errorKind
    };
    return mcpTextResult(payload, {
      isError: true,
      errorKind,
      recoverable: true,
      suggestedNextTool: extractTool,
      ...resolveRecoveryFields(recoveryInput)
    });
  }
  return mcpTextResult(payload);
}
