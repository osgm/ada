/** Shared JSON Schema fragments for MCP tool inputSchema (title + description for AI clients) */

function field(
  type: string,
  title: string,
  description: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return { type, title, description, ...extra };
}

export function locatorField(): Record<string, unknown> {
  return {
    type: "object",
    title: "locator",
    description:
      "Element locator 元素定位。Use strategy+value for mobile, or Playwright-style keys for web.",
    oneOf: [
      {
        type: "object",
        title: "strategy_locator",
        description: "Mobile / generic strategy locator",
        properties: {
          strategy: field("string", "strategy", "css | xpath | text | accessibility id | uiautomator", {
            enum: ["css", "xpath", "text", "id", "name", "class", "uiautomator", "accessibility id"]
          }),
          value: field("string", "value", "Locator value / selector string")
        },
        required: ["strategy", "value"],
        additionalProperties: false
      },
      {
        type: "object",
        title: "playwright_locator",
        description: "Playwright locator options",
        properties: {
          role: field("string", "role", "ARIA role e.g. button, textbox"),
          name: field("string", "name", "Accessible name"),
          text: field("string", "text", "Visible text match"),
          css: field("string", "css", "CSS selector"),
          xpath: field("string", "xpath", "XPath expression"),
          testId: field("string", "testId", "data-testid value")
        },
        additionalProperties: false
      },
      {
        type: "string",
        title: "selector_string",
        description: "Shorthand CSS/XPath selector string"
      }
    ]
  };
}

export function batchCommandField(): Record<string, unknown> {
  return field("string", "command", "Semantic command for this batch step", {
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
      "exitApp",
      "custom"
    ]
  });
}

/** Nested payload object schema (fields inside payload.*) */
export function invokePayloadSchema(): Record<string, unknown> {
  return {
    type: "object",
    title: "payload",
    description:
      "Command-specific options 命令参数体。Common keys 常用键: url (navigate), locator/selector (click/type), text, headless, userDataDir/profile, cdpEndpoint, channel, serverUrl, capabilities (mobile).",
    properties: {
      engine: field(
        "string",
        "engine",
        "Inside payload: override web engine 覆盖 Web 引擎。playwright.",
        { enum: ["playwright"] }
      ),
      browserName: field("string", "browserName", "Local browser name for web plugin 本地浏览器名称"),
      browserBinary: field("string", "browserBinary", "Browser executable path 浏览器可执行文件路径"),
      profile: field("string", "profile", "Browser profile or user-data-dir 用户配置目录（保留登录态）"),
      mode: field("string", "mode", "invoke only: method | http", { enum: ["method", "http"] }),
      target: field(
        "string",
        "target",
        "Playwright object: page | context | browser | playwright | locator"
      ),
      method: field("string", "method", "Driver method name for ada_invoke"),
      args: field("array", "args", "JSON-serializable method arguments", { items: {} }),
      http: {
        type: "object",
        title: "http",
        description: "Driver adapter HTTP { method, path, body }",
        properties: {
          method: field("string", "method", "HTTP verb GET|POST|…"),
          path: field("string", "path", "WebDriver path e.g. /session/.../element"),
          body: {}
        },
        required: ["method", "path"]
      },
      locator: locatorField(),
      options: { type: "object", title: "options", description: "Extra driver options", additionalProperties: true },
      custom: field("object", "custom", "Adapter custom action body"),
      browser: field("string", "browser", "Playwright browser", { enum: ["chromium", "firefox", "webkit"] }),
      headless: field(
        "boolean",
        "headless",
        "Headless browser 无头模式；默认 false（有头可见）。仅 true 或 ADA_PLAYWRIGHT_HEADLESS=true 时无头"
      ),
      bringToFront: field(
        "boolean",
        "bringToFront",
        "Bring browser window to front when headed 有头时将窗口置前；默认 true"
      ),
      userDataDir: field("string", "userDataDir", "Persistent profile dir 持久化用户目录（Cookie/登录）"),
      cdpEndpoint: field(
        "string",
        "cdpEndpoint",
        "CDP URL or port 调试地址，如 http://127.0.0.1:9222 或 9222 (alias browserURL)"
      ),
      cdpAutoLaunch: field(
        "boolean",
        "cdpAutoLaunch",
        "Auto-start browser with remote debugging when CDP unreachable 端口不可达时自动拉起浏览器"
      ),
      cdpPort: field("number", "cdpPort", "CDP port when cdpEndpoint omitted 仅指定端口（Chrome 默认 9222，Firefox 9223）"),
      cdpLaunchArgs: field(
        "array",
        "cdpLaunchArgs",
        "Extra browser CLI args for cdpAutoLaunch 自动拉起时附加参数"
      ),
      browserURL: field("string", "browserURL", "Alias of cdpEndpoint"),
      executablePath: field("string", "executablePath", "Browser binary path 浏览器路径"),
      browserPath: field("string", "browserPath", "Alias of executablePath"),
      channel: field("string", "channel", "Playwright channel: chrome | msedge | chrome-beta | msedge-beta"),
      storageStatePath: field("string", "storageStatePath", "Playwright auth storage JSON path"),
      real: field("boolean", "real", "Force real execution 强制真实驱动"),
      serverUrl: field("string", "serverUrl", "Driver endpoint URL 连接地址"),
      capabilities: field("object", "capabilities", "Driver capabilities 能力项"),
      keepSession: field("boolean", "keepSession", "Keep session after step 保持会话（多步默认 true）"),
      url: field("string", "url", "Target URL for navigate 导航地址"),
      text: field("string", "text", "Input or expected text 输入或期望文本"),
      selector: field("string", "selector", "CSS/XPath selector when locator omitted")
    },
    additionalProperties: true
  };
}

/** Top-level `payload` property on tools (some UIs only show this wrapper description) */
export function payloadProperty(): Record<string, unknown> {
  return invokePayloadSchema();
}

export function monitorSchema(): Record<string, unknown> {
  return {
    type: "object",
    title: "monitor",
    description:
      "Optional step monitor 步骤监控/截图: enabled, outputDir, onFailureOnly, nonBlocking, maxWidth/maxHeight.",
    properties: {
      enabled: field("boolean", "enabled", "Turn on capture 启用截图/监控"),
      outputDir: field("string", "outputDir", "Artifact output directory 产物目录"),
      maxWidth: field("number", "maxWidth", "Max screenshot width 最大宽度"),
      maxHeight: field("number", "maxHeight", "Max screenshot height 最大高度"),
      keepAspectRatio: field("boolean", "keepAspectRatio", "Preserve aspect ratio 保持宽高比"),
      onFailureOnly: field("boolean", "onFailureOnly", "Capture only on failure 仅失败时截图"),
      groupBySession: field("boolean", "groupBySession", "Group artifacts by sessionId 按会话分目录"),
      nonBlocking: field("boolean", "nonBlocking", "Async capture 异步截图不阻塞命令")
    },
    additionalProperties: false
  };
}

export function monitorProperty(): Record<string, unknown> {
  return monitorSchema();
}

export function retryActionFields(): Record<string, unknown> {
  return {
    retry: field("number", "retry", "Auto-retry count on transient failure (default 0)", { minimum: 0 }),
    retryDelayMs: field("number", "retryDelayMs", "Delay between retries in ms (default 500)", { minimum: 0 }),
    timeoutMs: field("number", "timeoutMs", "Per-attempt timeout in ms (0=use driver default)", { minimum: 0 })
  };
}

export function bestEffortField(): Record<string, unknown> {
  return field(
    "boolean",
    "bestEffort",
    "When true, locator-not-found returns ok with businessCode LOCATOR_NOT_FOUND (no MCP isError). " +
      "Use for optional UI (e.g. try-close popup). Prefer ada_*_dismiss_popups for dismiss flows."
  );
}

export function dismissTimeoutField(): Record<string, unknown> {
  return field(
    "number",
    "timeoutMs",
    "Dismiss scan timeout in ms (default 10000). No popup found → businessCode POPUP_NOT_FOUND, still ok."
  );
}

export const WEB_COMMAND_ENUM = [
  "click",
  "type",
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
  "custom"
] as const;

export function webCommandField(): Record<string, unknown> {
  return field("string", "command", WEB_COMMAND_DESCRIPTION, { enum: [...WEB_COMMAND_ENUM] });
}

export const WEB_COMMAND_DESCRIPTION =
  "Required semantic web action 必填 Web 语义命令。navigate=打开 URL; click/type=点击/输入; screenshot=截图; newTab|switchTab|closeTab=标签页; wait=等待; assertText|getText|assertVisible=断言/读取; scroll|hover|press|select|uploadFile|dragDrop=交互; back|reload|forward=历史; custom=扩展.";

export function webEngineField(): Record<string, unknown> {
  return field("string", "engine", WEB_ENGINE_DESCRIPTION, {
    enum: ["playwright"]
  });
}

export const WEB_ENGINE_DESCRIPTION =
  "Web automation backend Web 自动化引擎。playwright=default bundled Chromium 默认内置浏览器.";

export function sessionIdField(context: "web" | "mobile" | "any"): Record<string, unknown> {
  const hint =
    context === "web"
      ? "Reuse web session from prior ada_web_action 复用已有浏览器会话；省略则按 payload 新建"
      : context === "mobile"
        ? "Reuse mobile driver session 复用移动会话"
        : "Reuse session from prior action 复用会话 ID";
  return field("string", "sessionId", hint);
}

export function requestIdField(): Record<string, unknown> {
  return field("string", "requestId", "Optional trace/idempotency id 可选追踪或幂等 ID");
}

export function allowMockField(): Record<string, unknown> {
  return field(
    "boolean",
    "allowMock",
    "Allow simulated results 允许模拟结果（默认 false 严格真实执行）"
  );
}

export function riskApprovedField(required = false): Record<string, unknown> {
  return field(
    "boolean",
    "riskApproved",
    (required ? "Required. " : "") +
      "Approve high-risk execution 确认高风险操作（invoke/custom 等）"
  );
}

export function platformMobileField(): Record<string, unknown> {
  return field("string", "platform", "Mobile platform 移动平台: android | ios | harmony", {
    enum: ["android", "ios", "harmony"]
  });
}

export function platformAnyField(): Record<string, unknown> {
  return field("string", "platform", "Target platform 平台: web | android | ios | harmony", {
    enum: ["web", "android", "ios", "harmony"]
  });
}

export const MOBILE_COMMAND_ENUM = [
  "click",
  "type",
  "swipe",
  "assertVisible",
  "screenshot",
  "wait",
  "assertText",
  "getText",
  "back",
  "pressHome",
  "home",
  "launchApp",
  "exitApp",
  "recipe",
  "custom"
] as const;

export function mobileCommandField(): Record<string, unknown> {
  return field("string", "command", MOBILE_COMMAND_DESCRIPTION, { enum: [...MOBILE_COMMAND_ENUM] });
}

export const MOBILE_COMMAND_DESCRIPTION =
  "Required mobile action 必填移动语义命令。click|type(fill 别名)|swipe; launchApp|exitApp; pressHome(系统 Home，home 为别名); recipe|ada_mobile_recipe; screenshot; back; assertText|getText|assertVisible|wait; custom=扩展.";
