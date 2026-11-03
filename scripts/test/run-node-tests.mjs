#!/usr/bin/env node
/**
 * Run test/*.test.ts via `node --test` (aggregated report, all files execute).
 * Usage: node scripts/test/run-node-tests.mjs unit|mcp
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const testDir = path.join(repoRoot, "test");

const MCP_UNIT_FILES = new Set([
  "normalize-command.test.ts",
  "mcp-normalize.test.ts",
  "mcp-result.test.ts",
  "mcp-tool-catalog.test.ts",
  "mcp-p0-p1.test.ts",
  "mcp-platform-p0-p1.test.ts",
  "mcp-action-ledger.test.ts",
  "mcp-action-runner.test.ts",
  "mcp-admin-cleanup.test.ts",
  "mcp-batch-actions.test.ts",
  "mcp-payload-slim.test.ts",
  "mcp-payload-clip.test.ts",
  "mcp-locator-cache.test.ts",
  "shared-runtime.test.ts",
  "session-serialize.test.ts",
  "session-command-class.test.ts",
  "inbound-command.test.ts",
  "command-timeout.test.ts",
  "web-navigation-timeout.test.ts",
  "session-release-policy.test.ts",
  "mcp-released-sessions.test.ts",
  "web-interaction-recipe.test.ts",
  "web-fill-search-e2e.test.ts",
  "view-tree-e2e.test.ts"
]);

const BRIDGE_FILE = "ada-mcp-bridge.test.ts";

const mode = process.argv[2];
if (mode !== "unit" && mode !== "mcp") {
  console.error("Usage: node scripts/test/run-node-tests.mjs unit|mcp");
  process.exit(2);
}

const allTests = readdirSync(testDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort();

const selected =
  mode === "unit"
    ? allTests.filter((name) => !MCP_UNIT_FILES.has(name) && name !== BRIDGE_FILE)
    : allTests.filter((name) => MCP_UNIT_FILES.has(name));

if (selected.length === 0) {
  console.error(`No test files selected for mode=${mode}`);
  process.exit(1);
}

const testPaths = selected.map((name) => path.join("test", name));
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...testPaths], {
  cwd: repoRoot,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
