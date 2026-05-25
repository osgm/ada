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

const EXTERNALS = [
  "playwright",
  "selenium-webdriver",
  "appium",
  "@modelcontextprotocol/sdk",
  "express",
  "jimp"
];

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
    sourcemap: false,
    banner: {
      js: "#!/usr/bin/env node"
    }
  });
  console.log("[build-mcp-npm] dist/cli.cjs");
}

await fs.rm(pluginsDir, { recursive: true, force: true }).catch(() => undefined);
await bundlePlugins();
await bundleCli();
console.log("[build-mcp-npm] done");
