import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clipMcpPayloadForCorrectness } from "../apps/ada-mcp-server/src/mcp-payload-clip.ts";

describe("mcp-payload-clip", () => {
  it("keeps recoveryHint and summary when clipping bulky fields", () => {
    const bulky = "x".repeat(8_000);
    const clipped = clipMcpPayloadForCorrectness(
      {
        status: "failed",
        ok: false,
        summary: "failed at click",
        recoveryHint: "retry with locator",
        suggestedNextTool: "ada_extract",
        sessionId: "s1",
        platform: "web",
        result: { requestId: "r1", success: false, errorCode: "ELEMENT_NOT_FOUND", data: { pageSource: bulky } },
        uiCandidates: { note: bulky },
        resultHint: "verbose hint"
      },
      3_000
    );
    assert.equal(clipped.payloadClipped, true);
    assert.equal(clipped.recoveryHint, "retry with locator");
    assert.equal(clipped.summary, "failed at click");
    assert.equal(clipped.suggestedNextTool, "ada_extract");
    assert.equal(clipped.sessionId, "s1");
    assert.ok(!("uiCandidates" in clipped) || clipped.uiCandidates === undefined);
  });

  it("no-ops when under the limit", () => {
    const payload = { status: "ok", summary: "click ok", sessionId: "s1" };
    assert.equal(clipMcpPayloadForCorrectness(payload, 12_000), payload);
  });
});
