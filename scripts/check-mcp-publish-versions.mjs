/**
 * 发布前校验：@ada-mcp/mcp-server 与 @ada-mcp/launcher 的 package.json version 必须相同。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function readPackageJson(relativePath) {
  let raw = fs.readFileSync(path.join(root, relativePath), "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    console.error(`[check-mcp-publish-versions] UTF-8 BOM in ${relativePath} — remove before publish`);
    process.exit(1);
  }
  return JSON.parse(raw);
}

const serverPkg = readPackageJson("apps/ada-mcp-server/package.json");
const launcherPkg = readPackageJson("apps/ada-mcp-launcher/package.json");

const serverVer = String(serverPkg.version ?? "");
const launcherVer = String(launcherPkg.version ?? "");

if (!serverVer || !launcherVer) {
  console.error("[check-mcp-publish-versions] missing version in package.json");
  process.exit(1);
}

if (serverVer !== launcherVer) {
  console.error(
    `[check-mcp-publish-versions] version mismatch: @ada-mcp/mcp-server@${serverVer} vs @ada-mcp/launcher@${launcherVer}`
  );
  console.error("发布前请将两包 package.json 的 version 改为相同值。");
  process.exit(1);
}

console.log(`[check-mcp-publish-versions] ok: both @${serverVer}`);
