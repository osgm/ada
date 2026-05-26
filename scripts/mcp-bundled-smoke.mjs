/**
 * Smoke test for published-style bundle (dist/cli.cjs + plugins/*.cjs).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "apps", "ada-mcp-server", "dist", "cli.cjs");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cli],
  cwd: root,
  env: {
    ...process.env,
    ADA_MCP_SERVER_ENTRY: cli,
    ADA_MCP_INSTALL_DEPS: "skip"
  }
});

const client = new Client({ name: "ada-mcp-bundled-smoke", version: "0.1.0" }, { capabilities: {} });
await client.connect(transport);
const tools = await client.listTools();
const plugins = await client.callTool({ name: "ada_plugins", arguments: {} });
const health = await client.callTool({ name: "ada_health", arguments: {} });
await client.close();

const pluginText = plugins.content?.[0]?.text ?? "[]";
const pluginList = JSON.parse(pluginText);
const healthObj = JSON.parse(health.content?.[0]?.text ?? "{}");

if (pluginList.length < 3) {
  throw new Error(`expected 3 plugins, got ${pluginList.length}: ${pluginText}`);
}
if (healthObj.status !== "ok") {
  throw new Error(`health not ok: ${JSON.stringify(healthObj)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      toolCount: tools.tools.length,
      plugins: pluginList.map((p) => p.id),
      healthStatus: healthObj.status
    },
    null,
    2
  )
);
