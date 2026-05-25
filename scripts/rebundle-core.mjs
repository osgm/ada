/** Rebuild JS bundles + plugin cjs without full pkg/gui pipeline. */
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const buildDir = path.join(root, "build");
const pluginBuildDir = path.join(buildDir, "plugins");
const releasePlugins = path.join(root, "release", "plugins");

async function bundleAgent() {
  await build({
    entryPoints: [path.join(root, "apps", "ada-agent", "src", "main.ts")],
    outfile: path.join(buildDir, "ada-agent.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    banner: { js: "#!/usr/bin/env node" }
  });
}

async function bundleMcp() {
  await build({
    entryPoints: [path.join(root, "apps", "ada-mcp-server", "src", "cli.ts")],
    outfile: path.join(buildDir, "ada-mcp.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18"
  });
}

async function bundleRuntimePlugins() {
  await fs.mkdir(pluginBuildDir, { recursive: true });
  const plugins = [
    { name: "driver-playwright", external: ["playwright"] },
    { name: "driver-appium", external: [] },
    { name: "driver-selenium", external: ["selenium-webdriver"] }
  ];
  for (const p of plugins) {
    await build({
      entryPoints: [path.join(root, "plugins", p.name, "src", "index.ts")],
      outfile: path.join(pluginBuildDir, `${p.name}.cjs`),
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      external: p.external
    });
  }
}

await fs.mkdir(buildDir, { recursive: true });
await bundleAgent();
await bundleMcp();
await bundleRuntimePlugins();
await fs.mkdir(releasePlugins, { recursive: true });
await fs.cp(pluginBuildDir, releasePlugins, { recursive: true });
console.log("Rebundled:", buildDir, "->", releasePlugins);
