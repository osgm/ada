import assert from "node:assert/strict";

import { describe, it } from "node:test";

import type { CommandResult } from "@ada/contracts";

import { slimCommandResult } from "@ada-mcp/mcp-server/testing";

import {

  clearWebPageProbeCache,

  clearWebSessionTrack,

  ensureWebPageReady,

  getWebLastUrl,

  trackWebLastUrl

} from "@ada-mcp/mcp-server/testing";



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



  it("slims deeply nested viewTree objects at max depth", () => {

    let node: Record<string, unknown> = { role: "a" };

    for (let i = 0; i < 12; i += 1) {

      node = { role: `n-${i}`, children: [node] };

    }

    const result: CommandResult = {

      requestId: "r-deep-tree",

      success: true,

      data: { value: { tree: [node], flat: [], url: "https://example.com" } }

    };

    const slimmed = slimCommandResult(result);

    const serialized = JSON.stringify((slimmed.data as Record<string, unknown>).value);

    assert.match(serialized, /max_depth/);

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

  it("ensureWebPageReady reuses probe within TTL", async () => {

    const prev = process.env.ADA_WEB_PAGE_PROBE_TTL_MS;

    process.env.ADA_WEB_PAGE_PROBE_TTL_MS = "5000";

    clearWebPageProbeCache("probe-cache-session");

    let probes = 0;

    const deps = {

      runCommand: async () => {

        probes += 1;

        return {

          requestId: "probe",

          success: true,

          data: { value: { url: "https://example.com/page", blank: false } }

        };

      },

      toCommandEnvelope: (input: Record<string, unknown>) => input as never,

      allowMock: false

    };

    try {

      await ensureWebPageReady("probe-cache-session", "click", deps);

      await ensureWebPageReady("probe-cache-session", "click", deps);

      assert.equal(probes, 1);

    } finally {

      clearWebPageProbeCache("probe-cache-session");

      if (prev === undefined) delete process.env.ADA_WEB_PAGE_PROBE_TTL_MS;

      else process.env.ADA_WEB_PAGE_PROBE_TTL_MS = prev;

    }

  });



  it("tracks and clears last url per session", () => {

    trackWebLastUrl("s1", "https://example.com/home");

    assert.equal(getWebLastUrl("s1"), "https://example.com/home");

    clearWebSessionTrack("s1");

    assert.equal(getWebLastUrl("s1"), undefined);

  });

});


