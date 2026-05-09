/**
 * MCP App（Appium）验证：
 * 1）探活：`payload.probe: true`（无需设备/Appium Server）
 * 2）可选真实链路：`--real` 时对 Android 发起 `screenshot`+`real:true`（需本机 Appium + 设备/模拟器）
 *
 * 用法：
 *   node scripts/mcp-app-verify.mjs
 *   node scripts/mcp-app-verify.mjs --real
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const LONG_REQ = { timeout: 120000 };

function parseArgs() {
  return process.argv.includes("--real");
}

async function main() {
  const tryReal = parseArgs();
  const transport = new StdioClientTransport({
    command: "npm",
    args: ["run", "mcp:dev"],
    cwd: process.cwd()
  });
  const client = new Client({ name: "ada-mcp-app-verify", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  const list = await client.listTools(undefined, LONG_REQ);
  const toolNames = list.tools.map((t) => t.name);
  const hasMobile = toolNames.includes("ada_mobile_action");

  const health = await client.callTool({ name: "ada_health", arguments: {} }, CallToolResultSchema, LONG_REQ);

  const probeAndroid = await client.callTool(
    {
      name: "ada_mobile_action",
      arguments: {
        platform: "android",
        command: "swipe",
        sessionId: `mcp-app-probe-${Date.now()}`,
        allowMock: true,
        payload: { probe: true }
      }
    },
    CallToolResultSchema,
    LONG_REQ
  );

  let realScreenshot = null;
  if (tryReal) {
    realScreenshot = await client.callTool(
      {
        name: "ada_mobile_action",
        arguments: {
          platform: "android",
          command: "screenshot",
          sessionId: `mcp-app-real-${Date.now()}`,
          allowMock: true,
          payload: {
            real: true,
            serverUrl: process.env.ADA_APPIUM_URL ?? "http://127.0.0.1:4723",
            capabilities: {
              platformName: "Android",
              "appium:automationName": "UiAutomator2",
              "appium:deviceName": "Android"
            }
          }
        }
      },
      CallToolResultSchema,
      LONG_REQ
    );
  }

  const executeEnvelope = await client.callTool(
    {
      name: "ada_execute",
      arguments: {
        platform: "android",
        command: "swipe",
        sessionId: `mcp-exec-probe-${Date.now()}`,
        allowMock: true,
        payload: { probe: true }
      }
    },
    CallToolResultSchema,
    LONG_REQ
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        hasMobileTool: hasMobile,
        toolCount: toolNames.length,
        toolsIncludeMobile: hasMobile,
        health,
        mobileProbeAndroid: probeAndroid,
        adaExecuteAndroidProbe: executeEnvelope,
        realScreenshotAttempted: tryReal,
        realScreenshot
      },
      null,
      2
    )
  );

  await client.close();
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
