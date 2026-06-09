/**
 * Fail when monorepo shared sources changed but bundled MCP artifacts or scripts/lib copies are stale.
 * Run after build:npm in CI, or before commit when only driver-rpc / agent-core changed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SLACK_MS = 2000;

const plugins = ["driver-harmony", "driver-android", "driver-ios", "driver-playwright"];

const sharedSourceDirs = [
  path.join(root, "packages", "driver-rpc", "src"),
  path.join(root, "packages", "mobile-ui", "src")
];

const scriptsLibPairs = [
  {
    src: path.join(root, "packages", "driver-rpc", "src", "swipe-coords.ts"),
    dest: path.join(root, "scripts", "lib", "swipe-coords.mjs")
  },
  {
    src: path.join(root, "packages", "driver-rpc", "src", "swipe-duration.ts"),
    dest: path.join(root, "scripts", "lib", "swipe-duration.mjs")
  },
  {
    src: path.join(root, "packages", "driver-rpc", "src", "fill-search-options.ts"),
    dest: path.join(root, "scripts", "lib", "fill-search-options.mjs")
  }
];

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

function newestMtime(paths) {
  return paths.reduce((max, p) => Math.max(max, walkNewestMtime(p)), 0);
}

function isOlderArtifact(artifactPath, sourceMtime) {
  if (!fs.existsSync(artifactPath)) return `${artifactPath} missing`;
  if (sourceMtime > fs.statSync(artifactPath).mtimeMs + SLACK_MS) {
    return `${path.relative(root, artifactPath)} older than shared driver-rpc/mobile-ui sources`;
  }
  return null;
}

const sharedMtime = newestMtime(sharedSourceDirs);
const agentCoreMtime = newestMtime([path.join(root, "packages", "agent-core", "src")]);
const stale = [];

for (const id of plugins) {
  const srcDir = path.join(root, "plugins", id, "src");
  const cjs = path.join(root, "apps", "ada-mcp-server", "plugins", `${id}.cjs`);
  const pluginMtime = Math.max(sharedMtime, walkNewestMtime(srcDir));
  const reason = isOlderArtifact(cjs, pluginMtime);
  if (reason) stale.push(reason);
}

const cli = path.join(root, "apps", "ada-mcp-server", "dist", "cli.cjs");
const cliSourceMtime = Math.max(sharedMtime, agentCoreMtime, walkNewestMtime(path.join(root, "apps", "ada-mcp-server", "src")));
const cliReason = isOlderArtifact(cli, cliSourceMtime);
if (cliReason) stale.push(cliReason);

for (const pair of scriptsLibPairs) {
  if (!fs.existsSync(pair.dest)) {
    stale.push(`${path.relative(root, pair.dest)} missing (run npm run sync:scripts-lib)`);
    continue;
  }
  if (fs.statSync(pair.src).mtimeMs > fs.statSync(pair.dest).mtimeMs + SLACK_MS) {
    stale.push(
      `${path.relative(root, pair.dest)} older than ${path.relative(root, pair.src)} (run npm run sync:scripts-lib)`
    );
  }
}

if (stale.length) {
  console.error("[verify-driver-rpc-bundle-sync] stale bundled/synced artifacts:\n", stale.map((s) => `  - ${s}`).join("\n"));
  console.error("\nRun: npm run build:npm --workspace @ada-mcp/mcp-server && npm run sync:scripts-lib");
  process.exit(1);
}

console.log("[verify-driver-rpc-bundle-sync] ok");
