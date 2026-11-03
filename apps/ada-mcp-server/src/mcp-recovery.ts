import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { AdaPlatform } from "./mcp-normalize.js";

export type McpErrorKind =
  | "validation"
  | "environment"
  | "assertion_failed"
  | "command_failed"
  | "timeout"
  | "risk_denied"
  | "unknown";

export interface RecoveryPlanStep {
  kind: "retry" | "observe" | "tool" | "escalate";
  tool: string;
  note: string;
  args?: Record<string, unknown>;
  requires?: string[];
}

export function classifyErrorKind(result: CommandResult, platform: AdaPlatform): McpErrorKind {
  const code = String(result.errorCode ?? "").toUpperCase();
  const message = String(result.errorMessage ?? "");

  if (code.includes("TIMEOUT") || code === "MCP_ACTION_TIMEOUT") return "timeout";
  if (code.includes("RISK") || code.includes("RISKY")) return "risk_denied";
  if (
    code.includes("RUNTIME") ||
    code.includes("CAPABILITY") ||
    code.includes("NOT_READY") ||
    code.includes("DRIVER_") ||
    /not ready|runtime not ready/i.test(message)
  ) {
    return "environment";
  }
  if (
    platform !== "web" &&
    (code.includes("DEVICE") || /adb|device disconnected|wda|hdc|hypium/i.test(message))
  ) {
    return "environment";
  }
  if (/playwright|browser|chromium/i.test(message) && code !== "LOCATOR_NOT_FOUND") {
    return "environment";
  }
  return "command_failed";
}

export function isLocatorFailure(result: CommandResult): boolean {
  const code = String(result.errorCode ?? "").toUpperCase();
  const message = String(result.errorMessage ?? "").toLowerCase();
  const data = result.data as Record<string, unknown> | undefined;
  if (data?.optional === true || data?.businessCode === "LOCATOR_NOT_FOUND") {
    return true;
  }
  return (
    code.includes("LOCATOR") ||
    code === "UI_ELEMENT_NOT_FOUND" ||
    /element.*not found|locator|selector|unable to find|no such element|not visible|optional click/i.test(message)
  );
}

export function buildUiCandidatesHint(input: {
  platform: AdaPlatform;
  tool: string;
  result: CommandResult;
}): Record<string, unknown> | undefined {
  if (!isLocatorFailure(input.result)) {
    return undefined;
  }
  if (input.platform === "web") {
    const data = input.result.data as Record<string, unknown> | undefined;
    const hasPreview = typeof data?.pageTextPreview === "string" && data.pageTextPreview.length > 0;
    return {
      suggestTools: hasPreview ? ["ada_extract", "ada_web_action"] : ["ada_extract", "ada_web_action", "ada_web_recipe"],
      note: hasPreview
        ? "Locator miss — use pageTextPreview; retry payload.locator (css/role/within+nth). Do not close sessions."
        : "Locator miss — ada_extract mode=viewTree, then ada_web_recipe clickPath or scoped locator.",
      // Keep short: models overfit long format lists.
      locatorHint: 'payload.locator.css | {kind:"role",role,name,within?,nth?} | selector',
      retryPayloadHints: ["payload.locator", "payload.waitTimeoutMs"]
    };
  }
  return {
    suggestTools: ["ada_mobile_extract", "ada_mobile_recipe"],
    note: "Locator miss — ada_mobile_extract type=viewTree, then ada_mobile_recipe tap_path.",
    retryPayloadHints: ["payload.locator.strategy+xpath|text"]
  };
}

export function buildRecoveryPlan(input: {
  tool: string;
  envelope?: CommandEnvelope;
  result?: CommandResult;
  errorKind: McpErrorKind;
  sessionId?: string;
  platform?: AdaPlatform;
}): RecoveryPlanStep[] {
  const sessionId = input.sessionId ?? input.envelope?.sessionId ?? "same-session";
  const platform = input.platform ?? input.envelope?.platform ?? "web";
  const command = input.envelope?.command;
  const errorKind = input.errorKind;

  if (errorKind === "environment") {
    if (platform === "android") {
      return [
        { kind: "tool", tool: "ada_devices", note: "Scan and authorize Android device", args: { action: "scan" } },
        { kind: "retry", tool: input.tool, note: "Retry after device is online", args: { sessionId } }
      ];
    }
    if (platform === "ios") {
      return [
        { kind: "tool", tool: "ada_diagnostics", note: "Check WDA / Xcode setup", args: { scope: "mobile" } },
        { kind: "retry", tool: input.tool, note: "Retry with same sessionId", args: { sessionId } }
      ];
    }
    if (platform === "harmony") {
      return [
        { kind: "tool", tool: "ada_install_deps", note: "Install Harmony tooling", args: { only: "harmony" } },
        { kind: "tool", tool: "ada_devices", note: "Scan Harmony device", args: { action: "scan" } },
        { kind: "retry", tool: input.tool, note: "Retry automation", args: { sessionId } }
      ];
    }
    return [
      { kind: "tool", tool: "ada_install_deps", note: "Install Playwright browsers", args: { only: "playwright" } },
      { kind: "retry", tool: input.tool, note: "Retry web step", args: { sessionId, command } }
    ];
  }

  if (input.tool === "ada_web_recipe" || input.tool === "ada_web_action") {
    const steps: RecoveryPlanStep[] = [
      {
        kind: "observe",
        tool: "ada_extract",
        note: "Read viewTree (flat controls + path) before changing locator",
        args: { sessionId, mode: "viewTree", payload: { detail: "controls" } }
      },
      {
        kind: "retry",
        tool: input.tool === "ada_web_recipe" ? "ada_web_recipe" : "ada_web_action",
        note: "Retry with path/locator from viewTree",
        args: { sessionId, command }
      },
      {
        kind: "retry",
        tool: "ada_web_action",
        note: "Retry with waitMs if element was still loading",
        args: { sessionId, command, retry: 1, payload: { waitMs: 1500 } }
      },
      {
        kind: "escalate",
        tool: "ada_invoke",
        note: "Low-level Playwright API (last resort)",
        requires: ["riskApproved"]
      }
    ];
    return steps;
  }

  if (input.tool === "ada_mobile_action") {
    return [
      {
        kind: "observe",
        tool: "ada_mobile_extract",
        note: "Read flat mobile controls (viewTree) before adjusting locator",
        args: { sessionId, platform, type: "viewTree" }
      },
      {
        kind: "tool",
        tool: "ada_mobile_recipe",
        note: "tap_path when labels/path are known; else dump_ui / search recipes",
        args: { platform, action: "tap_path", sessionId }
      },
      { kind: "retry", tool: "ada_mobile_action", note: "Retry gesture with updated locator", args: { sessionId, platform, command, retry: 1 } },
      {
        kind: "escalate",
        tool: "ada_invoke",
        note: "Driver RPC (last resort)",
        requires: ["riskApproved"]
      }
    ];
  }

  if (errorKind === "assertion_failed") {
    const observe = platform === "web" ? "ada_extract" : "ada_mobile_extract";
    return [
      { kind: "observe", tool: observe, note: "Inspect actual UI state before re-asserting" },
      { kind: "retry", tool: input.tool, note: "Retry assertion after fixing locator/expectation" }
    ];
  }

  return [
    { kind: "retry", tool: input.tool, note: "Retry once with same sessionId", args: { sessionId } },
    { kind: "tool", tool: "ada_diagnostics", note: "If retry fails, inspect environment" }
  ];
}

export function suggestRecoveryTool(result: CommandResult, platform: AdaPlatform): string | undefined {
  const kind = classifyErrorKind(result, platform);
  if (kind === "environment") {
    if (platform === "android") return "ada_devices";
    if (platform === "ios") return "ada_diagnostics";
    if (platform === "harmony") return "ada_install_deps";
    return "ada_install_deps";
  }
  if (isLocatorFailure(result)) {
    return platform === "web" ? "ada_extract" : "ada_mobile_extract";
  }
  if (/session|closed|invalid/i.test(String(result.errorMessage ?? ""))) return "ada_sessions";
  return undefined;
}

/** LLM-facing one-line recovery guidance (always useful; keep short in slim mode). */
export function buildRecoveryHint(input: {
  tool: string;
  envelope?: CommandEnvelope;
  result?: CommandResult;
  errorKind?: McpErrorKind;
  sessionId?: string;
  platform?: string;
  maxSteps?: number;
}): string {
  const sessionId = input.sessionId ?? input.envelope?.sessionId ?? "same-session";
  const platform = (input.platform ?? input.envelope?.platform ?? "web") as AdaPlatform;
  const command = input.envelope?.command;
  const message = String(input.result?.errorMessage ?? "");
  const resultData =
    input.result?.data && typeof input.result.data === "object"
      ? (input.result.data as Record<string, unknown>)
      : undefined;
  const assertionDiff =
    resultData?.assertionDiff && typeof resultData.assertionDiff === "object"
      ? (resultData.assertionDiff as Record<string, unknown>)
      : undefined;
  const locatorUsed =
    (typeof resultData?.locatorUsed === "string" && resultData.locatorUsed.trim().length > 0
      ? resultData.locatorUsed.trim()
      : undefined) ??
    (typeof assertionDiff?.locatorUsed === "string" && assertionDiff.locatorUsed.trim().length > 0
      ? assertionDiff.locatorUsed.trim()
      : undefined);
  const locatorHint = locatorUsed ? ` Current locator="${locatorUsed}".` : "";
  const errorKind =
    input.errorKind ??
    (input.result && input.envelope ? classifyErrorKind(input.result, input.envelope.platform) : "unknown");

  const maxSteps = Math.max(1, input.maxSteps ?? 4);
  const plan = buildRecoveryPlan({
    tool: input.tool,
    envelope: input.envelope,
    result: input.result,
    errorKind,
    sessionId,
    platform
  });
  const cmd = command ? ` command=${command}` : "";
  const head = `Recovery for ${input.tool}${cmd} sessionId="${sessionId}".${locatorHint}`.trim();
  const steps = plan
    .slice(0, maxSteps)
    .map((step, idx) => `${idx + 1}) ${step.tool}: ${step.note}`)
    .join(" ");
  if (steps.length > 0) {
    return `${head} ${steps}`;
  }
  if (errorKind === "environment" || /not ready|runtime not ready|adb|wda|hdc|playwright/i.test(message)) {
    return `${head} Run ada_diagnostics or ada_install_deps, then retry.`;
  }
  return `${head} Retry once; if still failing, inspect with ada_extract/ada_mobile_extract before ada_invoke.`;
}

/** Slim plan for MCP JSON: drop bulky args, keep first N steps. */
export function slimRecoveryPlan(
  plan: RecoveryPlanStep[],
  maxSteps = 2
): Array<Pick<RecoveryPlanStep, "kind" | "tool" | "note"> & { requires?: string[] }> {
  return plan.slice(0, Math.max(1, maxSteps)).map((step) => ({
    kind: step.kind,
    tool: step.tool,
    note: step.note,
    ...(step.requires?.length ? { requires: step.requires } : {})
  }));
}
