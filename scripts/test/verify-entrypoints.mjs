import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const strict = process.argv.includes("--strict");
const ifPresent = process.argv.includes("--if-present");

function exists(p) {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? root,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
    if (opts.stdinText) {
      child.stdin?.write(opts.stdinText);
    }
    child.stdin?.end();
  });
}

function isWin() {
  return process.platform === "win32";
}

function pick(name) {
  if (isWin()) {
    return path.join(releaseDir, `${name}-win.exe`);
  }
  return path.join(releaseDir, `${name}-${process.platform === "darwin" ? "macos" : "linux"}`);
}

async function main() {
  const files = {
    agent: pick("ada-agent"),
    web: pick("ada-web"),
    mcp: pick("ada-mcp"),
    gui: path.join(releaseDir, "ada-gui-win.exe")
  };

  const missing = [];
  for (const [k, p] of Object.entries(files)) {
    if (!(await exists(p))) {
      missing.push(`${k}: ${p}`);
    }
  }
  if (missing.length > 0) {
    if (ifPresent && !strict) {
      console.log(
        JSON.stringify(
          {
            status: "skipped",
            reason: "release artifacts not built",
            hint: "run npm run build:exe then npm run test:entrypoints",
            missing
          },
          null,
          2
        )
      );
      return;
    }
    throw new Error(`release artifacts missing:\n${missing.join("\n")}`);
  }

  const health = await run(files.agent, ["core", "--action=health"], { cwd: releaseDir });
  if (health.code !== 0) {
    throw new Error(`ada-agent health failed:\n${health.stdout}\n${health.stderr}`.trim());
  }
  JSON.parse(health.stdout);

  const webHealth = await run(files.web, ["health"], { cwd: releaseDir });
  if (webHealth.code !== 0) {
    throw new Error(`ada-web health failed:\n${webHealth.stdout}\n${webHealth.stderr}`.trim());
  }
  JSON.parse(webHealth.stdout);

  const mcpInit = await run(
    files.mcp,
    [],
    {
      cwd: releaseDir,
      stdinText:
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"verify-entrypoints","version":"1.0"}}}\n'
    }
  );
  const mcpOut = `${mcpInit.stdout}\n${mcpInit.stderr}`;
  const mcpInitOk =
    /"serverInfo"\s*:\s*\{[^}]*"name"\s*:\s*"ada-mcp-server"/.test(mcpInit.stdout) ||
    /\[ADA-MCP\].*server connected/i.test(mcpOut) ||
    /\[ADA-MCP\].*ready.*stdio/i.test(mcpOut);
  if (!mcpInitOk) {
    throw new Error(`ada-mcp initialize failed:\n${mcpInit.stdout}\n${mcpInit.stderr}`.trim());
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        checks: {
          artifacts: "ok",
          agentCoreHealth: "ok",
          webHealth: "ok",
          mcpInitialize: "ok",
          guiBinaryPresent: "ok"
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[verify-entrypoints] failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
