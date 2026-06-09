/**
 * 发布前校验：
 * - @ada-mcp/mcp-server 与 @ada-mcp/launcher 的 package.json version 必须相同
 * - PINNED_PLAYWRIGHT_VERSION 与 mcp-server dependencies.playwright 对齐
 * - launcher / mcp-server 内联 vendor 副本一致
 * - scripts/lib driver-rpc 同步副本一致
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripSyncHeader, transpileTsModule } from "../build/lib/transpile-ts-module.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const PUBLISH_PACKAGES = ["apps/ada-mcp-server/package.json", "apps/ada-mcp-launcher/package.json"];

function syncLicenseNoticeFiles() {
  for (const rel of ["apps/ada-mcp-server", "apps/ada-mcp-launcher"]) {
    for (const name of ["LICENSE", "NOTICE"]) {
      fs.copyFileSync(path.join(root, name), path.join(root, rel, name));
    }
  }
}

function checkOpenSourceLicenseMetadata() {
  for (const name of ["LICENSE", "NOTICE"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) {
      console.error(`[check-mcp-publish-versions] missing root ${name}`);
      process.exit(1);
    }
    const text = readText(name);
    if (!text.includes("Kalami") && !text.includes("卡拉米")) {
      console.error(`[check-mcp-publish-versions] ${name} must attribute Kalami (卡拉米)`);
      process.exit(1);
    }
  }

  for (const pkgRel of PUBLISH_PACKAGES) {
    const pkg = readPackageJson(pkgRel);
    if (pkg.license !== "Apache-2.0") {
      console.error(`[check-mcp-publish-versions] ${pkgRel} license must be Apache-2.0 (got: ${pkg.license ?? "(missing)"})`);
      process.exit(1);
    }
    const files = new Set(pkg.files ?? []);
    if (!files.has("LICENSE") || !files.has("NOTICE")) {
      console.error(`[check-mcp-publish-versions] ${pkgRel} files must include LICENSE and NOTICE`);
      process.exit(1);
    }
    const dir = path.dirname(pkgRel);
    for (const name of ["LICENSE", "NOTICE"]) {
      if (!fs.existsSync(path.join(root, dir, name))) {
        console.error(`[check-mcp-publish-versions] missing ${dir}/${name} (run build:npm or sync)`);
        process.exit(1);
      }
    }
  }
}

function readPackageJson(relativePath) {
  let raw = fs.readFileSync(path.join(root, relativePath), "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    console.error(`[check-mcp-publish-versions] UTF-8 BOM in ${relativePath} — remove before publish`);
    process.exit(1);
  }
  return JSON.parse(raw);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function stripVendorHeader(content) {
  const marker = "export const";
  const idx = content.indexOf(marker);
  if (idx < 0) {
    return stripSyncHeader(content);
  }
  return content.slice(idx).trim();
}

function checkVendorPair(left, right, hint) {
  const a = stripSyncHeader(readText(left));
  const b = stripSyncHeader(readText(right));
  if (a !== b) {
    console.error(`[check-mcp-publish-versions] vendor drift: ${left} != ${right}\n${hint}`);
    process.exit(1);
  }
}

function normalizePlaywrightVersion(value) {
  return String(value ?? "").replace(/^\^/, "").trim();
}

function extractPinnedFallbackLiterals(content) {
  const literals = new Set();
  const re = /PINNED_PLAYWRIGHT_VERSION\s*=\s*process\.env\.ADA_PLAYWRIGHT_VERSION\?\.trim\(\)\s*\|\|\s*"([^"]+)"/g;
  for (const match of content.matchAll(re)) {
    literals.add(match[1]);
  }
  const reConst = /PINNED_PLAYWRIGHT_VERSION\s*=\s*"([^"]+)"/g;
  for (const match of content.matchAll(reConst)) {
    literals.add(match[1]);
  }
  return [...literals];
}

function checkPlaywrightPinAlignment() {
  const serverPkg = readPackageJson("apps/ada-mcp-server/package.json");
  const canonical = normalizePlaywrightVersion(serverPkg.dependencies?.playwright);
  if (!canonical) {
    console.error("[check-mcp-publish-versions] apps/ada-mcp-server/package.json missing dependencies.playwright");
    process.exit(1);
  }

  const pinnedTs = readText("packages/install-deps/src/pinned-playwright-version.ts");
  const pinnedMatch = pinnedTs.match(/export const PINNED_PLAYWRIGHT_VERSION = "([^"]+)"/);
  const pinnedConst = pinnedMatch?.[1];
  if (!pinnedConst) {
    console.error("[check-mcp-publish-versions] packages/install-deps/src/pinned-playwright-version.ts missing export");
    process.exit(1);
  }
  if (pinnedConst !== canonical) {
    console.error(
      `[check-mcp-publish-versions] Playwright pin mismatch: pinned-playwright-version.ts=${pinnedConst} vs mcp-server package.json=${canonical}`
    );
    process.exit(1);
  }

  const probeFiles = [
    "apps/ada-mcp-launcher/registry-probe.mjs",
    "apps/ada-mcp-launcher/playwright-probe.mjs",
    "apps/ada-mcp-server/scripts/registry-probe.mjs",
    "apps/ada-mcp-server/scripts/playwright-probe.mjs"
  ];
  for (const file of probeFiles) {
    const literals = extractPinnedFallbackLiterals(readText(file));
    const mismatched = literals.filter((v) => v !== canonical);
    if (mismatched.length > 0) {
      console.error(
        `[check-mcp-publish-versions] ${file} fallback PINNED_PLAYWRIGHT_VERSION=${mismatched.join(",")} (expected ${canonical})`
      );
      process.exit(1);
    }
  }
}

function checkVendorMirrorSync() {
  checkVendorPair(
    "apps/ada-mcp-launcher/mirror-candidates.mjs",
    "apps/ada-mcp-server/scripts/mirror-candidates.mjs",
    "Run: npm run sync:download-probe"
  );
  checkVendorPair(
    "apps/ada-mcp-launcher/download-probe.mjs",
    "apps/ada-mcp-server/scripts/download-probe.mjs",
    "Run: npm run sync:download-probe"
  );
  checkVendorPair(
    "apps/ada-mcp-launcher/log-locale.mjs",
    "apps/ada-mcp-server/scripts/log-locale.mjs",
    "Run: npm run sync:log-locale"
  );
  checkVendorPair(
    "apps/ada-mcp-launcher/registry-probe.mjs",
    "apps/ada-mcp-server/scripts/registry-probe.mjs",
    "Keep launcher/scripts registry-probe.mjs in sync manually"
  );
  checkVendorPair(
    "apps/ada-mcp-launcher/playwright-probe.mjs",
    "apps/ada-mcp-server/scripts/playwright-probe.mjs",
    "Keep launcher/scripts playwright-probe.mjs in sync manually"
  );
}

function stripAdaFluentSwipeFooter(text) {
  const marker = "\n/** @param {number|string|Record<string, unknown>|null|undefined} arg */\nexport function normalizeSwipeArg";
  const idx = text.indexOf(marker);
  return idx >= 0 ? text.slice(0, idx).trimEnd() : text;
}

function checkScriptsLibSync() {
  const modules = [
    "packages/driver-rpc/src/swipe-coords.ts",
    "packages/driver-rpc/src/swipe-duration.ts",
    "packages/driver-rpc/src/fill-search-options.ts"
  ];
  for (const srcRel of modules) {
    const destRel = `scripts/lib/${path.basename(srcRel).replace(/\.ts$/, ".mjs")}`;
    const source = readText(srcRel);
    const expected = transpileTsModule(source, path.basename(srcRel));
    let actual = stripSyncHeader(readText(destRel));
    if (destRel.endsWith("swipe-duration.mjs")) {
      actual = stripAdaFluentSwipeFooter(actual);
    }
    if (expected !== actual) {
      console.error(
        `[check-mcp-publish-versions] scripts/lib drift: ${destRel}\nRun: npm run sync:scripts-lib`
      );
      process.exit(1);
    }
  }
}

syncLicenseNoticeFiles();
checkOpenSourceLicenseMetadata();

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

checkPlaywrightPinAlignment();
checkVendorMirrorSync();
checkScriptsLibSync();

console.log(
  `[check-mcp-publish-versions] ok: both @${serverVer}, Apache-2.0 (Kalami), playwright pin aligned, vendor + scripts/lib synced`
);
