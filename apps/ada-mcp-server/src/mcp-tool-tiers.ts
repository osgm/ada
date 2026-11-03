import { hideAdvancedToolsFromEnv } from "@ada/core-runtime";

export { buildRecoveryHint } from "./mcp-recovery.js";

/** Full policy copy — advanced mode or ada://guide/routing resource. */
export const MCP_GLOBAL_POLICY =
  "Policy: riskApproved=true for invoke/custom/launchApp/destructive deviceAdmin; allowMock=false unless offline demo; reuse sessionId; prefer ada_batch_actions for multi-step; observe(extract) once then act; default retry=0 (retry=1 only on transient); avoid concurrent writes on same sessionId (reads may parallel); mobile: ada_devices(scan) then deviceParams.recommended; on failure read recoveryHint then extract/pageSource then invoke.";

/** Compact policy — single ada_health anchor; keeps trial-reduction essentials. */
export const MCP_GLOBAL_POLICY_COMPACT =
  "Policy: riskApproved for invoke/launchApp/deviceAdmin; reuse sessionId; batch multi-step; observe once then act; retry=0 default; no concurrent writes same session; mobile: ada_devices(scan) first; on fail recoveryHint→extract→invoke.";

export const MCP_WORKFLOW_L0_L4 =
  "Workflow L0 health→install_deps→devices(scan) | L1 ada_web_action/ada_mobile_action | L2 batch_actions/run_task_file/mobile_recipe | L3 ada_invoke | L4 deviceAdmin/risk_policy. Speed: reuse sessionId + batch + one observe.";

export const MCP_WORKFLOW_COMPACT =
  "START ada_health once → reuse sessionId → L2 batch when multi-step → L1 action → L3 invoke. ada://guide/routing.";

export const UPGRADE_L2_L3_WEB =
  "Escalate: Playwright page.* or CDP → ada_invoke; multi-step → ada_batch_actions or ada_run_task_file.";

export const UPGRADE_WEB_COMPACT =
  "Escalate: ada_web_recipe|ada_batch_actions|ada_invoke. Popups: ada_web_dismiss_popups.";

export const UPGRADE_L2_L3_MOBILE =
  "Escalate: adapter HTTP/hdc/hypium or UI tree debug → ada_invoke; search heuristics → ada_mobile_recipe; multi-step → ada_batch_actions.";

export const UPGRADE_MOBILE_COMPACT =
  "Escalate: ada_mobile_recipe|ada_batch_actions|ada_invoke. Popups: ada_mobile_dismiss_popups.";

export const DEVICE_ADMIN_ACTION_ENUM = [
  "listApps",
  "appInfo",
  "installApp",
  "uninstallApp",
  "pushFile",
  "pullFile",
  "shell",
  "hdc",
  "currentApp",
  "clearAppData",
  "openUrl",
  "pressKey",
  "longPress",
  "setClipboard",
  "getClipboard",
  "deviceInfo",
  "grantPermission",
  "setOrientation",
  "startScreenRecord",
  "stopScreenRecord",
  "reboot",
  "killAllApps",
  "wake"
] as const;

export const DEVICE_ADMIN_HINT =
  "deviceAdmin: set command=deviceAdmin and payload.action (enum). Common: shell, currentApp, installApp, pushFile, hdc.";

export const DEVICE_ADMIN_COMPACT = "deviceAdmin: command=deviceAdmin + payload.action (shell|currentApp|hdc|…).";

export const HARMONY_LAUNCH_HINT =
  "Harmony launchApp: payload.appId (bundle) + payload.abilityId (e.g. EntryAbility); bundleId alias; copy deviceParams.harmonyLaunchApp.args; riskApproved=true.";

export const HARMONY_LAUNCH_COMPACT =
  "Harmony launchApp: appId+abilityId (e.g. EntryAbility); copy deviceParams.harmonyLaunchApp; riskApproved=true.";

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
  ada_web_recipe: "T2",
  ada_run_task_file: "T2",

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
  ada_web_recipe: "L2",

  ada_invoke: "L3",

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
  "ada_web_recipe",
  "ada_invoke",
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
  return hideAdvancedToolsFromEnv();
}

/**
 * ListTools 描述详略。
 * 未设 / advanced / full → 长描述（Host 默认）；显式 compact / short → 短描述。
 */
export function isAdvancedDescriptionMode(): boolean {
  const raw = String(process.env.ADA_MCP_DESC_MODE ?? "").trim().toLowerCase();
  if (raw === "compact" || raw === "short") return false;
  return true;
}

export function isCompactDescriptionMode(): boolean {
  return !isAdvancedDescriptionMode();
}

export function formatTieredDescription(toolName: string, description: string): string {
  const depth = getToolDepth(toolName);
  const prefix = DEPTH_PREFIX[depth];
  const advanced = isAdvancedDescriptionMode();
  if (depth === "L3") {
    const lead = advanced ? "Driver-level: use when L1/L2 insufficient. " : "";
    return `[${prefix}] ${lead}${description}`;
  }
  if (PRIMARY_SEMANTIC_TOOLS.has(toolName) && advanced) {
    return `[${prefix}] Primary semantic entry. ${description}`;
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

