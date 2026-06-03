/**
 * 检查 bundled MCP 插件是否落后于 plugins/driver-* 源码（按最新 mtime）
 * 用法：node scripts/test/verify-mcp-plugins.mjs
 * CI：失败时提示 npm run build:npm --workspace @ada-mcp/mcp-server
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const plugins = ["driver-harmony", "driver-android", "driver-ios", "driver-playwright"];

function walkNewestMtime(dir, newest = 0) {
  if (!fs.existsSync(dir)) return newest;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      newest = walkNewestMtime(p, newest);
    } else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      newest = Math.max(newest, st.mtimeMs);
    }
  }
  return newest;
}

const stale = [];
for (const id of plugins) {
  const srcDir = path.join(root, "plugins", id, "src");
  const cjs = path.join(root, "apps/ada-mcp-server/plugins", `${id}.cjs`);
  if (!fs.existsSync(cjs)) {
    stale.push(`${id}.cjs missing`);
    continue;
  }
  const srcMtime = walkNewestMtime(srcDir);
  const cjsMtime = fs.statSync(cjs).mtimeMs;
  if (srcMtime > cjsMtime + 2000) {
    stale.push(`${id}.cjs older than plugins/${id}/src`);
  }
}

if (stale.length) {
  console.error("[verify-mcp-plugins] bundled plugins out of date:\n", stale.map((s) => `  - ${s}`).join("\n"));
  console.error("\nRun: npm run build:npm --workspace @ada-mcp/mcp-server");
  process.exit(1);
}
console.log("[verify-mcp-plugins] ok");
