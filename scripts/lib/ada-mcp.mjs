/**
 * MCP 传输层：连接 ada-mcp-server，解析工具返回
 */
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { repoRoot } from "./repo-root.mjs";
import { toolsPathEnv } from "./resolve-tools.mjs";

const MOBILE_RISK_COMMANDS = new Set(["custom", "invoke", "launchApp", "exitApp"]);
const WEB_RISK_COMMANDS = new Set(["custom", "invoke"]);

/** @param {import('@modelcontextprotocol/sdk/types.js').CallToolResult} res */
export function parseMcpToolResult(res) {
  const text = res.content?.[0]?.text;
  return text ? JSON.parse(text) : {};
}

/**
 * @param {string} label
 * @param {Record<string, unknown>} data
 * @param {{ allowBusinessCodes?: string[] }} [opts]
 */
export function assertMcpOk(label, data, opts = {}) {
  const allow = new Set(opts.allowBusinessCodes ?? ["POPUP_NOT_FOUND"]);
  if (data.ok === false) {
    throw new Error(`${label} failed:\n${JSON.stringify(data, null, 2)}`);
  }
  if (data.result?.success === false) {
    const code = data.businessCode ?? data.result?.businessCode;
    if (code && allow.has(String(code))) return data;
    throw new Error(`${label} failed:\n${JSON.stringify(data, null, 2)}`);
  }
}

export function mcpNeedsRisk(platform, command, extra = {}) {
  if (extra.riskApproved === true) return false;
  if (platform === "web") return WEB_RISK_COMMANDS.has(command);
  return MOBILE_RISK_COMMANDS.has(command);
}

/**
 * 启动并连接 ada-mcp-server（stdio）
 * @param {object} [options]
 * @param {string} [options.root] 仓库根目录
 * @param {string} [options.name] MCP 客户端名
 */
/** 脚本自建 connectMcp 句柄，供 {@link releaseMcpTransport} 在 exit() 时释放 */
let scriptOwnedMcp = null;

/**
 * 断开脚本侧 MCP 客户端（不结束 MCP Server 进程；Host 配置的 server 不受影响）
 */
export async function releaseMcpTransport() {
  const target = scriptOwnedMcp;
  scriptOwnedMcp = null;
  if (!target) {
    return;
  }
  try {
    await target.client.callTool({ name: "ada_close_all_sessions", arguments: {} });
  } catch {
    // ignore
  }
  try {
    await target.close();
  } catch {
    // ignore
  }
}

export async function connectMcp(options = {}) {
  const root = options.root ?? repoRoot;
  const cli = path.join(root, "apps", "ada-mcp-server", "src", "cli.ts");
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", cli, "--skip-install-deps"],
    cwd: root,
    env: toolsPathEnv({
      ...process.env,
      ADA_MCP_SKIP_INSTALL_DEPS: "1",
      ADA_MCP_HIDE_ADVANCED: process.env.ADA_MCP_HIDE_ADVANCED ?? "1",
      ADA_PLUGIN_DIR: path.join(root, "apps/ada-mcp-server/plugins"),
      ...(options.env ?? {})
    })
  });

  const client = new Client(
    { name: options.name ?? "ada-script", version: "0.1.0" },
    { capabilities: {} }
  );
  await client.connect(transport);

  return {
    client,
    root,
    async health() {
      return parseMcpToolResult(await client.callTool({ name: "ada_health", arguments: {} }));
    },
    async close() {
      await client.close().catch(() => undefined);
    }
  };
}

/**
 * @param {{ via?: string, transport?: string, client?: import('@modelcontextprotocol/sdk/client/index.js').Client, mcp?: { client?: import('@modelcontextprotocol/sdk/client/index.js').Client }, mcpOptions?: object }} second
 */
export async function ensureMcpClient(second = {}) {
  const client = second.client ?? second.mcp?.client;
  if (client) return { client, owned: null };
  const owned = await connectMcp(second.mcpOptions ?? {});
  scriptOwnedMcp = owned;
  return { client: owned.client, owned };
}

