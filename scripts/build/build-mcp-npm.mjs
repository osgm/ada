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

/** CJS ??? polyfill import.meta.url,?? empty-import-meta ?? */
const CJS_IMPORT_META_BANNER = {
  js: 'var __ada_import_meta_url=require("url").pathToFileURL(__filename).href;'
};
const CJS_IMPORT_META_DEFINE = {
  "import.meta.url": "__ada_import_meta_url"
};

/** SDK + zod ?? cli,?? pnpm dlx ???? zod/v3 ??? zod */
const EXTERNALS = ["playwright", "hypium-driver", "express", "jimp"];

/** ? monorepo ???? @ada/*,????????? dist */
const WORKSPACE_PACKAGES = {
  "@ada/install-deps": { root: path.join(root, "packages", "install-deps", "src"), entry: "index" },
  "@ada/runtime-probe": { root: path.join(root, "packages", "runtime-probe", "src"), entry: "index" },
  "@ada/agent-core": { root: path.join(root, "packages", "agent-core", "src"), entry: "index" },
  "@ada/core-kernel": { root: path.join(root, "packages", "core-kernel", "src"), entry: "index" },
  "@ada/download-probe": { root: path.join(root, "packages", "download-probe", "src"), entry: "index" },
  "@ada/core-runtime": { root: path.join(root, "packages", "core-runtime", "src"), entry: "index" },
  "@ada/contracts": { root: path.join(root, "packages", "contracts", "src"), entry: "index" },
  "@ada/plugin-host": { root: path.join(root, "packages", "plugin-host", "src"), entry: "index" },
  "@ada/plugin-sdk": { root: path.join(root, "packages", "plugin-sdk", "src"), entry: "index" },
  "@ada/driver-rpc": { root: path.join(root, "packages", "driver-rpc", "src"), entry: "index" },
  "@ada/transport-http": { root: path.join(root, "packages", "transport-http", "src"), entry: "index" },
  "@ada/transport-stream": { root: path.join(root, "packages", "transport-stream", "src"), entry: "index" },
  "@ada/mobile-ui": { root: path.join(root, "packages", "mobile-ui", "src"), entry: "index" }
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

async function bundlePublishedSubpath(name, sourceFile, outputFile) {
  await fs.mkdir(distDir, { recursive: true });
  await build({
    entryPoints: [path.join(mcpDir, "src", sourceFile)],
    outfile: path.join(distDir, outputFile),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    external: EXTERNALS,
    plugins: [adaWorkspaceSrcPlugin()],
    sourcemap: false,
    banner: CJS_IMPORT_META_BANNER,
    define: CJS_IMPORT_META_DEFINE
  });
  console.log(`[build-mcp-npm] dist/${outputFile} (${name})`);
}

async function syncLicenseNoticeFiles() {
  for (const name of ["LICENSE", "NOTICE"]) {
    const src = path.join(root, name);
    await fs.copyFile(path.join(root, name), path.join(mcpDir, name));
    await fs.copyFile(src, path.join(root, "apps", "ada-mcp-launcher", name));
  }
  console.log("[build-mcp-npm] synced LICENSE + NOTICE to publish packages");
}

await fs.rm(pluginsDir, { recursive: true, force: true }).catch(() => undefined);
await bundlePlugins();
await bundleCli();
await bundlePublishedSubpath("stdio", "main.ts", "stdio.cjs");
await bundlePublishedSubpath("testing", "testing-exports.ts", "testing-exports.cjs");
await syncLicenseNoticeFiles();
console.log("[build-mcp-npm] done");
