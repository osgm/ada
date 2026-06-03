import test from "node:test";
import assert from "node:assert/strict";
import type { CommandEnvelope } from "@ada/contracts";
import { probeRuntimesForTasks, type InstallDepsConfig } from "@ada/install-deps";

const minimalConfig = {
  dependencies: {
    autoInstallOnStart: false,
    playwrightBrowser: "chromium",
    playwrightInstallTargets: ["chromium"],
    playwrightDownloadHost: "",
    npmRegistryCandidates: ["https://registry.npmjs.org"],
    playwrightHostCandidates: []
  }
} satisfies InstallDepsConfig;

test("probeRuntimesForTasks: 无移动任务时均标记 not required", async () => {
  const tasks: CommandEnvelope[] = [
    {
      requestId: "w1",
      sessionId: "s",
      platform: "web",
      command: "navigate",
      payload: { url: "https://example.com" }
    }
  ];
  const probe = await probeRuntimesForTasks(tasks, minimalConfig);
  assert.equal(probe.android.needed, false);
  assert.equal(probe.ios.needed, false);
  assert.equal(probe.harmony.needed, false);
  assert.equal(probe.android.ready, true);
  assert.equal(probe.ios.ready, true);
  assert.equal(probe.harmony.ready, true);
});

test("probeRuntimesForTasks: 仅 android 任务探测 android", async () => {
  const tasks: CommandEnvelope[] = [
    {
      requestId: "a1",
      sessionId: "s",
      platform: "android",
      command: "click",
      payload: {}
    }
  ];
  const probe = await probeRuntimesForTasks(tasks, minimalConfig);
  assert.equal(probe.android.needed, true);
  assert.equal(probe.ios.needed, false);
  assert.equal(probe.harmony.needed, false);
  assert.equal(typeof probe.android.detail, "string");
  assert.ok(probe.android.detail.length > 0);
});
