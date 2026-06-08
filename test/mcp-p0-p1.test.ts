import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyErrorKind,
  healthStatusFromBlockers,
  isLocatorFailure,
  parseActionRunOptions
} from "@ada-mcp/mcp-server/testing";

describe("mcp-p0-p1 helpers", () => {
  it("healthStatusFromBlockers marks errors as degraded", () => {
    assert.equal(healthStatusFromBlockers([]), "ok");
    assert.equal(
      healthStatusFromBlockers([
        { id: "x", severity: "error", message: "m", fixTool: "ada_install_deps" }
      ]),
      "degraded"
    );
  });

  it("parseActionRunOptions reads retry fields", () => {
    const opts = parseActionRunOptions({ retry: 2, retryDelayMs: 100, timeoutMs: 5000 });
    assert.equal(opts.retry, 2);
    assert.equal(opts.retryDelayMs, 100);
    assert.equal(opts.timeoutMs, 5000);
  });

  it("classifyErrorKind maps locator failures", () => {
    const kind = classifyErrorKind(
      { requestId: "r", success: false, errorCode: "LOCATOR_NOT_FOUND", errorMessage: "click requires locator" },
      "web"
    );
    assert.equal(kind, "command_failed");
    assert.equal(
      isLocatorFailure({
        requestId: "r",
        success: false,
        errorCode: "LOCATOR_NOT_FOUND",
        errorMessage: "element not found"
      }),
      true
    );
  });
});
