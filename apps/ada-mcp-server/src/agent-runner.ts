import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveWorkspaceRoot } from "./config.js";

interface CliAttempt {
  cmd: string;
  args: string[];
  cwd: string;
  shell?: boolean;
}

function buildAgentCliAttempts(root: string): CliAttempt[] {
  const out: CliAttempt[] = [];
  if (process.env.ADA_AGENT_EXE) {
    out.push({ cmd: process.env.ADA_AGENT_EXE, args: [], cwd: root });
  }
  const exe = process.execPath;
  const base = path.basename(exe).toLowerCase();
  if (base.includes("ada-agent")) {
    out.push({ cmd: exe, args: [], cwd: root });
  }
  const dir = path.dirname(exe);
  for (const name of [
    "ada-agent.exe",
    "ada-agent-win.exe",
    "ada-agent-macos",
    "ada-agent-linux",
    "ada-agent"
  ]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      out.push({ cmd: p, args: [], cwd: root });
    }
  }
  const agentMain = path.join(root, "apps", "ada-agent", "src", "main.ts");
  if (fs.existsSync(agentMain)) {
    out.push({
      cmd: "npx",
      args: ["tsx", agentMain],
      cwd: root,
      shell: process.platform === "win32"
    });
  }
  return dedupeAttempts(out);
}

function dedupeAttempts(list: CliAttempt[]): CliAttempt[] {
  const seen = new Set<string>();
  const next: CliAttempt[] = [];
  for (const item of list) {
    const key = `${item.cmd}\t${item.args.join("\t")}\t${item.shell ? "1" : "0"}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(item);
  }
  return next;
}

async function spawnAgentJson(attempt: CliAttempt, command: "health" | "doctor"): Promise<unknown> {
  const fullArgs = [...attempt.args, command];
  return new Promise((resolve, reject) => {
    const child = spawn(attempt.cmd, fullArgs, {
      cwd: attempt.cwd,
      shell: attempt.shell === true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `agent ${command} exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`invalid json from agent ${command}: ${stdout}`));
      }
    });
  });
}

export async function runAgentJsonCommand(command: "health" | "doctor"): Promise<unknown> {
  const root = await resolveWorkspaceRoot(process.cwd());
  const attempts = buildAgentCliAttempts(root);
  if (attempts.length === 0) {
    throw new Error("Cannot locate ADA Agent CLI for health/doctor (set ADA_AGENT_EXE or install dev workspace).");
  }
  let lastError: unknown;
  for (const att of attempts) {
    try {
      return await spawnAgentJson(att, command);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
