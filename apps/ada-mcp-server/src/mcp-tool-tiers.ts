import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { buildRecoveryPlan, classifyErrorKind } from "./mcp-recovery.js";

export type McpToolTier = "T1" | "T2" | "T3";

export const MCP_TOOL_TIER_ORDER: Record<McpToolTier, number> = {
  T1: 1,
  T2: 2,
  T3: 3
};

/** T1=primary daily tools, T2=orchestrate/ops, T3=fallback/advanced */
export const MCP_TOOL_TIERS: Record<string, McpToolTier> = {
  ada_health: "T1",
  ada_devices: "T1",
  ada_web_action: "T1",
  ada_web_dismiss_popups: "T1",
  ada_mobile_action: "T1",
  ada_mobile_dismiss_popups: "T1",
  ada_extract: "T1",
  ada_assertions: "T1",
  ada_mobile_extract: "T1",
  ada_mobile_assertions: "T1",
  ada_batch_actions: "T1",
  ada_sessions: "T1",
  ada_close_session: "T1",
  ada_close_all_sessions: "T1",
  ada_install_deps: "T1",

  ada_diagnostics: "T2",
  ada_plugins: "T2",
  ada_perf_summary: "T2",
  ada_config: "T2",
  ada_start_once: "T2",
  ada_mobile_recipe: "T2",
  ada_run_task_file: "T2",

  ada_execute: "T3",
  ada_invoke: "T3",
  ada_risk_policy: "T3"
};

const TIER_LABEL: Record<McpToolTier, string> = {
  T1: "T1-primary",
  T2: "T2-orchestrate",
  T3: "T3-fallback"
};

export function getToolTier(toolName: string): McpToolTier {
  return MCP_TOOL_TIERS[toolName] ?? "T2";
}

export function shouldHideAdvancedTools(): boolean {
  const raw = String(process.env.ADA_MCP_HIDE_ADVANCED ?? process.env.ADA_MCP_TOOL_VISIBILITY ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "hide-advanced" || raw === "primary-only";
}

export function formatTieredDescription(toolName: string, description: string): string {
  const tier = getToolTier(toolName);
  const label = TIER_LABEL[tier];
  if (tier === "T3") {
    return `[${label}] USE ONLY AFTER T1 tools failed. ${description}`;
  }
  if (tier === "T2") {
    return `[${label}] ${description}`;
  }
  return `[${label}] DEFAULT tool for this capability. ${description}`;
}

export function sortToolsByTier<T extends { name: string }>(tools: T[]): T[] {
  return [...tools].sort((a, b) => {
    const tierDiff = MCP_TOOL_TIER_ORDER[getToolTier(a.name)] - MCP_TOOL_TIER_ORDER[getToolTier(b.name)];
    if (tierDiff !== 0) return tierDiff;
    return a.name.localeCompare(b.name);
  });
}

export function buildRecoveryHint(input: {
  tool: string;
  envelope?: CommandEnvelope;
  result?: CommandResult;
  errorKind?: "validation" | "environment" | "assertion_failed" | "command_failed" | "timeout" | "risk_denied" | "unknown";
  sessionId?: string;
  platform?: string;
}): string {
  const sessionId = input.sessionId ?? input.envelope?.sessionId ?? "same-session";
  const platform = input.platform ?? input.envelope?.platform ?? "web";
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
    (input.result && input.envelope
      ? classifyErrorKind(input.result, input.envelope.platform)
      : "unknown");

  const plan = buildRecoveryPlan({
    tool: input.tool,
    envelope: input.envelope,
    result: input.result,
    errorKind,
    sessionId,
    platform: platform as "web" | "android" | "ios" | "harmony"
  });
  const cmd = command ? ` command=${command}` : "";
  const head = `Recovery for ${input.tool}${cmd} sessionId="${sessionId}".${locatorHint}`.trim();
  const steps = plan
    .slice(0, 4)
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
