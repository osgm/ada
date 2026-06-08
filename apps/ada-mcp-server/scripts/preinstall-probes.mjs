#!/usr/bin/env node
/**
 * pnpm dlx / npx -y 安装本包时：preinstall 测速 registry + Playwright CDN，写入 .npmrc 与 .ada-mcp-playwright-host
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_NPM_REGISTRY_CANDIDATES,
  DEFAULT_PLAYWRIGHT_HOST_CANDIDATES
} from "./mirror-candidates.mjs";
import { isSkipPreinstallProbeEnv } from "./probe-env.mjs";
import { detectBestRegistry, registryCandidateList, resolveForcedRegistryUrl } from "./registry-probe.mjs";
import { detectBestPlaywrightHost } from "./playwright-probe.mjs";

function installRoot() {
  const init = process.env.INIT_CWD?.trim();
  if (init && fs.existsSync(init)) {
    return init;
  }
  return process.cwd();
}

function shouldRunProbe() {
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

function writeRegistryChoice(root, registry, note) {
  const npmrcPath = path.join(root, ".npmrc");
  const regLine = `registry=${registry}\n`;
  let npmrc = "";
  try {
    npmrc = fs.readFileSync(npmrcPath, "utf8");
  } catch {
    // new
  }
  if (!npmrc.includes(`registry=${registry}`)) {
    fs.writeFileSync(npmrcPath, `${npmrc}${regLine}`, "utf8");
  }
  console.error(`[ada-mcp preinstall] registry: ${registry}${note ? ` (${note})` : ""}`);
}

function writePlaywrightChoice(root, host, note) {
  const hostFile = path.join(root, ".ada-mcp-playwright-host");
  fs.writeFileSync(hostFile, `${host}\n`, "utf8");
  process.env.PLAYWRIGHT_DOWNLOAD_HOST = host;
  console.error(`[ada-mcp preinstall] playwright CDN: ${host}${note ? ` (${note})` : ""} (wrote ${hostFile})`);
}

function allProbesFailed(probeResults) {
  return probeResults.length > 0 && probeResults.every((row) => row.speedKBps == null);
}

function writeFallbackProbeFiles(root, reason) {
  const registry = DEFAULT_NPM_REGISTRY_CANDIDATES[0];
  const host = DEFAULT_PLAYWRIGHT_HOST_CANDIDATES[0];
  console.error(`[ada-mcp preinstall] WARN: probe failed (${reason}); using fallback mirrors`);
  writeRegistryChoice(root, registry, "fallback after probe error");
  writePlaywrightChoice(root, host, "fallback after probe error");
}

async function main() {
  if (!shouldRunProbe() || isSkipPreinstallProbeEnv()) {
    if (isSkipPreinstallProbeEnv()) {
      console.error(
        "[ada-mcp preinstall] skip probe (ADA_MCP_FAST_START / ADA_MCP_SKIP_PREINSTALL_PROBE / ADA_MCP_SKIP_REGISTRY_PROBE)"
      );
    }
    return;
  }
  const root = installRoot();

  const forcedReg = resolveForcedRegistryUrl();
  const reg = forcedReg
    ? { best: forcedReg, probeResults: [] }
    : await detectBestRegistry(registryCandidateList());
  if (!forcedReg && allProbesFailed(reg.probeResults)) {
    reg.best = DEFAULT_NPM_REGISTRY_CANDIDATES[0];
    console.error("[ada-mcp preinstall] WARN: all registry probes failed; using first candidate");
  }
  writeRegistryChoice(root, reg.best, forcedReg ? "forced ADA_MCP_REGISTRY" : undefined);
  for (const { candidate, latency, speedKBps, bytesRead } of reg.probeResults) {
    if (speedKBps != null) {
      console.error(
        `[ada-mcp preinstall]   registry ${candidate} -> ${speedKBps.toFixed(0)} KB/s (${bytesRead} bytes / ${latency}ms)`
      );
    } else {
      console.error(`[ada-mcp preinstall]   registry ${candidate} -> fail`);
    }
  }

  /** 浏览器 CDN：并行测速，选吞吐最高 */
  const pw = await detectBestPlaywrightHost([...DEFAULT_PLAYWRIGHT_HOST_CANDIDATES]);
  if (allProbesFailed(pw.probeResults)) {
    pw.best = DEFAULT_PLAYWRIGHT_HOST_CANDIDATES[0];
    console.error("[ada-mcp preinstall] WARN: all playwright CDN probes failed; using first candidate");
  }
  writePlaywrightChoice(root, pw.best);
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
  try {
    writeFallbackProbeFiles(installRoot(), error?.message ?? String(error));
  } catch (fallbackError) {
    console.error("[ada-mcp preinstall] probe failed and fallback write failed:", fallbackError);
  }
  process.exit(0);
});
