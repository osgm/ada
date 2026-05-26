/**
 * 构建 ada-mcp StdioClientTransport（dev / local / npm）。
 * Windows：dev 走 node+tsx，避免 npm run 闪 cmd。
 */
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSX_CLI = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const MCP_CLI_TS = path.join(root, "apps", "ada-mcp-server", "src", "cli.ts");

function applyLocalMobileEnv(env) {
  const androidHome = process.env.ANDROID_HOME?.trim();
  if (androidHome && fs.existsSync(androidHome)) {
    env.ANDROID_HOME = androidHome;
    env.ANDROID_SDK_ROOT = env.ANDROID_SDK_ROOT || androidHome;
  }
  for (const name of ["APPIUM_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT"]) {
    const candidate = path.join(root, name);
    if (fs.existsSync(candidate)) {
      env[name] = candidate;
      if (name === "ANDROID_HOME") {
        env.ANDROID_SDK_ROOT = candidate;
      }
    }
  }
}

/**
 * @param {{ server?: "dev"|"local"|"npm", installDeps?: string, launcherVersion?: string }} opts
 */
export function createAdaMcpTransport(opts = {}) {
  const server = opts.server ?? "local";
  const env = { ...process.env };
  env.ADA_MCP_INSTALL_DEPS = opts.installDeps ?? "skip";
  env.ADA_MCP_SKIP_INSTALL_DEPS = opts.installDeps === "skip" ? "1" : env.ADA_MCP_SKIP_INSTALL_DEPS;
  applyLocalMobileEnv(env);

  if (server === "dev") {
    if (!fs.existsSync(TSX_CLI)) {
      throw new Error(`未找到 tsx: ${TSX_CLI}\n请先在仓库根目录 npm install`);
    }
    env.ADA_MCP_SERVER_ENTRY = MCP_CLI_TS;
    return new StdioClientTransport({
      command: process.execPath,
      args: [TSX_CLI, MCP_CLI_TS],
      cwd: root,
      env
    });
  }

  if (server === "local") {
    const cli = path.join(root, "apps", "ada-mcp-server", "dist", "cli.cjs");
    if (!fs.existsSync(cli)) {
      throw new Error(`本地 bundle 不存在: ${cli}\n请先: npm run build:npm -w @ada-mcp/mcp-server`);
    }
    env.ADA_MCP_SERVER_ENTRY = cli;
    env.ADA_MCP_SKIP_INSTALL_DEPS = "1";
    return new StdioClientTransport({
      command: process.execPath,
      args: [cli],
      cwd: root,
      env
    });
  }

  const version = opts.launcherVersion ?? process.env.ADA_MCP_LAUNCHER_VERSION ?? "0.1.28";
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  return new StdioClientTransport({
    command: pnpm,
    args: ["dlx", `@ada-mcp/launcher@${version}`],
    cwd: root,
    env
  });
}

export { root as repoRoot, TSX_CLI, MCP_CLI_TS };
