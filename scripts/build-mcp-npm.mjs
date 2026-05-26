/**
 * Build @ada-mcp/mcp-server npm tarball contents: bundled CLI + plugin cjs.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mcpDir = path.join(root, "apps", "ada-mcp-server");
const distDir = path.join(mcpDir, "dist");
const pluginsDir = path.join(mcpDir, "plugins");

/** SDK + zod 打入 cli，避免 pnpm dlx 解析到无 zod/v3 的旧版 zod */
const EXTERNALS = ["playwright", "selenium-webdriver", "appium", "express", "jimp"];

const AGENT_SRC = path.join(root, "apps", "ada-agent", "src");

/** Bundle @ada/agent from source so npm publish is not blocked on stale/missing dist/. */
function adaAgentSrcPlugin() {
  return {
    name: "ada-agent-src",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@ada\/agent(\/.*)?$/ }, (args) => {
        const sub = args.path === "@ada/agent" ? "main" : args.path.slice("@ada/agent/".length);
        const tsPath = path.join(AGENT_SRC, `${sub}.ts`);
        return { path: tsPath };
      });
    }
  };
}

async function bundlePlugins() {
  await fs.mkdir(pluginsDir, { recursive: true });
  const specs = [
    { name: "driver-playwright", entry: "plugins/driver-playwright/src/index.ts", external: ["playwright"] },
    { name: "driver-appium", entry: "plugins/driver-appium/src/index.ts", external: [] },
    { name: "driver-selenium", entry: "plugins/driver-selenium/src/index.ts", external: ["selenium-webdriver"] }
  ];
  for (const spec of specs) {
    await build({
      entryPoints: [path.join(root, spec.entry)],
      outfile: path.join(pluginsDir, `${spec.name}.cjs`),
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      external: spec.external,
      sourcemap: false
    });
    console.log(`[build-mcp-npm] plugin ${spec.name}.cjs`);
  }
}

async function bundleCli() {
  await fs.mkdir(distDir, { recursive: true });
  await build({
    entryPoints: [path.join(mcpDir, "src", "cli.ts")],
    outfile: path.join(distDir, "cli.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    external: EXTERNALS,
    plugins: [adaAgentSrcPlugin()],
    sourcemap: false,
    banner: {
      js: "#!/usr/bin/env node\nif (!process.env.ADA_MCP_SERVER_ENTRY) process.env.ADA_MCP_SERVER_ENTRY = __filename;"
    }
  });
  console.log("[build-mcp-npm] dist/cli.cjs");
}

await fs.rm(pluginsDir, { recursive: true, force: true }).catch(() => undefined);
await bundlePlugins();
await bundleCli();
console.log("[build-mcp-npm] done");
