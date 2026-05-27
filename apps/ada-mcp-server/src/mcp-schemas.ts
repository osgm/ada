/** Shared JSON Schema fragments for MCP tool inputSchema (title + description for AI clients) */

function field(
  type: string,
  title: string,
  description: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return { type, title, description, ...extra };
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
        "Inside payload: override web engine 覆盖 Web 引擎。playwright | selenium.",
        { enum: ["playwright", "selenium"] }
      ),
      browserName: field("string", "browserName", "Selenium: firefox | chrome | MicrosoftEdge"),
      browserBinary: field("string", "browserBinary", "Selenium: path to browser executable 浏览器可执行文件路径"),
      profile: field("string", "profile", "Selenium: profile or user-data-dir 用户配置目录（保留登录态）"),
      seleniumServerUrl: field("string", "seleniumServerUrl", "Selenium Grid / remote server URL"),
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
        description: "Appium WebDriver HTTP { method, path, body }",
        properties: {
          method: field("string", "method", "HTTP verb GET|POST|…"),
          path: field("string", "path", "WebDriver path e.g. /session/.../element"),
          body: {}
        },
        required: ["method", "path"]
      },
      locator: field(
        "object",
        "locator",
        "Element locator 元素定位: { strategy: css|xpath|text|role|..., value } or Playwright locator options"
      ),
      options: { type: "object", title: "options", description: "Extra driver options", additionalProperties: true },
      custom: field("object", "custom", "Legacy Appium HTTP block or custom action body"),
      browser: field("string", "browser", "Playwright browser", { enum: ["chromium", "firefox", "webkit"] }),
      headless: field("boolean", "headless", "Headless browser 无头模式"),
      userDataDir: field("string", "userDataDir", "Persistent profile dir 持久化用户目录（Cookie/登录）"),
      cdpEndpoint: field(
        "string",
        "cdpEndpoint",
        "Attach via CDP 附着已开浏览器，如 http://127.0.0.1:9222 (alias browserURL)"
      ),
      browserURL: field("string", "browserURL", "Alias of cdpEndpoint"),
      executablePath: field("string", "executablePath", "Browser binary path 浏览器路径"),
      browserPath: field("string", "browserPath", "Alias of executablePath"),
      channel: field("string", "channel", "Playwright channel: chrome | msedge | chrome-beta | msedge-beta"),
      storageStatePath: field("string", "storageStatePath", "Playwright auth storage JSON path"),
      real: field("boolean", "real", "Force real execution 强制真实驱动"),
      serverUrl: field("string", "serverUrl", "Appium server URL e.g. http://127.0.0.1:4723"),
      capabilities: field("object", "capabilities", "Appium capabilities 能力项 app/deviceName/platformName"),
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
    enum: ["playwright", "selenium"]
  });
}

export const WEB_ENGINE_DESCRIPTION =
  "Web automation backend Web 自动化引擎。playwright=default bundled Chromium 默认内置浏览器; selenium=system Firefox/Chrome/Edge 本机浏览器+驱动.";

export function sessionIdField(context: "web" | "mobile" | "any"): Record<string, unknown> {
  const hint =
    context === "web"
      ? "Reuse web session from prior ada_web_action 复用已有浏览器会话；省略则按 payload 新建"
      : context === "mobile"
        ? "Reuse Appium/Harmony session 复用移动会话"
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
  "home",
  "launchApp",
  "terminateApp",
  "custom"
] as const;

export function mobileCommandField(): Record<string, unknown> {
  return field("string", "command", MOBILE_COMMAND_DESCRIPTION, { enum: [...MOBILE_COMMAND_ENUM] });
}

export const MOBILE_COMMAND_DESCRIPTION =
  "Required mobile action 必填移动语义命令。click|type|swipe; launchApp|terminateApp; screenshot; back|home; assertText|getText|assertVisible|wait; custom=扩展.";
