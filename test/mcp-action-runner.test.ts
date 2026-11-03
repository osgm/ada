import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCommandTimeout,
  isTransientCommandFailure
} from "../apps/ada-mcp-server/src/mcp-action-runner.ts";

describe("mcp-action-runner", () => {
  it("treats locator misses as transient", () => {
    assert.equal(
      isTransientCommandFailure({
        requestId: "1",
        success: false,
        errorCode: "ELEMENT_NOT_FOUND",
        errorMessage: "locator miss"
      }),
      true
    );
  });

  it("does not retry timeouts or risk denials", () => {
    assert.equal(
      isTransientCommandFailure({
        requestId: "1",
        success: false,
        errorCode: "COMMAND_TIMEOUT",
        errorMessage: "web:click timed out after 1000ms"
      }),
      false
    );
    assert.equal(
      isTransientCommandFailure({
        requestId: "1",
        success: false,
        errorCode: "MCP_ACTION_TIMEOUT",
        errorMessage: "action timeout after 1000ms"
      }),
      false
    );
    assert.equal(
      isTransientCommandFailure({
        requestId: "1",
        success: false,
        errorCode: "RISK_DENIED",
        errorMessage: "risk denied"
      }),
      false
    );
  });

  it("applyCommandTimeout writes payload.commandTimeoutMs instead of racing", () => {
    const next = applyCommandTimeout(
      {
        requestId: "r1",
        sessionId: "s1",
        platform: "web",
        command: "click",
        payload: { locator: { css: "#a" } }
      },
      12_000
    );
    assert.equal(next.payload?.commandTimeoutMs, 12_000);
    assert.deepEqual(next.payload?.locator, { css: "#a" });
  });

  it("applyCommandTimeout keeps the tighter of existing and requested timeout", () => {
    const next = applyCommandTimeout(
      {
        requestId: "r1",
        sessionId: "s1",
        platform: "web",
        command: "click",
        payload: { commandTimeoutMs: 5_000 }
      },
      20_000
    );
    assert.equal(next.payload?.commandTimeoutMs, 5_000);

    const wider = applyCommandTimeout(
      {
        requestId: "r2",
        sessionId: "s1",
        platform: "web",
        command: "click",
        payload: { commandTimeoutMs: 40_000 }
      },
      15_000
    );
    assert.equal(wider.payload?.commandTimeoutMs, 15_000);
  });

  it("applyCommandTimeout no-ops when timeoutMs is unset", () => {
    const command = {
      requestId: "r1",
      sessionId: "s1",
      platform: "web" as const,
      command: "click" as const,
      payload: { locator: { css: "#a" } }
    };
    assert.equal(applyCommandTimeout(command, 0), command);
    assert.equal(applyCommandTimeout(command), command);
  });
});
