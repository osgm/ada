import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyControlFilters,
  findControlsByName,
  findControlByPath,
  normalizeControlPath,
  normalizeRecipeAction,
  parseWebViewSnapshot,
  resolveExpandStrategy,
  shapeViewTreeExtract
} from "../packages/driver-rpc/src/web-interaction-recipe.ts";
import {
  assertActionAllowed,
  buildLocatorActionKey,
  buildPathActionKey,
  buildWebActionLedgerKey,
  clearActionLedger,
  guardWebAction,
  recordAction,
  recordWebAction
} from "../apps/ada-mcp-server/src/mcp-action-ledger.ts";

describe("web-interaction-recipe helpers", () => {
  it("normalizeRecipeAction lowercases action names", () => {
    assert.equal(normalizeRecipeAction("clickPath"), "clickpath");
    assert.equal(normalizeRecipeAction("  ClickPath "), "clickpath");
  });

  it("normalizeControlPath trims empty segments", () => {
    assert.deepEqual(normalizeControlPath([" A ", "", "B"]), ["A", "B"]);
  });

  it("resolveExpandStrategy prefers item triggerKind in auto mode", () => {
    assert.equal(resolveExpandStrategy("auto", { triggerKind: "hover" }), "hover");
    assert.equal(resolveExpandStrategy("click", { triggerKind: "hover" }), "click");
  });

  it("findControlByPath matches longest suffix", () => {
    const flat = [
      { role: "menuitem", name: "A", path: ["A"] },
      { role: "link", name: "B", path: ["A", "B"], href: "/b" }
    ];
    const found = findControlByPath(flat, ["A", "B"]);
    assert.equal(found?.href, "/b");
  });

  it("findControlsByName supports reverse lookup", () => {
    const flat = [
      { role: "link", name: "Home", path: ["Home"], href: "/" },
      { role: "link", name: "Docs", path: ["A", "Docs"], href: "/docs" }
    ];
    const hits = findControlsByName(flat, "doc");
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0]?.path, ["A", "Docs"]);
  });

  it("parseWebViewSnapshot and shapeViewTreeExtract support detail modes", () => {
    const snapshot = parseWebViewSnapshot({
      tree: [{ role: "nav" }],
      flat: [{ role: "link", path: ["Home"] }],
      url: "https://example.com"
    });
    assert.equal(shapeViewTreeExtract(snapshot, "tree"), snapshot.tree);
    assert.equal(shapeViewTreeExtract(snapshot, "controls"), snapshot.flat);
    assert.deepEqual(shapeViewTreeExtract(snapshot, "full"), snapshot);
  });

  it("applyControlFilters adds matches for href/name lookup", () => {
    const snapshot = parseWebViewSnapshot({
      tree: [],
      flat: [
        { role: "link", name: "Docs", path: ["Docs"], href: "/docs" },
        { role: "link", name: "Home", path: ["Home"], href: "/" }
      ],
      url: "https://example.com"
    });
    const filtered = applyControlFilters(snapshot, { name: "doc" });
    assert.equal(filtered.matches?.length, 1);
    assert.equal(filtered.matches?.[0]?.href, "/docs");
  });
});

describe("mcp-action-ledger global guard", () => {
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

  it("guards ada_web_action click by locator key", () => {
    const sessionId = "ledger-click-1";
    clearActionLedger(sessionId);
    const locator = { kind: "role", role: "button", name: "Go" };
    const key = buildLocatorActionKey("click", locator);
    recordWebAction(sessionId, "click", { locator });
    recordWebAction(sessionId, "click", { locator });
    recordWebAction(sessionId, "click", { locator });
    assert.throws(() => guardWebAction(sessionId, "click", { locator }), /ACTION_TOGGLE_LOOP/);
    assert.equal(key, buildWebActionLedgerKey("click", { locator }));
    clearActionLedger(sessionId);
  });

  it("shares ledger between clickPath and click with same path", () => {
    const sessionId = "ledger-shared";
    clearActionLedger(sessionId);
    const path = ["Nav", "Item"];
    const pathKey = buildWebActionLedgerKey("clickPath", { path });
    const clickKey = buildWebActionLedgerKey("click", { path });
    assert.equal(pathKey, clickKey);
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
});
