/**
 * MCP 端到端验证：通过 ada_web_action 执行 Web 导航与截图。
 * 默认 headless:false（可见浏览器）；启动 MCP：`npm run mcp:dev`
 * 用法：`node scripts/mcp-browser-verify.mjs` 或 `npm run test:mcp:browser`
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

/** headed 浏览器首次启动可能较慢，单次工具调用拉大超时 */
const LONG_REQ = { timeout: 360000 };

async function main() {
  const transport = new StdioClientTransport({
    command: "npm",
    args: ["run", "mcp:dev"],
    cwd: process.cwd()
  });
  const client = new Client({ name: "ada-mcp-browser-verify", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  const sessionId = `mcp-browser-${Date.now()}`;
  const navigate = await client.callTool(
    {
      name: "ada_web_action",
      arguments: {
        command: "navigate",
        sessionId,
        allowMock: true,
        payload: {
          url: "https://example.com",
          headless: false
        }
      }
    },
    CallToolResultSchema,
    LONG_REQ
  );

  const screenshot = await client.callTool(
    {
      name: "ada_web_action",
      arguments: {
        command: "screenshot",
        sessionId,
        allowMock: true,
        payload: {
          url: "https://example.com",
          headless: false
        }
      }
    },
    CallToolResultSchema,
    LONG_REQ
  );

  const health = await client.callTool({ name: "ada_health", arguments: {} }, CallToolResultSchema, LONG_REQ);

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionId,
        navigate,
        screenshot,
        healthSummary: health
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
