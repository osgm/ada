/** Shared LLM routing copy (referenced from tool descriptions). */
export const MCP_GLOBAL_POLICY =
  "Policy: riskApproved=true for invoke/custom/launchApp/destructive deviceAdmin; allowMock=false unless offline demo; reuse sessionId; mobile: ada_devices(scan) then deviceParams.recommended; on failure read recoveryHint then retry=1 then extract/pageSource then invoke.";

export const MCP_WORKFLOW_L0_L4 =
  "Workflow L0 health→install_deps→devices(scan) | L1 ada_web_action/ada_mobile_action | L2 batch_actions/run_task_file/mobile_recipe | L3 ada_invoke/ada_execute | L4 deviceAdmin/risk_policy.";

export const UPGRADE_L2_L3_WEB =
  "Escalate: Playwright page.* or CDP → ada_invoke; multi-step → ada_batch_actions or ada_run_task_file.";

export const UPGRADE_L2_L3_MOBILE =
  "Escalate: adapter HTTP/hdc/hypium or UI tree debug → ada_invoke; search heuristics → ada_mobile_recipe; multi-step → ada_batch_actions.";

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
  "reboot"
] as const;

export const DEVICE_ADMIN_HINT =
  "deviceAdmin: set command=deviceAdmin and payload.action (enum). Common: shell, currentApp, installApp, pushFile, hdc.";
