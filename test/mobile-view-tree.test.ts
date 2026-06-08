import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractMobilePageSourceText,
  findMobileControlByPath,
  findMobileNodeForSegment,
  parseMobileHierarchy,
  shapeMobileViewTreeFlat
} from "@ada/driver-rpc";

const androidXml = `<hierarchy>
  <node text="Home" clickable="true" bounds="[10,10][200,80]"/>
  <node text="Settings" clickable="true" bounds="[10,100][200,170]"/>
  <node text="Search" clickable="true" bounds="[100,80][900,180]"/>
</hierarchy>`;

describe("mobile-view-tree", () => {
  it("shapeMobileViewTreeFlat keeps clickable nodes with labels", () => {
    const nodes = parseMobileHierarchy("android", androidXml);
    const { flat, truncated } = shapeMobileViewTreeFlat(nodes, 80);
    assert.equal(truncated, false);
    assert.ok(flat.some((item) => item.name === "Search" && item.clickable));
    assert.deepEqual(flat.find((item) => item.name === "Search")?.path, ["Search"]);
  });

  it("findMobileNodeForSegment prefers exact label match", () => {
    const nodes = parseMobileHierarchy("android", androidXml);
    const hit = findMobileNodeForSegment(nodes, "Settings");
    assert.ok(hit);
    assert.equal(hit?.text?.trim(), "Settings");
  });

  it("findMobileControlByPath matches suffix path", () => {
    const nodes = parseMobileHierarchy("android", androidXml);
    const { flat } = shapeMobileViewTreeFlat(nodes, 80);
    const hit = findMobileControlByPath(flat, ["Settings"]);
    assert.equal(hit?.name, "Settings");
  });

  it("extractMobilePageSourceText reads common result shapes", () => {
    assert.equal(extractMobilePageSourceText({ value: androidXml }), androidXml);
    assert.equal(extractMobilePageSourceText({ pageSource: androidXml }), androidXml);
    assert.equal(extractMobilePageSourceText({ source: androidXml }), androidXml);
  });
});
