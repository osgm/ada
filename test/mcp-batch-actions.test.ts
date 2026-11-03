import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { handleBatchActions, type BatchActionDeps } from "../apps/ada-mcp-server/src/mcp-batch-actions.ts";

function baseDeps(overrides: Partial<BatchActionDeps> = {}): BatchActionDeps {
  return {
    normalizePlatform: () => "web",
    mobilePreflight: async () => {
      throw new Error("mobilePreflight should not run for web dryRun");
    },
    ensureWebRuntimeReady: async () => {
      throw new Error("ensureWebRuntimeReady should not run on dryRun");
    },
    ensureSessionActive: async () => {
      throw new Error("ensureSessionActive should not run on dryRun");
    },
    withTiming: async (_label, fn) => fn(),
    asRecord: (value) =>
      value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {},
    normalizeCommand: (value) => String(value),
    ensureRiskAllowed: () => undefined,
    toCommandEnvelope: (input) => input as unknown as CommandEnvelope,
    allowMock: () => false,
    runCommandWithRetry: async () => {
      throw new Error("runCommandWithRetry should not run on dryRun");
    },
    assertRealResult: () => undefined,
    mcpTextResult: (data, options) => ({ data, options }),
    buildRecoveryFields: () => ({ recoveryPlan: [], recoveryHint: "" }),
    ...overrides
  };
}

describe("mcp-batch-actions", () => {
  it("dryRun skips runtime and session probes", async () => {
    const result = (await handleBatchActions(
      {
        platform: "web",
        sessionId: "s1",
        dryRun: true,
        actions: [{ command: "click", payload: { locator: { css: "#a" } } }]
      },
      baseDeps()
    )) as { data: Record<string, unknown> };

    assert.equal(result.data.mode, "dryRun");
    assert.equal(result.data.status, "ok");
  });

  it("accepts action alias and uses runCommandWithRetry when executing", async () => {
    let ran = false;
    const result = (await handleBatchActions(
      {
        platform: "web",
        sessionId: "s1",
        actions: [{ action: "click", payload: { locator: { css: "#a" } } }]
      },
      baseDeps({
        ensureWebRuntimeReady: async () => undefined,
        ensureSessionActive: async () => undefined,
        ensureWebPageReady: async () => undefined,
        runCommandWithRetry: async () => {
          ran = true;
          const result: CommandResult = { requestId: "r1", success: true, data: {} };
          return { result, attempts: 1 };
        }
      })
    )) as { data: Record<string, unknown> };

    assert.equal(ran, true);
    assert.equal(result.data.status, "ok");
    assert.equal(result.data.executed, 1);
    assert.equal(typeof result.data.budgetMs, "number");
  });

  it("stops remaining steps when batch wall budget is exhausted", async () => {
    const timeouts: number[] = [];
    const result = (await handleBatchActions(
      {
        platform: "web",
        sessionId: "s1",
        timeoutMs: 1_200,
        onFailure: "stop",
        actions: [
          { command: "wait", timeoutMs: 800 },
          { command: "click", timeoutMs: 800 },
          { command: "type", timeoutMs: 800 }
        ]
      },
      baseDeps({
        ensureWebRuntimeReady: async () => undefined,
        ensureSessionActive: async () => undefined,
        ensureWebPageReady: async () => undefined,
        runCommandWithRetry: async (_command, options) => {
          timeouts.push(options.timeoutMs ?? 0);
          await new Promise((resolve) => setTimeout(resolve, 450));
          return {
            result: { requestId: "r", success: true, data: {} },
            attempts: 1
          };
        }
      })
    )) as { data: Record<string, unknown> };

    // budget ≈ 700ms；每步睡 450ms → 第 2 步前应耗尽
    assert.ok((result.data.executed as number) < 3, `executed=${result.data.executed}`);
    const summary = result.data.summary as Record<string, unknown>;
    assert.equal(summary.budgetExhausted, true);
    assert.equal(result.data.status, "failed");
    assert.ok(timeouts.length >= 1);
    assert.ok(timeouts.every((ms) => ms > 0 && ms <= 1_200));
  });
});
