import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAdaMcpToolDefinitions } from "../apps/ada-mcp-server/src/mcp-tool-definitions.ts";
import {
  buildRecoveryHint,
  getToolTier,
  MCP_TOOL_LIST_ORDER,
  shouldHideAdvancedTools
} from "../apps/ada-mcp-server/src/mcp-tool-tiers.ts";

describe("mcp-tool-catalog", () => {
  const getT3Names = (names: string[]) => names.filter((name) => getToolTier(name) === "T3");

  it("exposes all tools by default including T3", () => {
    const prevHide = process.env.ADA_MCP_HIDE_ADVANCED;
    const prevVis = process.env.ADA_MCP_TOOL_VISIBILITY;
    delete process.env.ADA_MCP_HIDE_ADVANCED;
    delete process.env.ADA_MCP_TOOL_VISIBILITY;
    try {
      assert.equal(shouldHideAdvancedTools(), false);
      const tools = buildAdaMcpToolDefinitions();
      const names = tools.map((tool) => tool.name);
      assert.equal(names.length, 25);
      for (const advanced of getT3Names(names)) {
        assert.ok(names.includes(advanced), `missing advanced tool: ${advanced}`);
      }
      assert.ok(names[0].startsWith("ada_"));
      assert.equal(names[0], "ada_health");
    } finally {
      if (prevHide === undefined) delete process.env.ADA_MCP_HIDE_ADVANCED;
      else process.env.ADA_MCP_HIDE_ADVANCED = prevHide;
      if (prevVis === undefined) delete process.env.ADA_MCP_TOOL_VISIBILITY;
      else process.env.ADA_MCP_TOOL_VISIBILITY = prevVis;
    }
  });

  it("hides T3 tools only when ADA_MCP_HIDE_ADVANCED=1", () => {
    const prev = process.env.ADA_MCP_HIDE_ADVANCED;
    process.env.ADA_MCP_HIDE_ADVANCED = "1";
    try {
      const names = buildAdaMcpToolDefinitions().map((tool) => tool.name);
      assert.equal(names.length, 22);
      for (const advanced of ["ada_execute", "ada_invoke", "ada_risk_policy"]) {
        assert.equal(names.includes(advanced), false, `T3 tool should be hidden: ${advanced}`);
      }
    } finally {
      if (prev === undefined) delete process.env.ADA_MCP_HIDE_ADVANCED;
      else process.env.ADA_MCP_HIDE_ADVANCED = prev;
    }
  });

  it("sorts tools by domain order (invoke after web_action, before mobile_action)", () => {
    const prev = process.env.ADA_MCP_HIDE_ADVANCED;
    delete process.env.ADA_MCP_HIDE_ADVANCED;
    try {
      const tools = buildAdaMcpToolDefinitions();
      const names = tools.map((tool) => tool.name);
      const expected = MCP_TOOL_LIST_ORDER.filter((name) => names.includes(name));
      assert.deepEqual(names, expected);
      const webIdx = names.indexOf("ada_web_action");
      const invokeIdx = names.indexOf("ada_invoke");
      const mobileIdx = names.indexOf("ada_mobile_action");
      assert.ok(webIdx >= 0 && invokeIdx > webIdx && invokeIdx < mobileIdx);
      for (const tool of tools) {
        assert.match(tool.description, /^\[L[0-4]/);
      }
      const invoke = tools.find((tool) => tool.name === "ada_invoke");
      assert.ok(invoke?.description.includes("Driver-level"));
      assert.ok(invoke?.description.includes("riskApproved"));
    } finally {
      if (prev === undefined) delete process.env.ADA_MCP_HIDE_ADVANCED;
      else process.env.ADA_MCP_HIDE_ADVANCED = prev;
    }
  });

  it("buildRecoveryHint guides retry before invoke", () => {
    const hint = buildRecoveryHint({
      tool: "ada_web_action",
      envelope: {
        requestId: "r1",
        sessionId: "flow-1",
        platform: "web",
        command: "click",
        payload: {}
      },
      result: { requestId: "r1", success: false, errorMessage: "element not found" },
      errorKind: "command_failed"
    });
    assert.match(hint, /ada_web_action/);
    assert.match(hint, /ada_invoke/);
  });

  it("buildRecoveryHint includes locatorUsed when available", () => {
    const hint = buildRecoveryHint({
      tool: "ada_web_action",
      envelope: {
        requestId: "r2",
        sessionId: "flow-2",
        platform: "web",
        command: "click",
        payload: {}
      },
      result: {
        requestId: "r2",
        success: false,
        errorCode: "ASSERT_TEXT_MISMATCH",
        errorMessage: "Expected text mismatch",
        data: {
          assertionDiff: {
            locatorUsed: "role:button(登录)"
          }
        }
      },
      errorKind: "command_failed"
    });
    assert.match(hint, /Current locator="role:button\(登录\)"/);
  });

  it("ada_batch_actions exposes dryRun in schema", () => {
    const tool = buildAdaMcpToolDefinitions().find((item) => item.name === "ada_batch_actions");
    assert.ok(tool, "ada_batch_actions should exist");
    const props = ((tool as { inputSchema: { properties?: Record<string, unknown> } }).inputSchema.properties ?? {});
    assert.ok("dryRun" in props, "dryRun should be part of inputSchema.properties");
    assert.match(tool!.description, /dryRun/);
  });

  it("ada_invoke includes web/android/harmony examples", () => {
    const tool = buildAdaMcpToolDefinitions().find((item) => item.name === "ada_invoke");
    assert.ok(tool);
    const examples = (tool!.inputSchema as { examples?: unknown[] }).examples ?? [];
    assert.equal(examples.length, 3);
    const platforms = examples.map((ex) => (ex as { platform: string }).platform);
    assert.deepEqual(platforms.sort(), ["android", "harmony", "web"]);
  });
});
