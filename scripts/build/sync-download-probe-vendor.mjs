/**
 * 将 packages/download-probe/dist 同步到 launcher / mcp-server 内联脚本（发布零依赖）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const distDir = path.join(root, "packages", "download-probe", "dist");

const targets = [
  path.join(root, "apps", "ada-mcp-launcher", "download-probe.mjs"),
  path.join(root, "apps", "ada-mcp-server", "scripts", "download-probe.mjs"),
  path.join(root, "apps", "ada-mcp-launcher", "mirror-candidates.mjs"),
  path.join(root, "apps", "ada-mcp-server", "scripts", "mirror-candidates.mjs")
];

const headerProbe = `/**
 * 内联 @ada/download-probe（零 npm 依赖；与 packages/download-probe 保持同步）
 * 同步：node ../../scripts/build/sync-download-probe-vendor.mjs
 */

`;

const headerMirror = `/**
 * 内联 @ada/download-probe 镜像候选（零 npm 依赖）
 * 同步：node ../../scripts/build/sync-download-probe-vendor.mjs
 */

`;

async function main() {
  const probeSrc = await fs.readFile(path.join(distDir, "download-probe.js"), "utf8");
  const mirrorSrc = await fs.readFile(path.join(distDir, "mirror-candidates.js"), "utf8");
  let mirrorBody = mirrorSrc.replace(/\/\/# sourceMappingURL=.*\n?/g, "");
  const probeBody = probeSrc
    .replace(/\/\/# sourceMappingURL=.*\n?/g, "")
    .replace(
      /import \{ probeLogLine, useEnglishAdaLogs \} from "\.\/log-locale\.js";/,
      'import { depsLogLine as probeLogLine, useEnglishAdaLogs } from "./log-locale.mjs";'
    );

  await fs.writeFile(targets[0], headerProbe + probeBody, "utf8");
  await fs.writeFile(targets[1], headerProbe + probeBody, "utf8");
  await fs.writeFile(targets[2], headerMirror + mirrorBody, "utf8");
  await fs.writeFile(targets[3], headerMirror + mirrorBody, "utf8");
  console.log("[sync-download-probe-vendor] updated:", targets.map((t) => path.relative(root, t)).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
