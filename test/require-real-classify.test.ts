import test from "node:test";
import assert from "node:assert/strict";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { classifyRequireRealFailures } from "@ada/agent-core";
import type { TaskRuntimeProbe } from "@ada/install-deps";

function task(platform: CommandEnvelope["platform"]): CommandEnvelope {
  return {
    requestId: `req-${platform}`,
    sessionId: "s1",
    platform,
    command: "click",
    payload: {}
  };
}

function okResult(requestId: string): CommandResult {
  return { requestId, success: true, data: { mode: "real" } };
}

function mockResult(requestId: string): CommandResult {
  return { requestId, success: true, data: { mode: "mock", reason: "skeleton" } };
}

const depsHealthy = {
  playwrightInstalled: true,
  playwrightLaunchOk: true
} as Awaited<ReturnType<typeof import("@ada/install-deps").getDependencyHealth>>;

const depsNoPlaywright = {
  playwrightInstalled: false,
  playwrightLaunchOk: false
} as typeof depsHealthy;

function runtime(overrides: Partial<TaskRuntimeProbe> = {}): TaskRuntimeProbe {
  return {
    android: { needed: false, ready: true, detail: "not required" },
    ios: { needed: false, ready: true, detail: "not required" },
    harmony: { needed: false, ready: true, detail: "not required" },
    ...overrides
  };
}

function hasFailures(summary: ReturnType<typeof classifyRequireRealFailures>): boolean {
  return (
    (summary.dependencyMissing as string[]).length > 0 ||
    Boolean(summary.browserNotLaunchable) ||
    Boolean(summary.mobileRuntimeUnready) ||
    Boolean(summary.harmonyHdcUnready) ||
    Number(summary.mockFallbackCount) > 0 ||
    Number(summary.executionFailureCount) > 0
  );
}

test("require-real: web 缺 playwright 记入 dependencyMissing", () => {
  const summary = classifyRequireRealFailures([task("web")], [okResult("req-web")], depsNoPlaywright, runtime(), true);
  assert.deepEqual(summary.dependencyMissing, ["playwright"]);
  assert.equal(hasFailures(summary), true);
});

test("require-real: iOS 未就绪不应误伤无 Android 任务", () => {
  const summary = classifyRequireRealFailures(
    [task("ios")],
    [okResult("req-ios")],
    depsHealthy,
    runtime({
      ios: { needed: true, ready: false, detail: "wda unreachable" }
    }),
    true
  );
  assert.equal(summary.mobileRuntimeUnready, true);
  assert.ok((summary.dependencyMissing as string[]).includes("ios-runtime"));
  assert.ok(!(summary.dependencyMissing as string[]).includes("android-runtime"));
});

test("require-real: Android 需 adb 与 java", () => {
  const summary = classifyRequireRealFailures(
    [task("android")],
    [okResult("req-android")],
    depsHealthy,
    runtime({
      android: { needed: true, ready: false, detail: "no device" }
    }),
    false
  );
  const missing = summary.dependencyMissing as string[];
  assert.ok(missing.includes("java-runtime"));
  assert.ok(missing.includes("android-runtime"));
  assert.equal(summary.mobileRuntimeUnready, true);
});

test("require-real: Harmony hdc 未就绪触发 harmonyHdcUnready", () => {
  const summary = classifyRequireRealFailures(
    [task("harmony")],
    [okResult("req-harmony")],
    depsHealthy,
    runtime({
      harmony: { needed: true, ready: false, detail: "hdc probe failed" }
    }),
    true
  );
  assert.equal(summary.harmonyHdcUnready, true);
  assert.equal(hasFailures(summary), true);
});

test("require-real: mock 回退计入失败", () => {
  const summary = classifyRequireRealFailures([task("web")], [mockResult("req-web")], depsHealthy, runtime(), true);
  assert.equal(summary.mockFallbackCount, 1);
  assert.equal(hasFailures(summary), true);
});
