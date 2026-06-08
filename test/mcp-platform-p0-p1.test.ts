import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandResult } from "@ada/contracts";
import { slimCommandResult } from "../apps/ada-mcp-server/src/mcp-response-mode.ts";
import {
  clearWebSessionTrack,
  getWebLastUrl,
  shouldProbeWebPage,
  trackWebLastUrl
} from "../apps/ada-mcp-server/src/mcp-session-liveness.ts";

describe("mcp-response-mode structured slim", () => {
  it("preserves structured value arrays in slim mode", () => {
    const nodes = Array.from({ length: 40 }, (_, i) => ({
      ref: `n-${i}`,
      role: "menuitem",
      name: `Item ${i}`
    }));
    const result: CommandResult = {
      requestId: "r-structured",
      success: true,
      data: {
        value: nodes,
        pageSource: "x".repeat(5000)
      }
    };
    const slimmed = slimCommandResult(result);
    const data = slimmed.data as Record<string, unknown>;
    assert.ok(Array.isArray(data.value));
    assert.equal((data.value as unknown[]).length, 40);
    const pageSource = data.pageSource as Record<string, unknown>;
    assert.equal(pageSource._slim, true);
  });

  it("still slims very large structured arrays with preview", () => {
    const nodes = Array.from({ length: 120 }, (_, i) => ({ ref: `n-${i}` }));
    const result: CommandResult = {
      requestId: "r-large-array",
      success: true,
      data: { value: nodes }
    };
    const slimmed = slimCommandResult(result);
    const value = (slimmed.data as Record<string, unknown>).value as Record<string, unknown>;
    assert.equal(value._slim, true);
    assert.equal(value.length, 120);
    assert.ok(Array.isArray(value.preview));
  });
});

describe("mcp-session-liveness helpers", () => {
  it("tracks and clears last url per session", () => {
    trackWebLastUrl("s1", "https://example.com/home");
    assert.equal(getWebLastUrl("s1"), "https://example.com/home");
    clearWebSessionTrack("s1");
    assert.equal(getWebLastUrl("s1"), undefined);
  });

  it("shouldProbeWebPage skips navigate", () => {
    assert.equal(shouldProbeWebPage("navigate"), false);
    assert.equal(shouldProbeWebPage("click"), true);
  });
});
