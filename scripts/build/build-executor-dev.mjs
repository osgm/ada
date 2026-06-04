/**
 * 将 executor 打成单文件 CJS，供 plain node 示例脚本使用（无需 tsx）。
 * 输出：scripts/lib/ada-executor.cjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = path.join(root, "scripts/lib/ada-executor.cjs");

const WORKSPACE_PACKAGES = {
  "@ada/core-kernel": { root: path.join(root, "packages/core-kernel/src"), entry: "index" },
  "@ada/contracts": { root: path.join(root, "packages/contracts/src"), entry: "index" },
  "@ada/driver-rpc": { root: path.join(root, "packages/driver-rpc/src"), entry: "index" },
  "@ada/plugin-host": { root: path.join(root, "packages/plugin-host/src"), entry: "index" },
  "@ada/plugin-sdk": { root: path.join(root, "packages/plugin-sdk/src"), entry: "index" },
  "@ada/install-deps": { root: path.join(root, "packages/install-deps/src"), entry: "index" },
  "@ada/runtime-probe": { root: path.join(root, "packages/runtime-probe/src"), entry: "index" }
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

await build({
  entryPoints: [path.join(root, "apps/ada-mcp-server/src/executor.ts")],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["playwright", "hypium-driver"],
  plugins: [adaWorkspaceSrcPlugin()],
  sourcemap: false
});

console.log("[build-executor-dev] →", out);
