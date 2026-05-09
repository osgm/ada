import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const LONG_REQ = { timeout: 240000 };

function parseToolText(result) {
  const text = result?.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: true, raw: text };
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: "npm",
    args: ["run", "mcp:dev"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      APPIUM_HOME: process.env.APPIUM_HOME ?? "D:\\WORKSPACE\\PLAN\\ADA\\appium",
      ANDROID_HOME: process.env.ANDROID_HOME ?? "D:\\WORK\\build\\Android\\android-sdk",
      ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT ?? "D:\\WORK\\build\\Android\\android-sdk"
    }
  });
  const client = new Client({ name: "ada-mcp-web-appium-perf", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  const webSessionId = `perf-web-${Date.now()}`;
  const appSessionId = `perf-app-${Date.now()}`;
  const results = [];

  await client.callTool({ name: "ada_perf_summary", arguments: { reset: true } }, CallToolResultSchema, LONG_REQ);

  // Web: navigate + screenshot + wait
  for (let i = 0; i < 3; i += 1) {
    const nav = await client.callTool(
      {
        name: "ada_web_action",
        arguments: {
          command: "navigate",
          sessionId: webSessionId,
          allowMock: false,
          payload: { url: "https://example.com", headless: true }
        }
      },
      CallToolResultSchema,
      LONG_REQ
    );
    results.push({ kind: "web:navigate", run: i + 1, result: parseToolText(nav) });

    const shot = await client.callTool(
      {
        name: "ada_web_action",
        arguments: {
          command: "screenshot",
          sessionId: webSessionId,
          allowMock: false,
          payload: { fullPage: false, headless: true }
        }
      },
      CallToolResultSchema,
      LONG_REQ
    );
    results.push({ kind: "web:screenshot", run: i + 1, result: parseToolText(shot) });
  }

  // Appium: probe + wait + screenshot(real)
  for (let i = 0; i < 2; i += 1) {
    const probe = await client.callTool(
      {
        name: "ada_mobile_action",
        arguments: {
          platform: "android",
          command: "swipe",
          sessionId: appSessionId,
          allowMock: false,
          payload: { probe: true }
        }
      },
      CallToolResultSchema,
      LONG_REQ
    );
    results.push({ kind: "appium:probe", run: i + 1, result: parseToolText(probe) });
  }

  const appShot = await client.callTool(
    {
      name: "ada_mobile_action",
      arguments: {
        platform: "android",
        command: "screenshot",
        sessionId: appSessionId,
        allowMock: false,
        payload: {
          real: true,
          keepSession: false,
          serverUrl: "http://127.0.0.1:4723",
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
  results.push({ kind: "appium:screenshot", run: 1, result: parseToolText(appShot) });

  const perf = await client.callTool({ name: "ada_perf_summary", arguments: {} }, CallToolResultSchema, LONG_REQ);
  const perfSummary = parseToolText(perf);

  console.log(
    JSON.stringify(
      {
        ok: true,
        webSessionId,
        appSessionId,
        perfSummary,
        results
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

