import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTransientCommandFailure } from "../apps/ada-mcp-server/src/mcp-action-runner.ts";

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
    assert.equal(
      isTransientCommandFailure({
        requestId: "1",
        success: false,
        errorCode: "COMMAND_TIMEOUT",
        errorMessage: "timed out"
      }),
      false
    );
  });
});
