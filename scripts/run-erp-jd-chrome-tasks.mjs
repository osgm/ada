#!/usr/bin/env node
/**
 * 运行 tasks/erp-jd-chrome.tasks.json（与 ada-mcp 同一套 Playwright 驱动，无需 pip install playwright）
 *
 * 用法（在仓库根目录）：
 *   node scripts/run-erp-jd-chrome-tasks.mjs
 *   node scripts/run-erp-jd-chrome-tasks.mjs --no-close
 *   npm run run:erp-jd-chrome
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TASK_FILE = path.join(REPO_ROOT, "tasks", "erp-jd-chrome.tasks.json");
const SESSION_ID = "erp-chrome-session";
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

const argv = process.argv.slice(2);
const noClose = argv.includes("--no-close");
const requireReal = !argv.includes("--no-require-real");
const extraArgs = argv.filter((a) => !a.startsWith("--"));

const childEnv = {
  ...process.env,
  ADA_MCP_SERVER_ENTRY: path.join(REPO_ROOT, "apps", "ada-mcp-server", "src", "cli.ts")
};

function runTsx(tsxArgs) {
  if (!existsSync(TSX_CLI)) {
    console.error("[run-erp] 未找到 tsx，请先在仓库根目录执行: npm install");
    process.exit(1);
  }
  const spawnArgs = [TSX_CLI, ...tsxArgs];
  let result = spawnSync("node", spawnArgs, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: childEnv,
    shell: false,
    windowsHide: true
  });
  if (result.error?.code === "EINVAL" && process.platform === "win32") {
    const comspec = process.env.ComSpec || "cmd.exe";
    const argLine = ["node", ...spawnArgs]
      .map((p) => `"${String(p).replace(/"/g, '""')}"`)
      .join(" ");
    result = spawnSync(comspec, ["/d", "/s", "/c", argLine], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: childEnv,
      shell: false,
      windowsHide: true
    });
  }
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  return result.status ?? 1;
}

console.log("[run-erp] repo:", REPO_ROOT);
console.log("[run-erp] task:", TASK_FILE);
console.log("[run-erp] 使用 ada-agent（同 ada-mcp 驱动栈），无需 Python playwright\n");

const runArgs = [
  "apps/ada-agent/src/main.ts",
  "run",
  `--file=${TASK_FILE}`,
  ...extraArgs
];
if (requireReal) {
  runArgs.push("--require-real");
}

const code = runTsx(runArgs);
if (code !== 0) {
  process.exit(code);
}

if (noClose) {
  console.log("\n[run-erp] --no-close：浏览器仍打开，sessionId:", SESSION_ID);
  process.exit(0);
}

console.log("\n[run-erp] 关闭浏览器会话…");
const closeCode = runTsx(["scripts/close-web-sessions.ts"]);
process.exit(closeCode === 0 ? 0 : closeCode);
