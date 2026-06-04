/**
 * Build @ada-mcp/mcp-server npm tarball contents: bundled CLI + plugin cjs.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const mcpDir = path.join(root, "apps", "ada-mcp-server");
const distDir = path.join(mcpDir, "dist");
const pluginsDir = path.join(mcpDir, "plugins");

/** CJS 打包时 polyfill import.meta.url，消除 empty-import-meta 警告 */
const CJS_IMPORT_META_BANNER = {
  js: 'var __ada_import_meta_url=require("url").pathToFileURL(__filename).href;'
};
const CJS_IMPORT_META_DEFINE = {
  "import.meta.url": "__ada_import_meta_url"
};

/** SDK + zod 打入 cli，避免 pnpm dlx 解析到无 zod/v3 的旧版 zod */
const EXTERNALS = ["playwright", "hypium-driver", "express", "jimp"];

/** 从 monorepo 源码解析 @ada/*，避免发布包依赖陈旧 dist */
const WORKSPACE_PACKAGES = {
  "@ada/agent": { root: path.join(root, "apps", "ada-agent", "src"), entry: "main" },
  "@ada/install-deps": { root: path.join(root, "packages", "install-deps", "src"), entry: "index" },
  "@ada/runtime-probe": { root: path.join(root, "packages", "runtime-probe", "src"), entry: "index" },
  "@ada/agent-core": { root: path.join(root, "packages", "agent-core", "src"), entry: "index" },
  "@ada/download-probe": { root: path.join(root, "packages", "download-probe", "src"), entry: "index" },
  "@ada/core-runtime": { root: path.join(root, "packages", "core-runtime", "src"), entry: "index" },
  "@ada/contracts": { root: path.join(root, "packages", "contracts", "src"), entry: "index" },
  "@ada/plugin-host": { root: path.join(root, "packages", "plugin-host", "src"), entry: "index" },
  "@ada/plugin-sdk": { root: path.join(root, "packages", "plugin-sdk", "src"), entry: "index" },
  "@ada/driver-rpc": { root: path.join(root, "packages", "driver-rpc", "src"), entry: "index" }
};

function adaWorkspaceSrcPlugin() {
  return {
    name: "ada-workspace-src",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@ada\// }, (args) => {
        for (const [pkg, spec] of Object.entries(WORKSPACE_PACKAGES)) {
          if (args.path === pkg) {
            return { path: path.join(spec.root, `${spec.entry}.ts`) };
          }
          if (args.path.startsWith(`${pkg}/`)) {
            const sub = args.path.slice(pkg.length + 1);
            return { path: path.join(spec.root, `${sub}.ts`) };
          }
        }
        return undefined;
      });
    }
  };
}

async function bundlePlugins() {
  await fs.mkdir(pluginsDir, { recursive: true });
  const specs = [
    { name: "driver-playwright", entry: "plugins/driver-playwright/src/index.ts", external: ["playwright"] },
    { name: "driver-android", entry: "plugins/driver-android/src/index.ts", external: [] },
    { name: "driver-ios", entry: "plugins/driver-ios/src/index.ts", external: [] },
    { name: "driver-harmony", entry: "plugins/driver-harmony/src/index.ts", external: ["hypium-driver"] }
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
      plugins: [adaWorkspaceSrcPlugin()],
      sourcemap: false,
      banner: CJS_IMPORT_META_BANNER,
      define: CJS_IMPORT_META_DEFINE
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
    plugins: [adaWorkspaceSrcPlugin()],
    sourcemap: false,
    banner: {
      js: "#!/usr/bin/env node\nif (!process.env.ADA_MCP_SERVER_ENTRY) process.env.ADA_MCP_SERVER_ENTRY = __filename;\nvar __ada_import_meta_url=require(\"url\").pathToFileURL(__filename).href;"
    },
    define: CJS_IMPORT_META_DEFINE
  });
  console.log("[build-mcp-npm] dist/cli.cjs");
}

await fs.rm(pluginsDir, { recursive: true, force: true }).catch(() => undefined);
await bundlePlugins();
await bundleCli();
console.log("[build-mcp-npm] done");
