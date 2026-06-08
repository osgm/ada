import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandResult } from "@ada/contracts";
import {
  assertActionAllowed,
  buildLocatorActionKey,
  buildPathActionKey,
  buildWebActionLedgerKey,
  clearActionLedger,
  guardMobileCommandIfNeeded,
  guardWebAction,
  guardWebCommandIfNeeded,
  readActionLedgerConfig,
  recordAction,
  recordMobileCommandIfNeeded,
  recordWebAction,
  recordWebCommandIfNeeded
} from "@ada-mcp/mcp-server/testing";

describe("mcp-action-ledger", () => {
  it("readActionLedgerConfig respects env overrides", () => {
    const keys = [
      "ADA_WEB_ACTION_LEDGER_MAX_CONSECUTIVE",
      "ADA_WEB_ACTION_LEDGER_MAX_WINDOW",
      "ADA_WEB_ACTION_LEDGER_WINDOW_MS"
    ] as const;
    const prev: Record<string, string | undefined> = {};
    for (const key of keys) prev[key] = process.env[key];
    process.env.ADA_WEB_ACTION_LEDGER_MAX_CONSECUTIVE = "7";
    process.env.ADA_WEB_ACTION_LEDGER_MAX_WINDOW = "9";
    process.env.ADA_WEB_ACTION_LEDGER_WINDOW_MS = "120000";
    try {
      const cfg = readActionLedgerConfig();
      assert.equal(cfg.maxConsecutiveRepeat, 7);
      assert.equal(cfg.maxWindowCount, 9);
      assert.equal(cfg.windowMs, 120_000);
    } finally {
      for (const key of keys) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    }
  });

  it("blocks consecutive toggle-like repeats after threshold", () => {
    const sessionId = "ledger-path-1";
    clearActionLedger(sessionId);
    const key = buildPathActionKey(["A", "B"], "clickPath");
    recordAction(sessionId, key);
    recordAction(sessionId, key);
    recordAction(sessionId, key);
    assert.throws(() => assertActionAllowed(sessionId, key), /ACTION_TOGGLE_LOOP/);
    clearActionLedger(sessionId);
  });

  it("opens circuit after repeated attempts in window", () => {
    const sessionId = "ledger-path-2";
    clearActionLedger(sessionId);
    const key = buildPathActionKey(["X", "Y"], "click");
    for (let i = 0; i < 5; i += 1) {
      recordAction(sessionId, key);
    }
    assert.throws(() => assertActionAllowed(sessionId, key), /ACTION_CIRCUIT_OPEN/);
    clearActionLedger(sessionId);
  });

  it("guards click by locator key", () => {
    const sessionId = "ledger-click-1";
    clearActionLedger(sessionId);
    const locator = { kind: "role", role: "button", name: "Go" };
    recordWebAction(sessionId, "click", { locator });
    recordWebAction(sessionId, "click", { locator });
    recordWebAction(sessionId, "click", { locator });
    assert.throws(() => guardWebAction(sessionId, "click", { locator }), /ACTION_TOGGLE_LOOP/);
    assert.equal(buildLocatorActionKey("click", locator), buildWebActionLedgerKey("click", { locator }));
    clearActionLedger(sessionId);
  });

  it("shares ledger between clickPath and click with same path", () => {
    const sessionId = "ledger-shared";
    clearActionLedger(sessionId);
    const path = ["Nav", "Item"];
    assert.equal(buildWebActionLedgerKey("clickPath", { path }), buildWebActionLedgerKey("click", { path }));
    recordWebAction(sessionId, "clickPath", { path });
    recordWebAction(sessionId, "click", { path });
    recordWebAction(sessionId, "clickPath", { path });
    assert.throws(() => guardWebAction(sessionId, "clickPath", { path }), /ACTION_TOGGLE_LOOP/);
    clearActionLedger(sessionId);
  });

  it("navigation breaks consecutive toggle streak for same key", () => {
    const sessionId = "ledger-nav-break";
    clearActionLedger(sessionId);
    const key = buildPathActionKey(["Home"], "click");
    recordAction(sessionId, key, "https://example.com/a");
    recordAction(sessionId, key, "https://example.com/b");
    assert.doesNotThrow(() => guardWebAction(sessionId, "click", { path: ["Home"] }));
    clearActionLedger(sessionId);
  });

  it("guardWebCommandIfNeeded tracks recipe clickPath", () => {
    const sessionId = "ledger-recipe-test";
    clearActionLedger(sessionId);
    const payload = { action: "clickPath", path: ["nav", "item-1"] };
    const ok: CommandResult = { requestId: "r1", success: true, data: {} };
    for (let i = 0; i < 3; i += 1) {
      guardWebCommandIfNeeded("web", sessionId, "recipe", payload);
      recordWebCommandIfNeeded("web", sessionId, "recipe", payload, ok);
    }
    assert.throws(
      () => guardWebCommandIfNeeded("web", sessionId, "recipe", payload),
      /ACTION_TOGGLE_LOOP|repeated action/
    );
    clearActionLedger(sessionId);
  });

  it("guardMobileCommandIfNeeded tracks recipe tap_path", () => {
    const sessionId = "ledger-mobile-recipe";
    clearActionLedger(sessionId);
    const payload = { action: "tap_path", path: ["Home", "Settings"] };
    const ok: CommandResult = { requestId: "r1", success: true, data: {} };
    for (let i = 0; i < 3; i += 1) {
      guardMobileCommandIfNeeded("android", sessionId, "recipe", payload);
      recordMobileCommandIfNeeded("android", sessionId, "recipe", payload, ok);
    }
    assert.throws(
      () => guardMobileCommandIfNeeded("android", sessionId, "recipe", payload),
      /ACTION_TOGGLE_LOOP|repeated action/
    );
    clearActionLedger(sessionId);
  });
});
