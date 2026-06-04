import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { rcedit } from "rcedit";

const root = process.cwd();
const buildDir = path.join(root, "build");
const releaseDir = path.join(root, "release");
const bundleFile = path.join(buildDir, "ada-agent.cjs");
const webBundleFile = path.join(buildDir, "ada-web.cjs");
const mcpBundleFile = path.join(buildDir, "ada-mcp.cjs");
const pluginBuildDir = path.join(buildDir, "plugins");
const windowsIconFile = path.join(root, "apps", "ada-gui", "src-tauri", "icons", "icon.ico");
/** 与 build-mcp-npm.mjs 一致：从 monorepo 源码解析 @ada/* */
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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: ${command} ${args.join(" ")}`));
    });
    child.on("error", reject);
  });
}

async function clearReleaseContents(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  await Promise.all(
    entries.map(async (ent) => {
      const p = path.join(dir, ent.name);
      await fs.rm(p, { recursive: true, force: true });
    })
  );
}

async function prepareDirs() {
  await fs.rm(buildDir, { recursive: true, force: true });
  await fs.mkdir(buildDir, { recursive: true });
  await fs.mkdir(releaseDir, { recursive: true });
  /** Windows 下整目录 rmdir(release) 易 EBUSY；改为清空子项 */
  await clearReleaseContents(releaseDir).catch((error) => {
    console.warn("[build-executable] release clean skipped:", error.message);
  });
}

async function bundleAgent() {
  await build({
    entryPoints: [path.join(root, "apps", "ada-agent", "src", "main.ts")],
    outfile: bundleFile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    sourcemap: false,
    banner: {
      js: "#!/usr/bin/env node"
    }
  });
}

async function bundleWeb() {
  await build({
    entryPoints: [path.join(root, "apps", "ada-agent", "src", "web-entry.ts")],
    outfile: webBundleFile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    sourcemap: false,
    banner: {
      js: "#!/usr/bin/env node"
    }
  });
}

async function bundleMcpStandalone() {
  await build({
    entryPoints: [path.join(root, "apps", "ada-mcp-server", "src", "cli.ts")],
    outfile: mcpBundleFile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    sourcemap: false,
    plugins: [adaWorkspaceSrcPlugin()]
    // 勿再加 banner shebang：cli.ts 首行已有 #!，重复会导致 pkg 解析失败与运行时 MODULE_NOT_FOUND
  });
}

async function bundleRuntimePlugins() {
  await fs.mkdir(pluginBuildDir, { recursive: true });
  await build({
    entryPoints: [path.join(root, "plugins", "driver-playwright", "src", "index.ts")],
    outfile: path.join(pluginBuildDir, "driver-playwright.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    external: ["playwright"],
    sourcemap: false
  });
  await build({
    entryPoints: [path.join(root, "plugins", "driver-android", "src", "index.ts")],
    outfile: path.join(pluginBuildDir, "driver-android.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    sourcemap: false
  });
  await build({
    entryPoints: [path.join(root, "plugins", "driver-ios", "src", "index.ts")],
    outfile: path.join(pluginBuildDir, "driver-ios.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    sourcemap: false
  });
  await build({
    entryPoints: [path.join(root, "plugins", "driver-harmony", "src", "index.ts")],
    outfile: path.join(pluginBuildDir, "driver-harmony.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    external: ["hypium-driver"],
    sourcemap: false
  });
}

async function packageBinary() {
  const pkgTargets = "node18-macos-x64,node18-linux-x64";
  const pack = async (entryFile, includeWinIcon = false) => {
    if (includeWinIcon) {
      await run("npx", [
        "pkg",
        entryFile,
        "--targets",
        "node18-win-x64",
        "--icon",
        windowsIconFile,
        "--out-path",
        releaseDir
      ]);
    } else {
      await run("npx", [
        "pkg",
        entryFile,
        "--targets",
        "node18-win-x64",
        "--out-path",
        releaseDir
      ]);
    }
    await run("npx", [
      "pkg",
      entryFile,
      "--targets",
      pkgTargets,
      "--out-path",
      releaseDir
    ]);
  };
  await pack(bundleFile, true);
  await pack(webBundleFile, true);
  await pack(mcpBundleFile, true);
}

async function copyRuntimeAssets() {
  const assetTargets = [
    ["config", "config"],
    ["tasks", "tasks"],
    [path.join("docs", "ADA-GUI-操作手册.md"), path.join("docs", "ADA-GUI-操作手册.md")],
    [path.join("build", "plugins"), "plugins"]
  ];
  for (const [from, to] of assetTargets) {
    const src = path.join(root, from);
    const dst = path.join(releaseDir, to);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.cp(src, dst, { recursive: true });
  }
  const toolsSrc = path.join(root, "tools");
  const toolsDst = path.join(releaseDir, "tools");
  try {
    await fs.access(path.join(toolsSrc, process.platform === "win32" ? "hdc.exe" : "hdc"));
    await fs.mkdir(toolsDst, { recursive: true });
    await fs.cp(toolsSrc, toolsDst, { recursive: true });
    console.log("[build-executable] copied tools/ (HarmonyOS hdc)");
  } catch {
    console.warn("[build-executable] skip tools/: hdc not found under repo tools/");
  }
}

async function copyNativeGuiBinary() {
  // Tauri 固定产出 ada-gui.exe；发布目录中仅放置 Windows 标准名 ada-gui-win.exe（不另放 release\ada-gui.exe）。
  const src = path.join(root, "apps", "ada-gui", "src-tauri", "target", "release", "ada-gui.exe");
  const dst = path.join(releaseDir, "ada-gui-win.exe");
  try {
    await fs.rm(dst, { force: true });
    await fs.copyFile(src, dst);
  } catch (error) {
    console.warn(
      `[build-executable] skip ada-gui-win.exe copy: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function normalizeWindowsArtifactNames() {
  if (process.platform !== "win32") return;
  const pairs = [
    ["ada-agent.exe", "ada-agent-win.exe"],
    ["ada-web.exe", "ada-web-win.exe"],
    ["ada-mcp.exe", "ada-mcp-win.exe"]
  ];
  for (const [srcName, dstName] of pairs) {
    const src = path.join(releaseDir, srcName);
    const dst = path.join(releaseDir, dstName);
    try {
      await fs.access(src);
    } catch {
      continue;
    }
    try {
      await fs.rm(dst, { force: true });
      await fs.rename(src, dst);
    } catch (error) {
      console.warn(
        `[build-executable] rename skipped ${srcName} -> ${dstName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function buildNativeGuiBinary() {
  if (process.env.ADA_SKIP_GUI_BUILD === "1") {
    console.warn("[build-executable] skip gui build by ADA_SKIP_GUI_BUILD=1");
    return;
  }
  await run("npm", ["run", "gui:build"]);
}

async function verifyReleaseArtifacts() {
  if (process.env.ADA_SKIP_RELEASE_VERIFY === "1") {
    console.warn("[build-executable] skip release verify by ADA_SKIP_RELEASE_VERIFY=1");
    return;
  }
  await run("node", [path.join(root, "scripts", "test", "verify-entrypoints.mjs")]);
}

async function unifyWindowsExeIcons() {
  if (process.env.ADA_SKIP_ICON_UNIFY === "1") {
    console.warn("[build-executable] skip icon unify by ADA_SKIP_ICON_UNIFY=1");
    return;
  }
  if (process.platform !== "win32") {
    return;
  }
  try {
    await fs.access(windowsIconFile);
  } catch {
    console.warn(`[build-executable] skip icon unify: icon not found at ${windowsIconFile}`);
    return;
  }

  // 注意：rcedit 修改 pkg 产物会导致二进制损坏（Pkg: Error reading from file）。
  // 这里只保留对 GUI(Tauri) 的兜底处理；pkg 产物图标仅通过 pkg --icon 注入。
  const windowsExeFiles = [path.join(releaseDir, "ada-gui-win.exe")];

  for (const exeFile of windowsExeFiles) {
    try {
      await fs.access(exeFile);
    } catch {
      continue;
    }
    try {
      await rcedit(exeFile, { icon: windowsIconFile });
      console.log(`[build-executable] icon unified: ${path.basename(exeFile)}`);
    } catch (error) {
      console.warn(
        `[build-executable] skip icon unify for ${path.basename(exeFile)}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function main() {
  await prepareDirs();
  await run("node", [path.join(root, "scripts", "build", "generate-bundled-config.mjs")]);
  await bundleAgent();
  await bundleWeb();
  await bundleMcpStandalone();
  await bundleRuntimePlugins();
  await packageBinary();
  await normalizeWindowsArtifactNames();
  await copyRuntimeAssets();
  await buildNativeGuiBinary();
  await copyNativeGuiBinary();
  await unifyWindowsExeIcons();
  await verifyReleaseArtifacts();
  console.log("Executable build completed:", releaseDir);
}

main().catch((error) => {
  console.error("[build-executable] failed:", error);
  process.exit(1);
});
