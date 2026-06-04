import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { buildRecoveryPlan, classifyErrorKind } from "./mcp-recovery.js";

export type McpToolTier = "T1" | "T2" | "T3";

export type McpToolDepth = "L0" | "L1" | "L2" | "L3" | "L4";

export const MCP_TOOL_TIER_ORDER: Record<McpToolTier, number> = {
  T1: 1,
  T2: 2,
  T3: 3
};

/** T1=semantic, T2=orchestrate, T3=driver-level */
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

export const MCP_TOOL_DEPTH: Record<string, McpToolDepth> = {
  ada_health: "L0",
  ada_install_deps: "L0",
  ada_devices: "L0",
  ada_diagnostics: "L0",
  ada_config: "L0",
  ada_plugins: "L0",
  ada_start_once: "L0",
  ada_perf_summary: "L0",

  ada_web_action: "L1",
  ada_web_dismiss_popups: "L1",
  ada_mobile_action: "L1",
  ada_mobile_dismiss_popups: "L1",
  ada_extract: "L1",
  ada_assertions: "L1",
  ada_mobile_extract: "L1",
  ada_mobile_assertions: "L1",

  ada_batch_actions: "L2",
  ada_run_task_file: "L2",
  ada_mobile_recipe: "L2",

  ada_invoke: "L3",
  ada_execute: "L3",

  ada_risk_policy: "L4"
};

/** Domain-ordered ListTools: invoke sits after web_action, before mobile cluster. */
export const MCP_TOOL_LIST_ORDER: string[] = [
  "ada_health",
  "ada_install_deps",
  "ada_devices",
  "ada_diagnostics",
  "ada_config",
  "ada_plugins",
  "ada_perf_summary",
  "ada_start_once",
  "ada_web_action",
  "ada_invoke",
  "ada_execute",
  "ada_web_dismiss_popups",
  "ada_extract",
  "ada_assertions",
  "ada_mobile_action",
  "ada_mobile_recipe",
  "ada_mobile_dismiss_popups",
  "ada_mobile_extract",
  "ada_mobile_assertions",
  "ada_batch_actions",
  "ada_run_task_file",
  "ada_sessions",
  "ada_close_session",
  "ada_close_all_sessions",
  "ada_risk_policy"
];

const DEPTH_PREFIX: Record<McpToolDepth, string> = {
  L0: "L0-env",
  L1: "L1-semantic",
  L2: "L2-orchestrate",
  L3: "L3-driver",
  L4: "L4-policy"
};

const PRIMARY_SEMANTIC_TOOLS = new Set(["ada_web_action", "ada_mobile_action"]);

export function getToolTier(toolName: string): McpToolTier {
  return MCP_TOOL_TIERS[toolName] ?? "T2";
}

export function getToolDepth(toolName: string): McpToolDepth {
  return MCP_TOOL_DEPTH[toolName] ?? "L2";
}

export function shouldHideAdvancedTools(): boolean {
  const raw = String(process.env.ADA_MCP_HIDE_ADVANCED ?? process.env.ADA_MCP_TOOL_VISIBILITY ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "hide-advanced" || raw === "primary-only";
}

/** advanced = longer T3/driver copy; compact (default) = shorter descriptions. */
export function isAdvancedDescriptionMode(): boolean {
  const raw = String(process.env.ADA_MCP_DESC_MODE ?? "").trim().toLowerCase();
  return raw === "advanced" || raw === "full";
}

export function formatTieredDescription(toolName: string, description: string): string {
  const depth = getToolDepth(toolName);
  const prefix = DEPTH_PREFIX[depth];
  if (depth === "L3") {
    return `[${prefix}] Driver-level: use when semantic commands or recipes are insufficient. ${description}`;
  }
  if (depth === "L2") {
    return `[${prefix}] ${description}`;
  }
  if (depth === "L4") {
    return `[${prefix}] ${description}`;
  }
  if (PRIMARY_SEMANTIC_TOOLS.has(toolName)) {
    return `[${prefix}] Primary semantic entry. ${description}`;
  }
  if (depth === "L0") {
    return `[${prefix}] ${description}`;
  }
  return `[${prefix}] ${description}`;
}

export function sortToolsByTier<T extends { name: string }>(tools: T[]): T[] {
  const order = new Map(MCP_TOOL_LIST_ORDER.map((name, index) => [name, index]));
  return [...tools].sort((a, b) => {
    const ai = order.get(a.name) ?? 9999;
    const bi = order.get(b.name) ?? 9999;
    if (ai !== bi) return ai - bi;
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
