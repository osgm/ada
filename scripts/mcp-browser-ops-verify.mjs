import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const LONG_REQ = { timeout: 360000 };

async function callWebAction(client, sessionId, command, payload = {}) {
  const result = await client.callTool(
    {
      name: "ada_web_action",
      arguments: {
        command,
        sessionId,
        allowMock: false,
        payload: {
          headless: false,
          ...payload
        }
      }
    },
    CallToolResultSchema,
    LONG_REQ
  );
  return result;
}

async function main() {
  const transport = new StdioClientTransport({
    command: "npm",
    args: ["run", "mcp:dev"],
    cwd: process.cwd()
  });
  const client = new Client({ name: "ada-mcp-browser-ops-verify", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  const sessionId = `mcp-browser-ops-${Date.now()}`;
  const steps = [];
  try {
    steps.push({
      step: "navigate-example",
      result: await callWebAction(client, sessionId, "navigate", { url: "https://example.com" })
    });
    steps.push({
      step: "wait-1",
      result: await callWebAction(client, sessionId, "wait", { timeoutMs: 1200 })
    });
    steps.push({
      step: "assert-visible",
      result: await callWebAction(client, sessionId, "assertVisible", { locator: { text: "Example Domain" } })
    });
    steps.push({
      step: "get-text",
      result: await callWebAction(client, sessionId, "getText", { locator: { text: "Example Domain" } })
    });
    steps.push({
      step: "hover-link",
      result: await callWebAction(client, sessionId, "hover", { locator: { text: "More information..." } })
    });
    steps.push({
      step: "wait-2",
      result: await callWebAction(client, sessionId, "wait", { timeoutMs: 800 })
    });
    steps.push({
      step: "click-link",
      result: await callWebAction(client, sessionId, "click", { locator: { text: "More information..." } })
    });
    steps.push({
      step: "wait-3",
      result: await callWebAction(client, sessionId, "wait", { timeoutMs: 1200 })
    });
    steps.push({
      step: "scroll",
      result: await callWebAction(client, sessionId, "scroll", { deltaY: 500 })
    });
    steps.push({
      step: "press-pagedown",
      result: await callWebAction(client, sessionId, "press", { key: "PageDown" })
    });
    steps.push({
      step: "screenshot",
      result: await callWebAction(client, sessionId, "screenshot", {})
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          sessionId,
          steps
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
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
