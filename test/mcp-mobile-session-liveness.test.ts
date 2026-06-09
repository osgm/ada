import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMobileSessionProbeCommand } from "../apps/ada-mcp-server/src/mcp-mobile-session-liveness.js";

describe("mcp-mobile-session-liveness", () => {
  it("buildMobileSessionProbeCommand uses invoke http for ios", () => {
    const spec = buildMobileSessionProbeCommand("ios");
    assert.equal(spec.command, "invoke");
    assert.deepEqual(spec.payload, {
      mode: "http",
      http: { method: "GET", path: "/status" }
    });
  });

  it("buildMobileSessionProbeCommand uses custom shell for android and harmony", () => {
    for (const platform of ["android", "harmony"] as const) {
      const spec = buildMobileSessionProbeCommand(platform);
      assert.equal(spec.command, "custom");
      assert.deepEqual(spec.payload, {
        custom: { action: "shell", command: "echo ada-probe" }
      });
    }
  });
});
