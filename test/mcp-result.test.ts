import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  isBestEffortRequest,
  mcpTextResult,
  wrapAssertionResult,
  wrapBestEffortCommandResult,
  wrapCommandToolResult
} from "../apps/ada-mcp-server/src/mcp-result.ts";

function withEnv(name: string, value: string | undefined, fn: () => void): void {
  const prev = process.env[name];
  try {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = prev;
    }
  }
}

describe("mcp-result", () => {
  it("mcpTextResult marks assertion failures as isError", () => {
    const out = mcpTextResult({ status: "failed", type: "visible" });
    assert.equal(out.isError, true);
    const parsed = JSON.parse(out.content[0].text);
    assert.equal(parsed.ok, false);
  });

  it("wrapCommandToolResult slims large result.data by default", () => {
    const envelope: CommandEnvelope = {
      requestId: "r-slim",
      sessionId: "sess-slim",
      platform: "web",
      command: "custom",
      payload: {}
    };
    const huge = "x".repeat(5000);
    const result: CommandResult = {
      requestId: "r-slim",
      success: true,
      data: { driver: "playwright", value: huge, pageSource: huge }
    };
    withEnv("ADA_MCP_VERBOSE_RESULT", undefined, () => {
      withEnv("ADA_MCP_SLIM_RESULT", undefined, () => {
        const out = wrapCommandToolResult({ tool: "ada_web_action", envelope, result });
        const parsed = JSON.parse(out.content[0].text);
        assert.equal(parsed.resultMode, "slim");
        assert.ok(typeof parsed.resultHint === "string");
        const value = (parsed.result as CommandResult).data?.value as Record<string, unknown>;
        assert.equal(value._slim, true);
        assert.equal(value.length, 5000);
      });
    });
  });

  it("wrapCommandToolResult returns full result when ADA_MCP_VERBOSE_RESULT=1", () => {
    const envelope: CommandEnvelope = {
      requestId: "r-verbose",
      sessionId: "sess-verbose",
      platform: "web",
      command: "click",
      payload: {}
    };
    const huge = "y".repeat(3000);
    const result: CommandResult = {
      requestId: "r-verbose",
      success: true,
      data: { value: huge }
    };
    withEnv("ADA_MCP_VERBOSE_RESULT", "1", () => {
      const out = wrapCommandToolResult({ tool: "ada_web_action", envelope, result });
      const parsed = JSON.parse(out.content[0].text);
      assert.equal(parsed.resultMode, "verbose");
      assert.equal((parsed.result as CommandResult).data?.value, huge);
      assert.equal(parsed.resultHint, undefined);
    });
  });

  it("wrapCommandToolResult surfaces page context from failed result.data", () => {
    const envelope: CommandEnvelope = {
      requestId: "r-ctx",
      sessionId: "sess-ctx",
      platform: "web",
      command: "click",
      payload: { locator: { css: "#missing" } }
    };
    const result: CommandResult = {
      requestId: "r-ctx",
      success: false,
      errorCode: "LOCATOR_NOT_FOUND",
      errorMessage: "timeout waiting for locator",
      data: {
        url: "https://www.jd.com/",
        title: "京东",
        pageTextPreview: "首页 搜索 购物车",
        locatorUsed: "css:#missing"
      }
    };
    const out = wrapCommandToolResult({ tool: "ada_web_action", envelope, result });
    const parsed = JSON.parse(out.content[0].text);
    assert.equal(parsed.activeUrl, "https://www.jd.com/");
    assert.equal(parsed.pageTitle, "京东");
    assert.equal(parsed.pageTextPreview, "首页 搜索 购物车");
    assert.equal(parsed.recoverable, true);
    assert.ok(parsed.uiCandidates);
  });

  it("wrapCommandToolResult includes recoveryHint on failure", () => {
    const envelope: CommandEnvelope = {
      requestId: "r1",
      sessionId: "sess-1",
      platform: "web",
      command: "click",
      payload: {}
    };
    const result: CommandResult = {
      requestId: "r1",
      success: false,
      errorCode: "COMMAND_TIMEOUT",
      errorMessage: "timeout"
    };
    const out = wrapCommandToolResult({ tool: "ada_web_action", envelope, result });
    assert.equal(out.isError, true);
    const parsed = JSON.parse(out.content[0].text);
    assert.equal(parsed.sessionId, "sess-1");
    assert.equal(parsed.errorKind, "timeout");
    assert.ok(typeof parsed.recoveryHint === "string" && parsed.recoveryHint.length > 0);
    assert.ok(Array.isArray(parsed.recoveryPlan) && parsed.recoveryPlan.length > 0);
    assert.equal(parsed.ok, false);
  });

  it("wrapAssertionResult exposes normalized assertion diff fields", () => {
    const result: CommandResult = {
      requestId: "a1",
      success: false,
      errorCode: "ASSERT_TEXT_MISMATCH",
      errorMessage: "expected mismatch",
      data: {
        assertionDiff: {
          type: "text",
          expected: "登录",
          actual: "注册",
          locatorUsed: "role:button(登录)"
        }
      }
    };
    const out = wrapAssertionResult({
      tool: "ada_assertions",
      sessionId: "sess-1",
      platform: "web",
      type: "text",
      pass: false,
      details: {},
      result
    });
    assert.equal(out.isError, true);
    const parsed = JSON.parse(out.content[0].text);
    assert.equal(parsed.errorKind, "assertion_failed");
    assert.equal(parsed.expected, "登录");
    assert.equal(parsed.actual, "注册");
    assert.equal(parsed.locatorUsed, "role:button(登录)");
    assert.equal(parsed.assertionType, "text");
  });

  it("wrapAssertionResult keeps assertionType/locatorUsed on success payload", () => {
    const out = wrapAssertionResult({
      tool: "ada_assertions",
      sessionId: "sess-2",
      platform: "web",
      type: "visible",
      pass: true,
      details: {
        assertionType: "visible",
        locatorUsed: "role:button(登录)"
      }
    });
    const parsed = JSON.parse(out.content[0].text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.assertionType, "visible");
    assert.equal(parsed.locatorUsed, "role:button(登录)");
  });

  it("wrapBestEffortCommandResult returns ok without isError for locator miss", () => {
    const envelope: CommandEnvelope = {
      requestId: "r-be",
      sessionId: "sess-be",
      platform: "harmony",
      command: "click",
      payload: { locator: { text: "关闭" } }
    };
    const result: CommandResult = {
      requestId: "r-be",
      success: false,
      errorCode: "LOCATOR_NOT_FOUND",
      errorMessage: "element not found"
    };
    const out = wrapBestEffortCommandResult({ tool: "ada_mobile_action", envelope, result });
    assert.equal(out.isError, undefined);
    const parsed = JSON.parse(out.content[0].text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.status, "ok");
    assert.equal(parsed.businessCode, "LOCATOR_NOT_FOUND");
    assert.equal(parsed.outcome, "skipped");
  });

  it("isBestEffortRequest reads top-level and payload flag", () => {
    assert.equal(isBestEffortRequest({ bestEffort: true }), true);
    assert.equal(isBestEffortRequest({ payload: { bestEffort: true } }), true);
    assert.equal(isBestEffortRequest({}), false);
  });
});
