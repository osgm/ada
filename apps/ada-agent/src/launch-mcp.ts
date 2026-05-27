import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

function isPackagedExecutable(): boolean {
  return Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
}

function packagedMcpBinary(): string {
  const dir = path.dirname(process.execPath);
  if (process.platform === "win32") {
    return path.join(dir, "ada-mcp-win.exe");
  }
  const plat = process.platform === "darwin" ? "macos" : "linux";
  return path.join(dir, `ada-mcp-${plat}`);
}

function mcpForwardArgv(): string[] {
  const mcpIndex = process.argv.indexOf("mcp");
  return mcpIndex >= 0 ? process.argv.slice(mcpIndex + 1) : [];
}

function spawnInherit(command: string, args: string[], options: { cwd?: string } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 1);
    });
  });
}

async function launchPackagedMcp(): Promise<void> {
  const bin = packagedMcpBinary();
  try {
    await fs.access(bin);
  } catch {
    throw new Error(
      `未找到 MCP 可执行文件: ${bin}（请与 ada-agent 放在同一 release 目录，或单独运行 ada-mcp）`
    );
  }
  await spawnInherit(bin, mcpForwardArgv());
}

async function launchDevMcp(): Promise<void> {
  const agentSrc =
    typeof __dirname === "string" && __dirname
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(agentSrc, "../../..");
  const cli = path.join(root, "apps", "ada-mcp-server", "src", "cli.ts");
  await spawnInherit("npx", ["tsx", cli, ...mcpForwardArgv()], { cwd: root });
}

/** pkg 产物转调同目录 ada-mcp；开发态 spawn tsx cli（避免把 mcp-server 打进 agent bundle） */
export async function launchMcp(): Promise<void> {
  if (isPackagedExecutable()) {
    await launchPackagedMcp();
    return;
  }
  await launchDevMcp();
}
