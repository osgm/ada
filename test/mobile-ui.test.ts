import test from "node:test";
import assert from "node:assert/strict";
import { findUiNode, parseAndroidHierarchy, parseHarmonyLayoutJson, resolveUiHeuristicsConfig } from "@ada/mobile-ui";

const screen = { width: 1080, height: 2400 };

test("parseAndroidHierarchy + findUiNode searchEntry (default en)", () => {
  const xml = `<hierarchy>
  <node text="Search" clickable="true" bounds="[100,80][900,180]"/>
  </hierarchy>`;
  const nodes = parseAndroidHierarchy(xml);
  const hit = findUiNode(nodes, { role: "searchEntry", screen, platform: "android" });
  assert.ok(hit);
  assert.equal(hit?.kind, "entry");
});

test("findUiNode with custom heuristics labels", () => {
  const xml = `<hierarchy>
  <node text="搜索" clickable="true" bounds="[100,80][900,180]"/>
  </hierarchy>`;
  const nodes = parseAndroidHierarchy(xml);
  const hit = findUiNode(nodes, {
    role: "searchEntry",
    screen,
    platform: "android",
    heuristics: { searchEntryLabels: ["搜索", "search"] }
  });
  assert.ok(hit);
});

test("parseHarmonyLayoutJson + findUiNode searchInput", () => {
  const json = JSON.stringify({
    attributes: { bounds: "[0,0][1080,2400]" },
    children: [
      {
        attributes: {
          bounds: "[100,100][900,200]",
          type: "TextInput",
          text: "query",
          focused: "true"
        },
        children: []
      }
    ]
  });
  const nodes = parseHarmonyLayoutJson(json);
  const hit = findUiNode(nodes, { role: "searchInput", screen, platform: "harmony" });
  assert.ok(hit);
  assert.equal(hit?.kind, "input");
});

test("resolveUiHeuristicsConfig merges overrides", () => {
  const cfg = resolveUiHeuristicsConfig({ topRegionRatio: 0.25 });
  assert.equal(cfg.topRegionRatio, 0.25);
  assert.ok(cfg.searchEntryRe.test("search"));
});
