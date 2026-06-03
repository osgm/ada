import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSessionPolicy, healthStatusFromBlockers } from "../apps/ada-mcp-server/src/mcp-health-enrich.ts";
import { buildRecoveryPlan, classifyErrorKind, isLocatorFailure } from "../apps/ada-mcp-server/src/mcp-recovery.ts";
import { parseActionRunOptions } from "../apps/ada-mcp-server/src/mcp-action-runner.ts";

describe("mcp-p0-p1 helpers", () => {
  it("buildSessionPolicy returns defaults", () => {
    const policy = buildSessionPolicy();
    assert.equal(policy.defaultTier, "T1");
    assert.equal(policy.maxAutoRetry, 2);
    assert.equal(policy.recommendMonitorOnFailure, true);
  });

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

  it("buildRecoveryPlan orders retry before invoke", () => {
    const plan = buildRecoveryPlan({
      tool: "ada_web_action",
      envelope: {
        requestId: "r",
        sessionId: "s1",
        platform: "web",
        command: "click",
        payload: {}
      },
      errorKind: "command_failed"
    });
    assert.equal(plan[0].kind, "retry");
    assert.equal(plan.at(-1)?.tool, "ada_invoke");
  });
});
