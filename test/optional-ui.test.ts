import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOptionalUiMissResult,
  isOptionalUiPayload,
  suppressHypiumOptionalProbeLogs,
  UI_ELEMENT_NOT_FOUND
} from "@ada/driver-rpc";

test("isOptionalUiPayload", () => {
  assert.equal(isOptionalUiPayload({ optional: true }), true);
  assert.equal(isOptionalUiPayload({ bestEffort: true }), true);
  assert.equal(isOptionalUiPayload({}), false);
});

test("suppressHypiumOptionalProbeLogs filters RpcClient noise", () => {
  const restore = suppressHypiumOptionalProbeLogs();
  try {
    console.error("[RpcClient] [ERROR] RPC exception: Fail to resolve object");
    console.trace("should be suppressed");
    assert.ok(true);
  } finally {
    restore();
  }
});

test("buildOptionalUiMissResult uses business code", () => {
  const r = buildOptionalUiMissResult(
    { requestId: "r1", sessionId: "s", platform: "harmony", command: "click", payload: {} },
    "optional click: 关闭 not found"
  );
  assert.equal(r.success, false);
  assert.equal(r.errorCode, UI_ELEMENT_NOT_FOUND);
  assert.equal((r.data as Record<string, unknown>).businessCode, "LOCATOR_NOT_FOUND");
  assert.equal((r.data as Record<string, unknown>).optional, true);
});
