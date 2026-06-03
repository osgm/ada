#!/usr/bin/env node
/**
 * 用 node + tsx 预加载运行本地 ada-client 示例（等价于 tsx，但入口仍是 node）。
 * 用法：node scripts/lib/run-ada-example.mjs scripts/examples/nodejs/web/jd-e2e.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toolsPathEnv } from "./resolve-tools.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = process.argv[2];

if (!script) {
  console.error("用法: node scripts/lib/run-ada-example.mjs <示例脚本.mjs> [参数...]");
  process.exit(1);
}

const absScript = path.isAbsolute(script) ? script : path.join(root, script);
const args = ["--import", "tsx", absScript, ...process.argv.slice(3)];

const r = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  env: toolsPathEnv(process.env)
});

process.exit(r.status ?? 1);
