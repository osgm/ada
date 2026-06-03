import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridge = path.join(root, "scripts/lib/ada-mcp-bridge.mjs");

function bridgeRequest(proc: ReturnType<typeof spawn>, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer | string) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg.id === body.id) {
          proc.stdout?.off("data", onData);
          resolve(msg);
          return;
        }
      }
    };
    proc.stdout?.on("data", onData);
    proc.stdin?.write(`${JSON.stringify(body)}\n`, (err) => (err ? reject(err) : undefined));
  });
}

test("ada-mcp-bridge: health + shutdown", { timeout: 120_000 }, async () => {
  const proc = spawn("npx", ["tsx", bridge], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ADA_MCP_SKIP_INSTALL_DEPS: "1",
      ADA_MCP_HIDE_ADVANCED: "1",
      ADA_REPO_ROOT: root,
      ADA_PLUGIN_DIR: path.join(root, "apps/ada-mcp-server/plugins")
    }
  });

  try {
    const health = await bridgeRequest(proc, { id: 1, op: "callTool", name: "ada_health", arguments: {} });
    assert.equal(health.ok, true);
    const data = health.data as Record<string, unknown> | undefined;
    assert.ok(data?.status || data?.result);
    const off = await bridgeRequest(proc, { id: 2, op: "shutdown" });
    assert.equal(off.ok, true);
  } finally {
    proc.kill("SIGTERM");
  }
});
