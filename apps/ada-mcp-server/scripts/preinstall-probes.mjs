#!/usr/bin/env node
/**
 * pnpm dlx / npx -y 安装本包时：preinstall 测速 registry + Playwright CDN，写入 .npmrc 与 .ada-mcp-playwright-host
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PLAYWRIGHT_HOST_CANDIDATES } from "./mirror-candidates.mjs";
import { detectBestRegistry, registryCandidateList } from "./registry-probe.mjs";
import { detectBestPlaywrightHost } from "./playwright-probe.mjs";

function installRoot() {
  const init = process.env.INIT_CWD?.trim();
  if (init && fs.existsSync(init)) {
    return init;
  }
  return process.cwd();
}

function shouldRunProbe() {
  if (process.env.ADA_MCP_SKIP_REGISTRY_PROBE === "1") {
    return false;
  }
  if (process.env.ADA_MCP_FORCE_PREINSTALL_PROBE === "1") {
    return true;
  }
  const init = (process.env.INIT_CWD || "").replace(/\\/g, "/");
  if (/[\\/]dlx[\\/]/.test(init) || init.includes("__npx")) {
    return true;
  }
  if (init) {
    try {
      if (fs.existsSync(path.join(init, "pnpm-workspace.yaml"))) {
        return false;
      }
    } catch {
      // ignore
    }
  }
  return init.length > 0;
}

async function main() {
  if (!shouldRunProbe()) {
    return;
  }
  const root = installRoot();

  const regCandidates = registryCandidateList();
  const reg = await detectBestRegistry(regCandidates);
  const npmrcPath = path.join(root, ".npmrc");
  const regLine = `registry=${reg.best}\n`;
  let npmrc = "";
  try {
    npmrc = fs.readFileSync(npmrcPath, "utf8");
  } catch {
    // new
  }
  if (!npmrc.includes(`registry=${reg.best}`)) {
    fs.writeFileSync(npmrcPath, `${npmrc}${regLine}`, "utf8");
  }
  console.error(`[ada-mcp preinstall] registry: ${reg.best}`);
  for (const { candidate, latency, speedKBps, bytesRead } of reg.probeResults) {
    if (speedKBps != null) {
      console.error(
        `[ada-mcp preinstall]   registry ${candidate} -> ${speedKBps.toFixed(0)} KB/s (${bytesRead} bytes / ${latency}ms)`
      );
    } else {
      console.error(`[ada-mcp preinstall]   registry ${candidate} -> fail`);
    }
  }

  /** 浏览器 CDN：按序测速，官方优先，选吞吐最高 */
  const pw = await detectBestPlaywrightHost([...DEFAULT_PLAYWRIGHT_HOST_CANDIDATES]);
  const hostFile = path.join(root, ".ada-mcp-playwright-host");
  fs.writeFileSync(hostFile, `${pw.best}\n`, "utf8");
  process.env.PLAYWRIGHT_DOWNLOAD_HOST = pw.best;
  console.error(`[ada-mcp preinstall] playwright CDN: ${pw.best} (wrote ${hostFile})`);
  for (const { candidate, latency, speedKBps, bytesRead } of pw.probeResults) {
    if (speedKBps != null) {
      console.error(
        `[ada-mcp preinstall]   playwright ${candidate} -> ${speedKBps.toFixed(0)} KB/s (${bytesRead} bytes / ${latency}ms)`
      );
    } else {
      console.error(`[ada-mcp preinstall]   playwright ${candidate} -> fail`);
    }
  }
}

main().catch((error) => {
  console.error("[ada-mcp preinstall] probe failed:", error);
  process.exit(0);
});
