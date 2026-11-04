import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendArtifactTimeline,
  isArtifactsEnabled,
  resolveArtifactRoot
} from "../apps/ada-mcp-server/src/mcp-artifacts.ts";
import {
  clearAllSessionLeases,
  clearSessionLease,
  listSessionLeases,
  touchSessionLease
} from "../apps/ada-mcp-server/src/mcp-session-lease.ts";
import { handleSessions } from "../apps/ada-mcp-server/src/mcp-admin.ts";

test("isArtifactsEnabled defaults off; env or args turns on", () => {
  const prev = process.env.ADA_MCP_ARTIFACTS;
  delete process.env.ADA_MCP_ARTIFACTS;
  try {
    assert.equal(isArtifactsEnabled({}), false);
    assert.equal(isArtifactsEnabled({ artifacts: true }), true);
    process.env.ADA_MCP_ARTIFACTS = "1";
    assert.equal(isArtifactsEnabled({}), true);
    assert.equal(isArtifactsEnabled({ artifacts: false }), false);
  } finally {
    if (prev === undefined) delete process.env.ADA_MCP_ARTIFACTS;
    else process.env.ADA_MCP_ARTIFACTS = prev;
  }
});

test("appendArtifactTimeline writes jsonl when enabled", () => {
  const prevArt = process.env.ADA_MCP_ARTIFACTS;
  const prevDir = process.env.ADA_MCP_ARTIFACT_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ada-art-"));
  process.env.ADA_MCP_ARTIFACTS = "1";
  process.env.ADA_MCP_ARTIFACT_DIR = dir;
  try {
    const out = appendArtifactTimeline({
      tool: "ada_web_action",
      sessionId: "s1",
      command: "click",
      success: true,
      summary: "ok"
    });
    assert.equal(out.enabled, true);
    if (!out.enabled) return;
    assert.ok(fs.existsSync(out.file));
    const text = fs.readFileSync(out.file, "utf8");
    assert.match(text, /ada_web_action/);
    assert.ok(resolveArtifactRoot().startsWith(dir) || resolveArtifactRoot() === path.resolve(dir));
  } finally {
    if (prevArt === undefined) delete process.env.ADA_MCP_ARTIFACTS;
    else process.env.ADA_MCP_ARTIFACTS = prevArt;
    if (prevDir === undefined) delete process.env.ADA_MCP_ARTIFACT_DIR;
    else process.env.ADA_MCP_ARTIFACT_DIR = prevDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("session leases track activity and clear", () => {
  clearAllSessionLeases();
  touchSessionLease({ platform: "web", sessionId: "lease-1", tool: "ada_web_action", command: "click" });
  const listed = listSessionLeases();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.sessionId, "lease-1");
  assert.ok(listed[0]!.ageMs >= 0);
  clearSessionLease("web", "lease-1");
  assert.equal(listSessionLeases().length, 0);
});

test("handleSessions exposes leases array", () => {
  clearAllSessionLeases();
  touchSessionLease({ platform: "web", sessionId: "vis", source: "test" });
  const out = handleSessions({
    listActiveSessions: () => [{ platform: "web", sessionId: "vis", engine: "playwright" }],
    mcpTextResult: (data) => data
  }) as { leases: Array<{ sessionId: string }> };
  assert.ok(Array.isArray(out.leases));
  assert.equal(out.leases.some((l) => l.sessionId === "vis"), true);
  clearAllSessionLeases();
});
