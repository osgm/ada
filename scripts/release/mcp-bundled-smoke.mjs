/**
 * Smoke test for published-style bundle (dist/cli.cjs + plugins/*.cjs).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
const toolNames = tools.tools.map((tool) => tool.name);
const resources = await client.listResources();
const plugins = await client.callTool({ name: "ada_plugins", arguments: {} });
const health = await client.callTool({ name: "ada_health", arguments: {} });
await client.close();

const pluginText = plugins.content?.[0]?.text ?? "{}";
const pluginPayload = JSON.parse(pluginText);
const pluginList = Array.isArray(pluginPayload) ? pluginPayload : (pluginPayload.plugins ?? []);
const healthObj = JSON.parse(health.content?.[0]?.text ?? "{}");

const advancedExposedByDefault = ["ada_invoke", "ada_run_task_file", "ada_risk_policy"];
for (const name of advancedExposedByDefault) {
  if (!toolNames.includes(name)) {
    throw new Error(`expected T3/L3 tool exposed by default: ${name}`);
  }
}

if (pluginList.length < 4) {
  throw new Error(`expected 4 plugins, got ${pluginList.length}: ${pluginText}`);
}
if (healthObj.status !== "ok") {
  throw new Error(`health not ok: ${JSON.stringify(healthObj)}`);
}
if (!Array.isArray(healthObj.blockers)) {
  throw new Error(`health missing blockers[]: ${JSON.stringify(healthObj)}`);
}
if (!healthObj.sessionPolicy?.defaultTier) {
  throw new Error(`health missing sessionPolicy: ${JSON.stringify(healthObj)}`);
}
const routingUri = "ada://guide/routing";
const resourceUris = resources.resources.map((r) => r.uri);
if (!resourceUris.includes(routingUri)) {
  throw new Error(`expected resource ${routingUri}, got ${resourceUris.join(", ")}`);
}
if (toolNames.length < 25) {
  throw new Error(`expected 25 tools (full exposure), got ${toolNames.length}`);
}
const firstTool = tools.tools[0];
if (firstTool?.name !== "ada_health") {
  throw new Error(`expected ada_health first in domain sort, got ${firstTool?.name ?? "(none)"}`);
}
if (!firstTool?.description?.includes("L0")) {
  throw new Error(`expected L0 depth prefix on ada_health, got: ${firstTool?.description?.slice(0, 40)}`);
}
const invokeIdx = toolNames.indexOf("ada_invoke");
const webIdx = toolNames.indexOf("ada_web_action");
const mobileIdx = toolNames.indexOf("ada_mobile_action");
if (invokeIdx < 0 || webIdx < 0 || mobileIdx < 0 || !(webIdx < invokeIdx && invokeIdx < mobileIdx)) {
  throw new Error(`expected web_action < invoke < mobile_action, got indices ${webIdx}, ${invokeIdx}, ${mobileIdx}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      toolCount: toolNames.length,
      tools: toolNames,
      plugins: pluginList.map((p) => p.id),
      healthStatus: healthObj.status,
      blockerCount: healthObj.blockers.length,
      resourceCount: resourceUris.length
    },
    null,
    2
  )
);
