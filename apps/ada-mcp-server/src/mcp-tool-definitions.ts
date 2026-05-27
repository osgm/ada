/**
 * MCP ListTools catalog — descriptions optimized for LLM tool routing.
 * Format: category, capability, when to use, alternatives, key parameters.
 */
import {
  allowMockField,
  mobileCommandField,
  monitorProperty,
  payloadProperty,
  platformAnyField,
  platformMobileField,
  requestIdField,
  riskApprovedField,
  sessionIdField,
  webCommandField,
  webEngineField
} from "./mcp-schemas.js";

const MOCK_HINT =
  "Default is strict real execution; set allowMock=true only for offline demos (returns simulated results).";
const RISK_HINT = "Set riskApproved=true for high-risk commands (invoke, custom, destructive actions).";

export function buildAdaMcpToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return [
    {
      name: "ada_health",
      description:
        "[Observe] Quick health snapshot of the ADA MCP runtime: Node/npm versions, Playwright/Selenium/Appium/Harmony install flags, loaded driver plugins, and dependency gaps. " +
        "USE WHEN: first call in a session, after ada_install_deps, or when automation fails with missing-binary errors. " +
        "DO NOT USE FOR: deep troubleshooting (use ada_diagnostics). " +
        `KEY ARGS: scope=web|mobile|all (default web). ${MOCK_HINT}`,
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
        "[Observe] Full doctor report: structured checks for Node, registry, Playwright browsers, Selenium drivers (dirver/), Appium server/drivers, Harmony hdc, workspace paths, and config. " +
        "USE WHEN: ada_health shows degraded status, CI setup validation, or unexplained driver failures. " +
        "PREFER ada_health for a fast pass/fail. " +
        "KEY ARGS: scope=web|mobile|all (default web).",
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
        "[Observe] List built-in ADA driver plugins currently registered (playwright, selenium, appium, harmony) with versions and capabilities. " +
        "USE WHEN: verifying which engines are available before ada_web_action / ada_invoke / ada_mobile_action. " +
        "No parameters required.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_perf_summary",
      description:
        "[Observe] In-memory latency statistics for MCP tool calls (count, avg, p50, p95, max per tool). " +
        "USE WHEN: profiling slow automation steps or regression checks. " +
        "KEY ARGS: reset=true clears samples after read.",
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
        "[Configure] Read the effective ADA agent configuration (merged default.yaml, env overrides, workspace paths). " +
        "USE WHEN: confirming headless defaults, driver dirs, risk policy paths, or install strategy before running tasks. " +
        "No parameters required.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_install_deps",
      description:
        "[Configure] Download/install automation runtimes: Playwright browsers, Selenium geckodriver/chromedriver, Appium + platform drivers, Harmony hypium/hdc. " +
        "USE WHEN: ada_health or ada_diagnostics reports missing deps; before first web/mobile E2E in a new environment. " +
        "PREFER launcher --install-deps=... on cold start; use this tool for mid-session installs. " +
        "KEY ARGS: only=all|playwright|selenium|mobile|android|ios|harmony|appium|drivers (default playwright); force=true reinstall; nativeDriversDir (default dirver/).",
      inputSchema: {
        type: "object",
        properties: {
          only: {
            type: "string",
            enum: ["all", "playwright", "selenium", "mobile", "android", "ios", "harmony", "appium", "drivers"],
            description: "Dependency bundle to install (default: playwright when omitted)"
          },
          force: { type: "boolean", description: "Reinstall even if already satisfied" },
          nativeDriversDir: {
            type: "string",
            description: "Folder for geckodriver/chromedriver binaries (default: workspace dirver/)"
          },
          geckodriverVersion: {
            type: "string",
            description: "GeckoDriver version: 0.36.0 | latest | skip"
          },
          chromedriverVersion: {
            type: "string",
            description: "ChromeDriver major: 137 | 135 | match-chrome | latest | skip"
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "ada_start_once",
      description:
        "[Configure] Run the ADA agent bootstrap flow once (equivalent to CLI start --once): credential check, optional dep install, plugin warmup. " +
        "USE WHEN: emulating full agent startup from MCP without watch mode. " +
        "NOT for browser automation steps (use ada_web_action). " +
        "KEY ARGS: localDev=true skips credential gate; skipDeps=true skips auto install check.",
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
        "[Execute-Web] High-level web UI automation with semantic commands (recommended for most web E2E). " +
        "Engines: playwright (default, bundled Chromium) or selenium (system Firefox/Chrome/Edge with profile). " +
        "USE WHEN: navigate, click, type, screenshot, tabs, scroll, upload on a web page. " +
        "PREFER over ada_execute for web-only flows (simpler schema). Use ada_invoke for raw Playwright page.* APIs. " +
        "COMMANDS: navigate, click, type, screenshot, hover, press, select, scroll, newTab, switchTab, uploadFile, dragDrop, wait, assertText, getText, back, reload, closeTab, forward, custom. " +
        `KEY ARGS: command (required), sessionId (reuse session), engine, payload (locator/url/text/headless/userDataDir/cdpEndpoint/channel). ${MOCK_HINT} ${RISK_HINT}`,
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
          monitor: monitorProperty()
        },
        required: ["command"],
        additionalProperties: false
      }
    },
    {
      name: "ada_mobile_action",
      description:
        "[Execute-Mobile] High-level mobile UI automation via Appium (Android/iOS) or Harmony stack. " +
        "USE WHEN: tap, swipe, launch/terminate app, mobile screenshot, back/home on a device or emulator. " +
        "PREFER over ada_execute for standard mobile gestures. Use ada_invoke for low-level Appium HTTP or Harmony driver RPC. " +
        "COMMANDS: click, type, swipe, assertVisible, screenshot, wait, assertText, getText, back, home, launchApp, terminateApp, custom. " +
        `KEY ARGS: platform=android|ios|harmony (required), command (required), sessionId, payload (serverUrl, capabilities, locator). ${MOCK_HINT} ${RISK_HINT}`,
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
          monitor: monitorProperty()
        },
        required: ["platform", "command"],
        additionalProperties: false
      }
    },
    {
      name: "ada_execute",
      description:
        "[Execute] Universal command envelope for web AND mobile in one schema (platform + command + payload). " +
        "USE WHEN: you need the full command enum including mobile-only (swipe, launchApp) and web-only (newTab) in a generic runner. " +
        "PREFER ada_web_action or ada_mobile_action for clearer intent and smaller schemas. " +
        `PLATFORMS: web, android, ios, harmony. ${MOCK_HINT} ${RISK_HINT}`,
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
              "home",
              "launchApp",
              "terminateApp",
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
        "[Execute-LowLevel] Direct driver RPC: Playwright method calls (web), Selenium WebDriver (web), Appium HTTP (mobile), Harmony hypium APIs. " +
        "USE WHEN: APIs not covered by semantic commands (e.g. page.evaluate, context.cookies, custom Appium endpoints, Harmony hdc). " +
        "REQUIRES riskApproved=true (high risk). " +
        "MODES: method (Playwright/Selenium method + target + args) or http (Appium WebDriver method/path/body). " +
        "KEY ARGS: platform (required), mode, target, method, args[], http{}, payload (engine/locator/capabilities). " +
        MOCK_HINT,
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
            description: "method=Playwright/Selenium API; http=Appium WebDriver HTTP 原生调用模式"
          },
          target: {
            type: "string",
            title: "target",
            description: "Playwright target: page|context|browser|locator"
          },
          method: {
            type: "string",
            title: "method",
            description: "Method name on target 驱动方法名"
          },
          args: {
            type: "array",
            title: "args",
            items: {},
            description: "JSON-serializable arguments 方法参数数组"
          },
          http: {
            type: "object",
            title: "http",
            description: "Appium HTTP request Appium HTTP 请求体",
            properties: {
              method: { type: "string", title: "method", description: "HTTP verb" },
              path: { type: "string", title: "path", description: "WebDriver path" },
              body: { title: "body", description: "Request JSON body" }
            },
            required: ["method", "path"]
          },
          payload: payloadProperty(),
          allowMock: allowMockField(),
          riskApproved: riskApprovedField(true),
          monitor: monitorProperty()
        },
        required: ["platform"],
        additionalProperties: false
      }
    },
    {
      name: "ada_run_task_file",
      description:
        "[Orchestrate] Execute a JSON task file (.tasks.json) with multiple steps, assertions, and optional monitoring — batch E2E in one call. " +
        "USE WHEN: replaying saved scenarios, regression suites, or demo.tasks.json-style workflows. " +
        "PREFER ada_batch_actions for ad-hoc inline steps without a file. " +
        "KEY ARGS: file (required, path relative to workspace or absolute), allowMock, monitor.",
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
        "[Orchestrate] Run an ordered list of semantic commands in one session without a task file. " +
        "USE WHEN: multi-step flows (login → navigate → click) with shared sessionId and optional continue-on-error. " +
        "KEY ARGS: platform, sessionId (required), actions[] ({ command, payload, timeoutMs, retry }), continueOnError / onFailure=stop|continue.",
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
            description: "If true, run remaining steps after a failure"
          },
          onFailure: {
            type: "string",
            enum: ["stop", "continue"],
            description: "stop=abort batch on first error; continue=collect errors"
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
                command: { type: "string", description: "Semantic command name" },
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
        "[Data-Web] Extract structured data from the current web page in an existing Playwright/Selenium session. " +
        "USE WHEN: scraping visible text, link lists, or HTML tables after navigation (not for assertions — use ada_assertions). " +
        "KEY ARGS: sessionId (required), mode=text|list|table, payload (selectors/locator options).",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Web session from ada_web_action navigate/click flow" },
          mode: {
            type: "string",
            enum: ["text", "list", "table"],
            description: "Extraction shape: plain text, list of items, or table rows"
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
        "[Data-Mobile] Extract text or full pageSource XML from an active mobile session (Appium/Harmony). " +
        "USE WHEN: reading on-screen text or debugging element tree. " +
        "KEY ARGS: platform=android|ios|harmony, sessionId (required), type=text|pageSource, payload.",
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
        "[Data-Mobile] Assert mobile UI state: element visible or text matches in an Appium/Harmony session. " +
        "USE WHEN: mobile test verification after ada_mobile_action. " +
        "KEY ARGS: platform, sessionId (required), type=visible|text, payload (locator, expected).",
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
      description:
        "[Session] List all active in-memory browser/device sessions (sessionId, platform, engine, timestamps). " +
        "USE WHEN: reusing sessionId for follow-up steps, debugging leaks, or before ada_close_session. " +
        "No parameters required.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_close_session",
      description:
        "[Session] Close one session by platform + sessionId and release browser/device resources. " +
        "USE WHEN: finished with a flow, switching users, or freeing memory — always close when done. " +
        "KEY ARGS: platform, sessionId (required); engine=playwright|selenium for web only.",
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
            enum: ["playwright", "selenium"],
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
        "[Session] Close every active session (web + mobile). " +
        "USE WHEN: teardown after test suite, Cursor MCP reload, or recovering from stuck browsers. " +
        "PREFER ada_close_session to close one session without disrupting others. " +
        "No parameters required.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "ada_risk_policy",
      description:
        "[Security] View or edit the allowlist for high-risk commands (invoke, custom, destructive ops). " +
        "USE WHEN: ada_invoke returns risk-policy errors, or auditing which commands bypass approval. " +
        "KEY ARGS: action=view|add|remove|reset; command (required for add/remove).",
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
