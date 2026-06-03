import test from "node:test";
import assert from "node:assert/strict";
import { mergeSmartWait, parseSmartWaitFromPayload, resolveLaunchSettleWait, runSmartWait } from "@ada/driver-rpc";

test("parseSmartWaitFromPayload", () => {
  const w = parseSmartWaitFromPayload({ wait: { until: "ui_stable", timeoutMs: 5000, stableMs: 300 } });
  assert.equal(w?.until, "ui_stable");
  assert.equal(w?.timeoutMs, 5000);
});

test("runSmartWait timeout mode", async () => {
  const t0 = Date.now();
  await runSmartWait(undefined, mergeSmartWait({ until: "timeout", timeoutMs: 50 }));
  assert.ok(Date.now() - t0 >= 40);
});

test("runSmartWait ui_stable", async () => {
  let calls = 0;
  await runSmartWait(
    {
      async dumpUi() {
        calls += 1;
        return calls >= 2 ? [{ text: "a", desc: "", id: "", type: "", clickable: true, focused: false, point: [1, 1] }] : [];
      }
    },
    mergeSmartWait({ until: "ui_stable", timeoutMs: 3000, stableMs: 100, pollMs: 50 })
  );
  assert.ok(calls >= 2);
});

test("resolveLaunchSettleWait: numeric settle uses launch_settled cap", () => {
  const w = resolveLaunchSettleWait("android", 2500);
  assert.equal(w.until, "launch_settled");
  assert.equal(w.timeoutMs, 2500);
});

test("resolveLaunchSettleWait: default max is 8000 for all platforms", () => {
  assert.equal(resolveLaunchSettleWait("android").timeoutMs, 8000);
  assert.equal(resolveLaunchSettleWait("ios").timeoutMs, 8000);
  assert.equal(resolveLaunchSettleWait("harmony").timeoutMs, 8000);
});
