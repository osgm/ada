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
  DEVICE_ADMIN_HINT,
  HARMONY_LAUNCH_HINT,
  MCP_GLOBAL_POLICY,
  MCP_WORKFLOW_L0_L4,
  UPGRADE_L2_L3_MOBILE,
  UPGRADE_L2_L3_WEB
} from "./mcp-tool-policy.js";
import {
  formatTieredDescription,
  getToolTier,
  isAdvancedDescriptionMode,
  shouldHideAdvancedTools,
  sortToolsByTier
} from "./mcp-tool-tiers.js";

function policyRef(): string {
  return MCP_GLOBAL_POLICY;
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
        `${MCP_WORKFLOW_L0_L4} Runtime health: Node, Playwright, adb/WDA/hdc, plugins, dependency gaps. ` +
        "USE: session start, after ada_install_deps, or missing-binary errors. Not deep debug → ada_diagnostics. " +
        `ARGS: scope=web|mobile|all (default web). ${policyRef()}`,
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
        `${UPGRADE_L2_L3_WEB} Popups → ada_web_dismiss_popups. monitor.onFailureOnly on critical steps.`,
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
            payload: { url: "https://www.jd.com" }
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
        `${HARMONY_LAUNCH_HINT} ` +
        `${DEVICE_ADMIN_HINT} ` +
        `ARGS: platform, command, sessionId, payload (real, keepSession, capabilities, appId, abilityId, locator). ` +
        `${UPGRADE_L2_L3_MOBILE} Popups → ada_mobile_dismiss_popups.`,
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
        "L2 mobile recipes: dump_ui, tap_search, fill_search (prefer over click+type chains). " +
        "Requires ada_devices + same sessionId. ARGS: platform, action, text (fill_search).",
      inputSchema: {
        type: "object",
        title: "ada_mobile_recipe_input",
        properties: {
          platform: platformMobileField(),
          sessionId: sessionIdField("mobile"),
          requestId: requestIdField(),
          action: {
            type: "string",
            enum: ["dump_ui", "tap_search", "fill_search"],
            description: "Recipe action name"
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
      name: "ada_execute",
      description:
        "L3 unified CommandEnvelope (web+mobile) for generic task runners. " +
        "Prefer ada_web_action / ada_mobile_action for E2E; use ada_invoke for driver RPC. " +
        `Aliases: terminateApp→exitApp, fill→type. ${policyRef()}` +
        advancedExtra("Supports invoke/recipe/custom in one schema for CI task JSON."),
      inputSchema: {
        type: "object",
        title: "ada_execute_input",
        properties: {
          requestId: requestIdField(),
          sessionId: sessionIdField("any"),
          platform: platformAnyField(),
          command: {
            type: "string",
            title: "command",
            description:
              "Semantic command 语义命令（web+mobile 全集）: navigate, click, swipe, launchApp, newTab, invoke, …",
            enum: [
              "click",
              "type",
              "swipe",
              "assertVisible",
              "screenshot",
              "navigate",
              "hover",
              "press",
              "select",
              "scroll",
              "forward",
              "newTab",
              "switchTab",
              "uploadFile",
              "dragDrop",
              "wait",
              "assertText",
              "getText",
              "back",
              "reload",
              "closeTab",
              "pressHome",
              "home",
              "launchApp",
              "exitApp",
              "recipe",
              "custom",
              "invoke"
            ]
          },
          payload: payloadProperty(),
          allowMock: allowMockField(),
          riskApproved: riskApprovedField(),
          monitor: monitorProperty()
        },
        required: ["platform", "command"],
        additionalProperties: false
      }
    },
    {
      name: "ada_invoke",
      description:
        "L3 driver RPC. Web: mode=method (page|locator + method + args). Mobile: mode=http (WebDriver/hdc path) + capabilities from ada_devices. " +
        "REQUIRES riskApproved=true. VS ada_execute: invoke=RPC; execute=task envelope. " +
        `${policyRef()}` +
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
        "Extract web text/list/table/viewTree. Not assertions → ada_assertions. ARGS: sessionId, mode=text|list|table|viewTree, payload.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Web session from ada_web_action navigate/click flow" },
          mode: {
            type: "string",
            enum: ["text", "list", "table", "viewTree"],
            description: "Extraction shape: text, list, table rows, or semantic viewTree snapshot"
          },
          payload: { type: "object", description: "CSS/xpath/locator and extraction options" },
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
        "Mobile text or pageSource (debug tree before ada_invoke). ARGS: platform, sessionId, type=text|pageSource.",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["android", "ios", "harmony"] },
          sessionId: { type: "string", description: "Active mobile session" },
          type: {
            type: "string",
            enum: ["text", "pageSource"],
            description: "text=visible text; pageSource=UI hierarchy XML"
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
