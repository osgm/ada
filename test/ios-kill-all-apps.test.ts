import test from "node:test";
import assert from "node:assert/strict";
import { iosKillAllAppsViaRun } from "../scripts/lib/mobile-kill-all-apps.mjs";

test("iosKillAllAppsViaRun maps deviceAdmin result", async () => {
  const run = async (command: string, extra: Record<string, unknown> = {}) => {
    assert.equal(command, "deviceAdmin");
    assert.equal(extra.action, "killAllApps");
    return {
      success: true,
      data: {
        cleared: true,
        businessCode: "APPS_KILLED",
        killedCount: 2,
        failedCount: 0,
        packages: ["com.example.a", "com.example.b"],
        listSource: "list:wda-activeAppsInfo",
        hits: ["list:wda-activeAppsInfo"]
      }
    };
  };
  const result = await iosKillAllAppsViaRun(run, { excludePackages: ["com.keep.me"] });
  assert.equal(result.businessCode, "APPS_KILLED");
  assert.equal(result.killedCount, 2);
  assert.equal(result.listSource, "list:wda-activeAppsInfo");
  assert.deepEqual(result.packages, ["com.example.a", "com.example.b"]);
});
