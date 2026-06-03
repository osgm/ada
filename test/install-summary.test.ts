import test from "node:test";
import assert from "node:assert/strict";
import {
  InstallDriverTracker,
  mergeInstallSummaries,
  formatInstallDepsResponse
} from "@ada/install-deps";

test("InstallDriverTracker: 未 record 的驱动进入 failedDrivers", () => {
  const tracker = new InstallDriverTracker("playwright");
  const built = tracker.build();
  assert.deepEqual(built.requestedDrivers, ["playwright-browsers"]);
  assert.deepEqual(built.failedDrivers, ["playwright-browsers"]);
  assert.equal(built.installedDrivers.length, 0);
});

test("mergeInstallSummaries: 合并多步结果", () => {
  const merged = mergeInstallSummaries([
    {
      requestedDrivers: ["playwright-browsers"],
      installedDrivers: ["playwright-browsers"],
      summaryLines: ["已安装: Playwright 浏览器"]
    },
    {
      requestedDrivers: ["android-adb"],
      failedDrivers: ["android-adb"],
      summaryLines: ["未就绪: Android adb 运行时"]
    }
  ]);
  assert.ok(merged.installedDrivers.includes("playwright-browsers"));
  assert.ok(merged.failedDrivers.includes("android-adb"));
  assert.equal(merged.summaryLines.length, 2);
});

test("formatInstallDepsResponse: 优先使用 merged 字段", () => {
  const lines = formatInstallDepsResponse({
    merged: {
      summaryLines: ["合并 2 步安装结果", "已安装: Playwright 浏览器"],
      failedDrivers: []
    }
  });
  assert.ok(lines.some((l) => l.includes("合并")));
  assert.ok(lines.some((l) => l.includes("Playwright")));
});
