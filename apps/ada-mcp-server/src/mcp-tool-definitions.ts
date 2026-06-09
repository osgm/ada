/**
 * MCP ListTools catalog — descriptions optimized for LLM tool routing.
 * Format: category, capability, when to use, alternatives, key parameters.
 */
import {
  allowMockField,
  batchCommandField,
  bestEffortField,
  dismissTimeoutField,
  mobileCommandField,
  monitorProperty,
  payloadProperty,
  platformAnyField,
  platformMobileField,
  requestIdField,
  retryActionFields,
  riskApprovedField,
  sessionIdField,
  webCommandField,
  webEngineField
} from "./mcp-schemas.js";
import {
  DEVICE_ADMIN_COMPACT,
  DEVICE_ADMIN_HINT,
  HARMONY_LAUNCH_COMPACT,
  HARMONY_LAUNCH_HINT,
  MCP_GLOBAL_POLICY,
  MCP_GLOBAL_POLICY_COMPACT,
  MCP_WORKFLOW_COMPACT,
  MCP_WORKFLOW_L0_L4,
  UPGRADE_L2_L3_MOBILE,
  UPGRADE_L2_L3_WEB,
  UPGRADE_MOBILE_COMPACT,
  UPGRADE_WEB_COMPACT,
  formatTieredDescription,
  getToolTier,
  isAdvancedDescriptionMode,
  shouldHideAdvancedTools,
  sortToolsByTier
} from "./mcp-tool-tiers.js";

/** Global policy appears once on ada_health (compact) to save tokens across ListTools. */
function healthPolicyRef(): string {
  return isAdvancedDescriptionMode() ? ` ${MCP_GLOBAL_POLICY}` : ` ${MCP_GLOBAL_POLICY_COMPACT}`;
}

function workflowRef(): string {
  return isAdvancedDescriptionMode() ? `${MCP_WORKFLOW_L0_L4} ` : `${MCP_WORKFLOW_COMPACT} `;
}

function upgradeWebRef(): string {
  return isAdvancedDescriptionMode()
    ? `${UPGRADE_L2_L3_WEB} Popups → ada_web_dismiss_popups. `
    : `${UPGRADE_WEB_COMPACT} `;
}

function upgradeMobileRef(): string {
  return isAdvancedDescriptionMode()
    ? `${UPGRADE_L2_L3_MOBILE} Popups → ada_mobile_dismiss_popups. `
    : `${UPGRADE_MOBILE_COMPACT} `;
}

function mobileLaunchHints(): string {
  if (isAdvancedDescriptionMode()) {
    return `${HARMONY_LAUNCH_HINT} ${DEVICE_ADMIN_HINT} `;
  }
  return `${HARMONY_LAUNCH_COMPACT} ${DEVICE_ADMIN_COMPACT} `;
}

function advancedExtra(text: string): string {
  return isAdvancedDescriptionMode() ? ` ${text}` : "";
}

function buildAllAdaMcpToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return [
    {
      name: "ada_health",
      description:
        `${workflowRef()}Runtime health: Node, Playwright, adb/WDA/hdc, plugins, dependency gaps. ` +
        "USE: session start, after ada_install_deps, or missing-binary errors. Not deep debug → ada_diagnostics. " +
        `ARGS: scope=web|mobile|all (default web).${healthPolicyRef()}`,
      inputSchema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["web", "mobile", "all"],
            description: "Which dependency families to include in the snapshot (default: web)"
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_diagnostics",
      description:
        "Full doctor report (Node, registry, browsers, adb, WDA, hdc, paths, config). " +
        "USE: ada_health degraded, CI setup, unexplained driver failures. Fast check → ada_health. " +
        "ARGS: scope=web|mobile|all (default web).",
      inputSchema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["web", "mobile", "all"],
            description: "Limit diagnostic checks to web, mobile, or all stacks (default: web)"
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_plugins",
      description:
        "[Observe] List built-in ADA driver plugins currently registered (playwright, android, ios, harmony) with versions and capabilities. " +
        "USE WHEN: verifying which engines are available before ada_web_action / ada_invoke / ada_mobile_action. " +
        "No parameters required.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_perf_summary",
      description:
        "MCP tool latency stats (count, avg, p50, p95, max). USE: profiling slow steps. ARGS: reset=true clears samples.",
      inputSchema: {
        type: "object",
        properties: {
          reset: { type: "boolean", description: "Clear accumulated timing samples after returning summary" }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_config",
      description:
        "Read effective agent config (yaml, env, workspace paths). USE: headless, driver dirs, risk policy before runs. No parameters.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_devices",
      description:
        "MOBILE PREREQUISITE: scan/list Android/iOS/Harmony devices. Returns rows + deviceParams.recommended + harmonyLaunchApp (Harmony launch template). " +
        "Copy platform, sessionId, capabilities into ada_mobile_action (reuse sessionId). " +
        "ARGS: action=scan|list (default scan). Optional deviceTags on scan.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "scan"],
            description: "scan (default)=run adb/hdc/xcrun and merge into registry; list=read persisted cache only"
          },
          deviceTags: {
            type: "array",
            items: { type: "string" },
            description: "Optional tags stored with registry on scan (e.g. lab-1, team-a)"
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_install_deps",
      description:
        "Install Playwright browsers, adb, WDA, hypium/hdc. USE: ada_health/diagnostics missing deps. " +
        "ARGS: only=all|playwright|mobile|android|ios|harmony|drivers (default playwright); force=true.",
      inputSchema: {
        type: "object",
        properties: {
          only: {
            type: "string",
            enum: ["all", "playwright", "mobile", "android", "ios", "harmony", "drivers"],
            description: "Dependency bundle to install (default: playwright when omitted)"
          },
          force: { type: "boolean", description: "Reinstall even if already satisfied" }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_start_once",
      description:
        "Agent bootstrap once (credentials, deps, plugin warmup). Not UI automation → ada_web_action. " +
        "ARGS: localDev=true; skipDeps=true.",
      inputSchema: {
        type: "object",
        properties: {
          localDev: { type: "boolean", description: "Skip remote credential requirement for local debugging" },
          skipDeps: { type: "boolean", description: "Do not auto-run dependency install during start" }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_web_action",
      description:
        "Playwright web UI step. Common: navigate, click, type, screenshot, wait, newTab. Full commands: schema.enum. " +
        "ARGS: command (required), sessionId, payload (locator, url, cdpEndpoint, userDataDir, headless). " +
        `${upgradeWebRef()}monitor.onFailureOnly on critical steps.`,
      inputSchema: {
        type: "object",
        title: "ada_web_action_input",
        description: "Web UI automation step 网页自动化单步",
        properties: {
          engine: webEngineField(),
          command: webCommandField(),
          sessionId: sessionIdField("web"),
          requestId: requestIdField(),
          payload: payloadProperty(),
          allowMock: allowMockField(),
          riskApproved: riskApprovedField(),
          monitor: monitorProperty(),
          bestEffort: bestEffortField(),
          ...retryActionFields()
        },
        required: ["command"],
        additionalProperties: false,
        examples: [
          {
            command: "navigate",
            sessionId: "jd-web",
            payload: { url: "https://www.jd.com", waitUntil: "domcontentloaded", navigationTimeoutMs: 45000 }
          },
          {
            command: "click",
            sessionId: "jd-web",
            retry: 1,
            payload: { locator: { role: "textbox", name: "搜索" } }
          }
        ]
      }
    },
    {
      name: "ada_web_recipe",
      description:
        "L2 web recipe: clickPath (path expand+click; waitNavigation only for href links), fill_search (search entry→input→Enter). " +
        "Observation → ada_extract mode=viewTree. ARGS: sessionId, action, path (clickPath), text (fill_search), entryHints/inputHints in payload.",
      inputSchema: {
        type: "object",
        title: "ada_web_recipe_input",
        properties: {
          sessionId: sessionIdField("web"),
          requestId: requestIdField(),
          action: {
            type: "string",
            enum: ["clickPath", "fill_search"],
            description: "clickPath=expand path then activate leaf; fill_search=heuristic search box fill"
          },
          path: {
            type: "array",
            items: { type: "string" },
            description: "clickPath labels from root to leaf; empty string uses triggerNth fallback"
          },
          text: { type: "string", description: "Required for fill_search" },
          strategy: {
            type: "string",
            enum: ["auto", "hover", "click"],
            description: "Expand strategy for popup triggers (auto uses layout/heuristics)"
          },
          waitNavigation: {
            type: "boolean",
            description:
              "clickPath: wait for URL change after leaf click (default false; auto true when leaf has href). In-page menus: false."
          },
          expandSettleMs: {
            type: "number",
            description: "clickPath: pause after expanding menu segment in ms (default 100)"
          },
          payload: payloadProperty(),
          allowMock: allowMockField(),
          riskApproved: riskApprovedField()
        },
        required: ["action"],
        additionalProperties: false,
        examples: [
          {
            action: "clickPath",
            sessionId: "jd-web",
            path: ["搜索"],
            waitNavigation: false
          },
          {
            action: "fill_search",
            sessionId: "jd-web",
            text: "手机",
            payload: { entryHints: ["搜索"], inputHints: ["请输入", "搜索"] }
          }
        ]
      }
    },
    {
      name: "ada_web_dismiss_popups",
      description:
        "Dismiss web dialogs (ok if POPUP_NOT_FOUND). Prefer over click loops for 关闭/×. ARGS: sessionId, timeoutMs.",
      inputSchema: {
        type: "object",
        title: "ada_web_dismiss_popups_input",
        properties: {
          sessionId: sessionIdField("web"),
          engine: webEngineField(),
          payload: payloadProperty(),
          timeoutMs: dismissTimeoutField(),
          allowMock: allowMockField()
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_mobile_action",
      description:
        "Mobile UI step (android|ios|harmony). Requires ada_devices(scan) → deviceParams.recommended (platform, sessionId, capabilities). " +
        "Common: click, type, launchApp, screenshot, back, deviceAdmin. " +
        `${mobileLaunchHints()}` +
        `ARGS: platform, command, sessionId, payload (real, keepSession, capabilities, appId, abilityId, locator). ` +
        `${upgradeMobileRef()}`,
      inputSchema: {
        type: "object",
        title: "ada_mobile_action_input",
        description: "Mobile UI automation step 移动端自动化单步",
        properties: {
          platform: platformMobileField(),
          command: mobileCommandField(),
          sessionId: sessionIdField("mobile"),
          requestId: requestIdField(),
          payload: payloadProperty(),
          allowMock: allowMockField(),
          riskApproved: riskApprovedField(),
          monitor: monitorProperty(),
          bestEffort: bestEffortField(),
          ...retryActionFields()
        },
        required: ["platform", "command"],
        additionalProperties: false,
        examples: [
          {
            platform: "android",
            command: "launchApp",
            sessionId: "ada-android-demo",
            riskApproved: true,
            payload: {
              appId: "com.jingdong.app.mall",
              real: true,
              keepSession: true,
              capabilities: { udid: "R28M30T7HFV" }
            }
          },
          {
            platform: "harmony",
            command: "launchApp",
            sessionId: "ada-harmony-demo",
            riskApproved: true,
            payload: {
              appId: "com.jd.hm.mall",
              abilityId: "EntryAbility",
              real: true,
              keepSession: true,
              capabilities: { deviceSn: "2QS0224716026324" }
            }
          }
        ]
      }
    },
    {
      name: "ada_mobile_dismiss_popups",
      description:
        "Dismiss mobile popups (ok if POPUP_NOT_FOUND). After ada_devices. ARGS: platform, sessionId, timeoutMs.",
      inputSchema: {
        type: "object",
        title: "ada_mobile_dismiss_popups_input",
        properties: {
          platform: platformMobileField(),
          sessionId: sessionIdField("mobile"),
          payload: payloadProperty(),
          timeoutMs: dismissTimeoutField(),
          allowMock: allowMockField()
        },
        required: ["platform"],
        additionalProperties: false
      }
    },
    {
      name: "ada_mobile_recipe",
      description:
        "L2 mobile recipes: dump_ui, viewTree via ada_mobile_extract, tap_path (path labels), tap_search, fill_search. " +
        "Requires ada_devices + same sessionId. ARGS: platform, action, path (tap_path), text (fill_search).",
      inputSchema: {
        type: "object",
        title: "ada_mobile_recipe_input",
        properties: {
          platform: platformMobileField(),
          sessionId: sessionIdField("mobile"),
          requestId: requestIdField(),
          action: {
            type: "string",
            enum: ["dump_ui", "tap_search", "fill_search", "tap_path"],
            description: "Recipe action name"
          },
          path: {
            type: "array",
            items: { type: "string" },
            description: "tap_path: label segments from root to target (re-dumps UI between segments)"
          },
          text: { type: "string", description: "Required for fill_search" },
          payload: payloadProperty(),
          allowMock: allowMockField(),
          riskApproved: riskApprovedField()
        },
        required: ["platform", "action"],
        additionalProperties: false
      }
    },
    {
      name: "ada_invoke",
      description:
        "L3 driver RPC. Web: mode=method (page|locator + method + args). Mobile: mode=http (WebDriver/hdc path) + capabilities from ada_devices. " +
        "REQUIRES riskApproved=true. Driver RPC — not semantic ada_web_action / ada_mobile_action. " +
        advancedExtra(
          `${MCP_GLOBAL_POLICY} `
        ) +
        advancedExtra(
          "Web: page.evaluate, context.cookies. Android: GET /source. Harmony: hdc shell via http path."
        ),
      inputSchema: {
        type: "object",
        title: "ada_invoke_input",
        properties: {
          requestId: requestIdField(),
          sessionId: sessionIdField("any"),
          platform: platformAnyField(),
          mode: {
            type: "string",
            title: "mode",
            enum: ["method", "http"],
            description: "method=Playwright API (web); http=adapter/WebDriver/hdc (mobile)"
          },
          target: {
            type: "string",
            title: "target",
            description: "Playwright object: page | context | browser | locator"
          },
          method: {
            type: "string",
            title: "method",
            description: "Method name on target (method mode)"
          },
          args: {
            type: "array",
            title: "args",
            items: {},
            description: "JSON-serializable method arguments"
          },
          http: {
            type: "object",
            title: "http",
            description: "Adapter HTTP { method, path, body }",
            properties: {
              method: { type: "string", title: "method", description: "HTTP verb GET|POST" },
              path: { type: "string", title: "path", description: "Driver path e.g. /session/.../source" },
              body: { title: "body", description: "Optional JSON body" }
            },
            required: ["method", "path"]
          },
          payload: payloadProperty(),
          allowMock: allowMockField(),
          riskApproved: riskApprovedField(true),
          monitor: monitorProperty()
        },
        required: ["platform"],
        additionalProperties: false,
        examples: [
          {
            platform: "web",
            mode: "method",
            target: "page",
            method: "title",
            args: [],
            sessionId: "jd-web",
            riskApproved: true
          },
          {
            platform: "android",
            mode: "http",
            sessionId: "ada-android-R28M30T7HFV",
            http: { method: "GET", path: "/source" },
            payload: {
              real: true,
              keepSession: true,
              capabilities: { udid: "R28M30T7HFV" }
            },
            riskApproved: true
          },
          {
            platform: "harmony",
            mode: "http",
            sessionId: "ada-harmony-device",
            http: { method: "POST", path: "/hdc/shell", body: { command: "hidumper -s WindowManagerService -a -a" } },
            payload: {
              real: true,
              keepSession: true,
              capabilities: { deviceSn: "2QS0224716026324" }
            },
            riskApproved: true
          }
        ]
      }
    },
    {
      name: "ada_run_task_file",
      description:
        "L2 run .tasks.json (regression/CI). Inline steps without file → ada_batch_actions. ARGS: file (required), monitor.",
      inputSchema: {
        type: "object",
        properties: {
          file: {
            type: "string",
            title: "file",
            description: "Path to .tasks.json 任务文件路径（相对 MCP 工作区或绝对路径）"
          },
          allowMock: allowMockField(),
          monitor: monitorProperty()
        },
        required: ["file"],
        additionalProperties: false
      }
    },
    {
      name: "ada_batch_actions",
      description:
        "L2 multi-step semantic batch (shared sessionId). ARGS: platform, sessionId, actions[], onFailure=stop|continue, dryRun=true (validate only).",
      inputSchema: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["web", "android", "ios", "harmony"],
            description: "Platform for all actions in the batch"
          },
          sessionId: {
            type: "string",
            description: "Active session that all steps share (required)"
          },
          continueOnError: {
            type: "boolean",
            description: "DEPRECATED: use onFailure=continue. If true, run remaining steps after a failure."
          },
          onFailure: {
            type: "string",
            enum: ["stop", "continue"],
            description: "stop=abort batch on first error; continue=collect errors"
          },
          dryRun: {
            type: "boolean",
            description: "Validate and preview batch plan without executing commands"
          },
          allowMock: allowMockField(),
          riskApproved: riskApprovedField(),
          actions: {
            type: "array",
            description: "Ordered list of steps",
            items: {
              type: "object",
              properties: {
                requestId: { type: "string" },
                command: batchCommandField(),
                payload: { type: "object" },
                timeoutMs: { type: "number" },
                retry: { type: "number", description: "Retry count on transient failure" }
              },
              required: ["command"],
              additionalProperties: false
            }
          }
        },
        required: ["platform", "sessionId", "actions"],
        additionalProperties: false
      }
    },
    {
      name: "ada_extract",
      description:
        "Extract web text/list/table/viewTree. viewTree returns semantic tree + flat controls (path/triggerKind). " +
        "Not assertions → ada_assertions. ARGS: sessionId, mode=text|list|table|viewTree, payload.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Web session from ada_web_action navigate/click flow" },
          mode: {
            type: "string",
            enum: ["text", "list", "table", "viewTree"],
            description: "viewTree: flat controls (default) or tree/full; payload.detail=controls|tree|full; maxItems caps controls/tree nodes"
          },
          payload: {
            type: "object",
            description: "viewTree: detail, href, name filters; other modes: CSS/xpath/locator options"
          },
          allowMock: allowMockField(),
          riskApproved: riskApprovedField()
        },
        required: ["sessionId", "mode"],
        additionalProperties: false
      }
    },
    {
      name: "ada_assertions",
      description:
        "[Data-Web] Assert web page state: element visible, text content, or URL — fails the step if condition not met. " +
        "USE WHEN: test verification after ada_web_action (prefer over manual getText comparison). " +
        "KEY ARGS: sessionId (required), type=visible|text|url, payload (locator, expected text/url).",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Active web session" },
          type: {
            type: "string",
            enum: ["visible", "text", "url"],
            description: "Assertion kind"
          },
          payload: { type: "object", description: "Expected values and locators" },
          allowMock: allowMockField(),
          riskApproved: riskApprovedField()
        },
        required: ["sessionId", "type"],
        additionalProperties: false
      }
    },
    {
      name: "ada_mobile_extract",
      description:
        "Mobile observe: type=viewTree (flat clickable controls), text, or pageSource (raw XML). " +
        "Pair viewTree → ada_mobile_recipe tap_path. ARGS: platform, sessionId, type.",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["android", "ios", "harmony"] },
          sessionId: { type: "string", description: "Active mobile session" },
          type: {
            type: "string",
            enum: ["text", "pageSource", "viewTree"],
            description: "viewTree=flat clickable controls; text=visible text; pageSource=raw hierarchy XML"
          },
          payload: { type: "object" },
          allowMock: allowMockField(),
          riskApproved: riskApprovedField()
        },
        required: ["platform", "sessionId", "type"],
        additionalProperties: false
      }
    },
    {
      name: "ada_mobile_assertions",
      description:
        "Assert mobile visible|text. ARGS: platform, sessionId, type, payload.",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["android", "ios", "harmony"] },
          sessionId: { type: "string" },
          type: { type: "string", enum: ["visible", "text"] },
          payload: { type: "object" },
          allowMock: allowMockField(),
          riskApproved: riskApprovedField()
        },
        required: ["platform", "sessionId", "type"],
        additionalProperties: false
      }
    },
    {
      name: "ada_sessions",
      description: "List active sessions (sessionId, platform). USE: debug leaks before ada_close_session. No parameters.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_close_session",
      description:
        "Close one session. ARGS: platform, sessionId (required); engine=playwright for web.",
      inputSchema: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["web", "android", "ios", "harmony"],
            description: "Session platform"
          },
          sessionId: { type: "string", description: "Id from ada_sessions or prior action response" },
          engine: {
            type: "string",
            enum: ["playwright"],
            description: "Web only: which engine session to close (default playwright)"
          },
          payload: { type: "object", description: "Optional; engine may also be set here" }
        },
        required: ["platform", "sessionId"],
        additionalProperties: false
      }
    },
    {
      name: "ada_close_all_sessions",
      description:
        "Close all sessions (teardown/MCP reload). Prefer ada_close_session for one flow. No parameters.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_risk_policy",
      description:
        "L4 risk allowlist (invoke/custom/destructive). USE: risk_denied errors. ARGS: action=view|add|remove|reset; command for add/remove.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["view", "add", "remove", "reset"],
            description: "view=list policy; add/remove=mutate one command; reset=restore defaults"
          },
          command: {
            type: "string",
            description: "Command name for add/remove (e.g. invoke, custom)"
          }
        },
        additionalProperties: false
      }
    }
  ];
}

let cachedAdaMcpToolDefinitions: Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> | null = null;
let cachedHideAdvanced: boolean | null = null;
let cachedDescMode: string | null = null;

export function buildAdaMcpToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  const hideAdvanced = shouldHideAdvancedTools();
  const descMode = String(process.env.ADA_MCP_DESC_MODE ?? "");
  if (
    cachedAdaMcpToolDefinitions &&
    cachedHideAdvanced === hideAdvanced &&
    cachedDescMode === descMode
  ) {
    return cachedAdaMcpToolDefinitions;
  }
  let tools = buildAllAdaMcpToolDefinitions();
  if (hideAdvanced) {
    tools = tools.filter((tool) => getToolTier(tool.name) !== "T3");
  }
  cachedAdaMcpToolDefinitions = sortToolsByTier(
    tools.map((tool) => ({
      ...tool,
      description: formatTieredDescription(tool.name, tool.description)
    }))
  );
  cachedHideAdvanced = hideAdvanced;
  cachedDescMode = descMode;
  return cachedAdaMcpToolDefinitions;
}
