import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAdaMcpToolDefinitions } from "@ada-mcp/mcp-server/testing";
import {
  buildRecoveryHint,
  getToolTier,
  MCP_TOOL_LIST_ORDER,
  shouldHideAdvancedTools
} from "@ada-mcp/mcp-server/testing";

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
      assert.equal(names.length, 23);
      for (const advanced of ["ada_invoke", "ada_risk_policy"]) {
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
      const webRecipeIdx = names.indexOf("ada_web_recipe");
      const invokeIdx = names.indexOf("ada_invoke");
      const mobileIdx = names.indexOf("ada_mobile_action");
      assert.ok(webIdx >= 0 && webRecipeIdx > webIdx && invokeIdx > webRecipeIdx && invokeIdx < mobileIdx);
      for (const tool of tools) {
        assert.match(tool.description, /^\[L[0-4]/);
      }
      const invoke = tools.find((tool) => tool.name === "ada_invoke");
      assert.ok(invoke?.description.includes("riskApproved"));
      assert.ok(invoke?.description.includes("[L3-driver]"));
    } finally {
      if (prev === undefined) delete process.env.ADA_MCP_HIDE_ADVANCED;
      else process.env.ADA_MCP_HIDE_ADVANCED = prev;
    }
  });

  it("buildRecoveryHint guides observe before invoke", () => {
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
    assert.match(hint, /ada_extract/);
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

  it("compact descriptions are shorter and anchor policy on ada_health", () => {
    const prev = process.env.ADA_MCP_DESC_MODE;
    delete process.env.ADA_MCP_DESC_MODE;
    try {
      const compact = buildAdaMcpToolDefinitions();
      process.env.ADA_MCP_DESC_MODE = "advanced";
      const advanced = buildAdaMcpToolDefinitions();
      const compactTotal = compact.reduce((n, t) => n + t.description.length, 0);
      const advancedTotal = advanced.reduce((n, t) => n + t.description.length, 0);
      assert.ok(compactTotal < advancedTotal, `compact ${compactTotal} should be < advanced ${advancedTotal}`);
      const health = compact.find((t) => t.name === "ada_health");
      const invoke = compact.find((t) => t.name === "ada_invoke");
      assert.ok(health?.description.includes("START ada_health"));
      assert.ok(health?.description.includes("ada://guide/routing"));
      assert.ok(health?.description.includes("Policy:"));
      assert.ok(!invoke?.description.includes("Policy:"));
      assert.ok(!invoke?.description.includes("Primary semantic entry"));
    } finally {
      if (prev === undefined) delete process.env.ADA_MCP_DESC_MODE;
      else process.env.ADA_MCP_DESC_MODE = prev;
    }
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
