#!/usr/bin/env node
/**
 * 本地验证：bootstrap tools + driver-harmony launchApp（京东鸿蒙）
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
process.env.ADA_MCP_SERVER_ENTRY = path.join(root, "apps", "ada-mcp-server", "src", "cli.ts");
process.env.ADA_MCP_SKIP_INSTALL_DEPS = "1";
process.env.ADA_HARMONY_DEVICE_SN = process.env.ADA_HARMONY_DEVICE_SN?.trim() || "2QS0224716026324";

const { runBootstrapInstallDeps } = await import("../apps/ada-agent/src/bootstrap-deps.ts");
const { runCommand } = await import("../apps/ada-mcp-server/src/executor.ts");

await runBootstrapInstallDeps(["--skip-install-deps"]);
console.error("[verify] ADA_TOOLS_DIR =", process.env.ADA_TOOLS_DIR ?? "(unset)");

const result = await runCommand({
  requestId: `harmony-jd-${Date.now()}`,
  sessionId: "harmony-jd-local",
  platform: "harmony",
  command: "launchApp",
  payload: {
    appId: "com.jd.hm.mall",
    abilityId: "EntryAbility",
    capabilities: {
      deviceSn: process.env.ADA_HARMONY_DEVICE_SN
    }
  }
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.success ? 0 : 1);
