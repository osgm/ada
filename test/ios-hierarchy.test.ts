import test from "node:test";
import assert from "node:assert/strict";
import { parseIosHierarchy, pickNodeByTextHints } from "@ada/mobile-ui";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<AppiumAUT>
  <XCUIElementTypeApplication type="XCUIElementTypeApplication" name="京东" label="京东" x="0" y="0" width="390" height="844" visible="true">
    <XCUIElementTypeButton type="XCUIElementTypeButton" name="搜索" label="搜索" accessible="true" x="280" y="48" width="80" height="36" visible="true"/>
    <XCUIElementTypeTextField type="XCUIElementTypeTextField" name="请输入商品" label="请输入商品" x="40" y="120" width="310" height="44" visible="true"/>
  </XCUIElementTypeApplication>
</AppiumAUT>`;

test("parseIosHierarchy extracts XCUI nodes with bounds and labels", () => {
  const nodes = parseIosHierarchy(SAMPLE);
  assert.ok(nodes.length >= 2);
  const search = nodes.find((n) => n.text === "搜索");
  assert.ok(search);
  assert.equal(search!.clickable, true);
  assert.equal(search!.point[0], 320);
  const input = nodes.find((n) => n.text.includes("请输入"));
  assert.ok(input);
  assert.match(input!.type, /TextField/);
});

test("pickNodeByTextHints works on iOS hierarchy dump", () => {
  const nodes = parseIosHierarchy(SAMPLE);
  const screen = { width: 390, height: 844 };
  const entry = pickNodeByTextHints(nodes, ["搜索"], "searchEntry", screen);
  assert.ok(entry);
  assert.equal(entry!.label, "搜索");
  const input = pickNodeByTextHints(nodes, ["请输入"], "searchInput", screen);
  assert.ok(input);
  assert.match(input!.label, /请输入/);
});
