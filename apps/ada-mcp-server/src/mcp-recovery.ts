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
        ? "Locator miss — pageTextPreview is in the error payload; retry with payload.locator (css/role) or within+nth (do not call ada_close_all_sessions)."
        : "Locator miss — ada_extract mode=viewTree (tree+flat controls), then ada_web_recipe clickPath/fill_search or scoped locator.",
      acceptedLocatorFormats: [
        "payload.locator.css",
        "payload.selector",
        'locator: { kind: "css", value: "#id" }',
        'locator: { kind: "role", role: "menuitem", name: "File", within: { kind: "role", role: "menubar" }, nth: 0 }',
        'locator: { strategy: "css", value: "#id", nth: 1 }'
      ],
      retryPayloadHints: [
        "payload.locator.css",
        "payload.selector",
        "payload.locator.within + payload.locator.nth",
        "payload.waitTimeoutMs: 8000"
      ]
    };
  }
  return {
    suggestTools: ["ada_mobile_extract", "ada_mobile_recipe"],
    note: "Locator miss — ada_mobile_extract type=viewTree, then ada_mobile_recipe tap_path or adjust locator strategy/value.",
    retryPayloadHints: ["payload.locator.strategy+xpath", "payload.locator.strategy=text"]
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
