import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "npm",
    args: ["run", "mcp:dev"],
    cwd: process.cwd()
  });
  const client = new Client({ name: "ada-mcp-smoke", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  const tools = await client.listTools();
  const health = await client.callTool({ name: "ada_health", arguments: {} });
  const plugins = await client.callTool({ name: "ada_plugins", arguments: {} });
  const webAction = await client.callTool({
    name: "ada_web_action",
    arguments: {
      command: "click",
      sessionId: "mcp-smoke-web",
      allowMock: true,
      payload: {
        url: "https://example.com",
        locator: { text: "More information" }
      }
    }
  });
  const mobileAction = await client.callTool({
    name: "ada_mobile_action",
    arguments: {
      platform: "android",
      command: "swipe",
      sessionId: "mcp-smoke-mobile",
      allowMock: true,
      payload: {
        probe: true
      }
    }
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        toolCount: tools.tools.length,
        health,
        plugins,
        webAction,
        mobileAction
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
