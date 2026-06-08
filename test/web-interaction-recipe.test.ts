import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyControlFilters,
  findControlsByName,
  findControlByPath,
  normalizeControlPath,
  parseWebViewSnapshot,
  resolveExpandStrategy,
  shapeViewTreeExtract,
  truncateViewTreeValue
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
