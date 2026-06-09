import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyControlFilters,
  findControlsByName,
  findControlByPath,
  findSearchEntryInFlat,
  findSearchInputInFlat,
  labelMatchesHints,
  normalizeControlPath,
  parseWebViewSnapshot,
  resolveClickPathWaitNavigation,
  resolveExpandStrategy,
  resolveWebExpandSettleMs,
  shapeViewTreeExtract,
  truncateViewTreeValue,
  WEB_RECIPE_ACTIONS
} from "@ada/driver-rpc";

describe("web-interaction-recipe helpers", () => {
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
    assert.deepEqual(shapeViewTreeExtract(snapshot, "full"), {
      tree: snapshot.tree,
      flat: snapshot.flat,
      url: snapshot.url
    });
    assert.deepEqual(shapeViewTreeExtract(snapshot), snapshot.flat);
  });

  it("truncateViewTreeValue caps controls and tree nodes", () => {
    const flat = Array.from({ length: 10 }, (_, i) => ({ role: "link", name: `Item ${i}`, path: [`Item ${i}`] }));
    const { value, truncated } = truncateViewTreeValue({ tree: [], flat, url: "https://x" }, 3);
    assert.equal(truncated, true);
    assert.equal((value as { flat: unknown[] }).flat.length, 3);

    const controls = truncateViewTreeValue(flat, 2);
    assert.equal(controls.truncated, true);
    assert.equal((controls.value as unknown[]).length, 2);
  });

  it("WEB_RECIPE_ACTIONS includes fill_search", () => {
    assert.deepEqual([...WEB_RECIPE_ACTIONS], ["clickPath", "fill_search"]);
  });

  it("subpath export @ada/driver-rpc/web-interaction-recipe resolves", async () => {
    const mod = await import("@ada/driver-rpc/web-interaction-recipe");
    assert.equal(typeof mod.normalizeControlPath, "function");
    assert.ok(Array.isArray(mod.WEB_RECIPE_ACTIONS));
  });

  it("findSearchEntryInFlat and findSearchInputInFlat match hints", () => {
    const flat = [
      { role: "button", name: "搜索", path: ["搜索"] },
      { role: "textbox", name: "请输入关键词", path: ["搜索", "请输入关键词"] }
    ];
    assert.ok(labelMatchesHints("Site Search", ["search"]));
    assert.equal(findSearchEntryInFlat(flat, ["搜索"])?.name, "搜索");
    assert.equal(findSearchInputInFlat(flat, ["请输入"])?.role, "textbox");
  });

  it("resolveClickPathWaitNavigation defaults false; enables for real href", () => {
    assert.equal(resolveClickPathWaitNavigation({}, { href: undefined }), false);
    assert.equal(resolveClickPathWaitNavigation({}, { href: "#section" }), false);
    assert.equal(resolveClickPathWaitNavigation({ waitNavigation: true }, null), true);
    assert.equal(resolveClickPathWaitNavigation({ waitNavigation: false }, { href: "/docs" }), false);
    assert.equal(resolveClickPathWaitNavigation({}, { href: "/docs" }), true);
    assert.equal(resolveClickPathWaitNavigation({ requireNavigation: true }, null), true);
  });

  it("resolveWebExpandSettleMs defaults to 100ms", () => {
    assert.equal(resolveWebExpandSettleMs(), 100);
    assert.equal(resolveWebExpandSettleMs({ expandSettleMs: 0 }), 0);
    assert.equal(resolveWebExpandSettleMs({ expandSettleMs: 50 }), 50);
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
