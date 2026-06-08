import assert from "node:assert/strict";
import test from "node:test";
import {
  detectFillSearchPageTransition,
  fillSearchPayloadFromArg,
  isDirectInputTapDetail,
  parseFillSearchPayload,
  resolveFillSearchSettleMs
} from "@ada/driver-rpc";
import { pickNodeByTextHints } from "@ada/mobile-ui";

const screen = { width: 1080, height: 2400 };

test("fillSearchPayloadFromArg: split entry/input hints", () => {
  const p = fillSearchPayloadFromArg({
    entryHints: ["搜索"],
    inputHints: ["请输入", "输入"]
  });
  assert.deepEqual(p.entryHints, ["搜索"]);
  assert.deepEqual(p.inputHints, ["请输入", "输入"]);
  assert.deepEqual(p.uiHeuristics.searchEntryLabels, ["搜索"]);
  assert.deepEqual(p.uiHeuristics.searchInputLabels, ["请输入", "输入"]);
});

test("parseFillSearchPayload: legacy hints array", () => {
  const parsed = parseFillSearchPayload({ hints: ["搜索", "请输入"], strict: true });
  assert.equal(parsed.strict, true);
  assert.deepEqual(parsed.entryHints, ["搜索", "请输入"]);
  assert.deepEqual(parsed.inputHints, ["搜索", "请输入"]);
});

test("pickNodeByTextHints: finds input by substring", () => {
  const nodes = [
    {
      text: "请输入商品",
      desc: "",
      id: "",
      type: "EditText",
      clickable: true,
      focused: false,
      bounds: [100, 180, 980, 260] as [number, number, number, number],
      point: [540, 220] as [number, number]
    }
  ];
  const hit = pickNodeByTextHints(nodes, ["请输入"], "searchInput", screen);
  assert.ok(hit);
  assert.equal(hit?.point[1], 220);
});

test("resolveFillSearchSettleMs: direct input tap uses longer default", () => {
  assert.equal(resolveFillSearchSettleMs("direct input @ 720,393"), 800);
  assert.equal(resolveFillSearchSettleMs("tap entry @ 100,200"), 400);
  assert.equal(resolveFillSearchSettleMs("direct input @ 1,2", 1500), 1500);
});

test("detectFillSearchPageTransition: resource-id change after tap", () => {
  const tapPick = {
    point: [720, 393] as [number, number],
    label: "搜索栏com.jingdong.app.mall:id/a8h",
    kind: "input" as const,
    score: 100
  };
  const afterPick = {
    point: [641, 236] as [number, number],
    label: "搜索框,com.jd.lib.search.feature:id/a2j",
    kind: "input" as const,
    score: 100
  };
  assert.equal(
    detectFillSearchPageTransition(tapPick, afterPick, screen, 248, 76),
    true
  );
});

test("isDirectInputTapDetail", () => {
  assert.equal(isDirectInputTapDetail("direct input @ 1,2"), true);
  assert.equal(isDirectInputTapDetail("tap entry @ 1,2"), false);
});
