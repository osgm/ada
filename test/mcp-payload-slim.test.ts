import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandResult } from "@ada/contracts";
import {
  resolveRecoveryFields,
  slimBatchStepResults,
  slimInstallDepsLogs,
  slimTaskFileResults
} from "@ada-mcp/mcp-server/testing";

describe("mcp-payload-slim", () => {
  it("slimInstallDepsLogs keeps tail and error lines", () => {
    const logs = Array.from({ length: 50 }, (_, i) => (i === 12 ? "ERROR: mirror failed" : `line-${i}`));
    const slim = slimInstallDepsLogs(logs, false);
    assert.equal(slim.logMode, "slim");
    assert.equal(slim.logLines, 50);
    assert.equal(slim.logs, undefined);
    assert.ok(slim.logTail && slim.logTail.length > 0);
    assert.ok(slim.logErrorLines?.some((line) => line.includes("ERROR")));
  });

  it("slimBatchStepResults keeps failed step and stepOutcomes", () => {
    const ok: CommandResult = { requestId: "1", success: true };
    const bad: CommandResult = { requestId: "2", success: false, errorCode: "LOCATOR_NOT_FOUND" };
    const slim = slimBatchStepResults(
      [
        { index: 0, command: "click", attempts: 1, result: ok },
        { index: 1, command: "type", attempts: 2, result: bad }
      ],
      false
    );
    assert.ok(slim.stepOutcomes && slim.stepOutcomes.length === 2);
    assert.equal(slim.failedStep?.index, 1);
    assert.equal(slim.results, undefined);
  });

  it("slimTaskFileResults keeps failed step summary", () => {
    const slim = slimTaskFileResults(
      [
        { requestId: "a", success: true },
        { requestId: "b", success: false, errorCode: "COMMAND_FAILED" }
      ],
      false
    );
    assert.equal(slim.failedStep?.index, 1);
    assert.ok(slim.stepOutcomes);
    assert.equal(slim.results, undefined);
  });

  it("resolveRecoveryFields omits recoveryHint in slim mode", () => {
    const prev = process.env.ADA_MCP_VERBOSE_RESULT;
    delete process.env.ADA_MCP_VERBOSE_RESULT;
    try {
      const fields = resolveRecoveryFields({
        tool: "ada_web_action",
        errorKind: "command_failed",
        sessionId: "s1",
        platform: "web"
      });
      assert.ok(Array.isArray(fields.recoveryPlan) && fields.recoveryPlan.length > 0);
      assert.equal(fields.recoveryHint, undefined);
    } finally {
      if (prev === undefined) delete process.env.ADA_MCP_VERBOSE_RESULT;
      else process.env.ADA_MCP_VERBOSE_RESULT = prev;
    }
  });
});
