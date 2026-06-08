import test from "node:test";
import assert from "node:assert/strict";
import { iosPickToXpathCandidates } from "@ada/driver-ios";

test("iosPickToXpathCandidates prefers SearchField for input picks", () => {
  const paths = iosPickToXpathCandidates({ point: [1, 2], label: "请输入", kind: "input" });
  assert.ok(paths[0]!.includes("SearchField"));
  assert.ok(paths.some((p) => p.includes("请输入")));
});

test("iosPickToXpathCandidates matches entry label on buttons", () => {
  const paths = iosPickToXpathCandidates({ point: [1, 2], label: "搜索", kind: "entry" });
  assert.ok(paths.some((p) => p.includes("Button")));
  assert.ok(paths.some((p) => p.includes("搜索")));
});
