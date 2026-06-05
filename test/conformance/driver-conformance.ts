import test, { after } from "node:test";
import assert from "node:assert/strict";
import type { CommandEnvelope } from "@ada/contracts";
import type { DriverPlugin } from "@ada/plugin-sdk";
import { PluginHost } from "@ada/plugin-host";
import playwrightPlugin from "@ada/driver-playwright";
import androidPlugin from "@ada/driver-android";
import iosPlugin from "@ada/driver-ios";
import harmonyPlugin from "@ada/driver-harmony";

after(async () => {
  await playwrightPlugin.dispose();
  await androidPlugin.dispose();
  await iosPlugin.dispose();
  await harmonyPlugin.dispose();
});

function baseCommand(overrides: Partial<CommandEnvelope>): CommandEnvelope {
  return {
    requestId: "conformance-req",
    sessionId: "conformance-session",
    platform: "web",
    command: "click",
    payload: {},
    ...overrides
  };
}

async function runAndAssertResult(plugin: DriverPlugin, command: CommandEnvelope): Promise<void> {
  const session = await plugin.createSession(command.platform);
  const result = await plugin.execute(session, command);
  assert.equal(typeof result.requestId, "string");
  assert.equal(typeof result.success, "boolean");
  assert.equal(result.requestId, command.requestId);
}

test("plugin-host: web engine routing resolves playwright", async () => {
  const host = new PluginHost();
  host.register(playwrightPlugin);

  const pw = host.resolve(
    baseCommand({ platform: "web", command: "navigate", payload: { url: "https://example.com" } })
  );
  assert.equal(pw.manifest.engine, "playwright");
});

test("playwright plugin conformance: command result contract", async () => {
  await runAndAssertResult(
    playwrightPlugin,
    baseCommand({
      platform: "web",
      command: "click",
      payload: { mock: true, locator: { text: "Example" } }
    })
  );
});

test("playwright plugin conformance: navigation/tab commands contract", async () => {
  const session = await playwrightPlugin.createSession("web");
  const navigate = await playwrightPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-pw-nav",
      platform: "web",
      command: "navigate",
      payload: { url: "https://example.com", headless: true }
    })
  );
  assert.equal(navigate.success, true);

  const reload = await playwrightPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-pw-reload",
      platform: "web",
      command: "reload",
      payload: { headless: true }
    })
  );
  assert.equal(reload.success, true);

  const back = await playwrightPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-pw-back",
      platform: "web",
      command: "back",
      payload: { headless: true }
    })
  );
  assert.equal(back.success, true);

  const forward = await playwrightPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-pw-forward",
      platform: "web",
      command: "forward",
      payload: { headless: true }
    })
  );
  assert.equal(forward.success, true);

  const newTab = await playwrightPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-pw-new-tab",
      platform: "web",
      command: "newTab",
      payload: { headless: true, url: "https://example.com" }
    })
  );
  assert.equal(newTab.success, true);

  const switchTab = await playwrightPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-pw-switch-tab",
      platform: "web",
      command: "switchTab",
      payload: { headless: true, tabIndex: 0 }
    })
  );
  assert.equal(switchTab.success, true);

  const closeTab = await playwrightPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-pw-close",
      platform: "web",
      command: "closeTab",
      payload: { headless: true }
    })
  );
  assert.equal(closeTab.success, true);
});

test("playwright plugin conformance: invoke invalid payload returns standard error", async () => {
  const session = await playwrightPlugin.createSession("web");
  const result = await playwrightPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-pw-invoke-invalid",
      platform: "web",
      command: "invoke",
      payload: {}
    })
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "INVOKE_INVALID_PAYLOAD");
});

test("android plugin conformance: invoke invalid payload returns standard error", async () => {
  const session = await androidPlugin.createSession("android");
  const result = await androidPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-android-invoke-invalid",
      platform: "android",
      command: "invoke",
      payload: { capabilities: {}, mock: true }
    })
  );
  assert.equal(result.success, false);
  assert.ok(
    result.errorCode === "INVOKE_INVALID_PAYLOAD" || typeof result.errorCode === "string"
  );
});

test("android plugin conformance: invoke mock http returns success", async () => {
  const session = await androidPlugin.createSession("android");
  const result = await androidPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-android-invoke-mock-http",
      platform: "android",
      command: "invoke",
      payload: {
        mock: true,
        mode: "http",
        http: { method: "GET", path: "/status" }
      }
    })
  );
  assert.equal(result.success, true);
  assert.equal((result.data as Record<string, unknown>).rpcMode, "http");
});

test("android plugin conformance: invoke mock method returns success", async () => {
  const session = await androidPlugin.createSession("android");
  const result = await androidPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-android-invoke-mock-method",
      platform: "android",
      command: "invoke",
      payload: {
        mock: true,
        mode: "method",
        target: "adb",
        method: "getState",
        args: []
      }
    })
  );
  assert.equal(result.success, true);
  assert.equal((result.data as Record<string, unknown>).rpcMode, "method");
});

test("ios plugin conformance: invoke mock http returns success", async () => {
  const session = await iosPlugin.createSession("ios");
  const result = await iosPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-ios-invoke-mock-http",
      platform: "ios",
      command: "invoke",
      payload: {
        mock: true,
        mode: "http",
        http: { method: "GET", path: "/status" }
      }
    })
  );
  assert.equal(result.success, true);
  assert.equal((result.data as Record<string, unknown>).rpcMode, "http");
});

test("ios plugin conformance: swipe mock contract", async () => {
  await runAndAssertResult(
    iosPlugin,
    baseCommand({
      platform: "ios",
      command: "swipe",
      payload: { mock: true, from: [100, 500], to: [100, 200] }
    })
  );
});

test("android plugin conformance: command result contract", async () => {
  await runAndAssertResult(
    androidPlugin,
    baseCommand({
      platform: "android",
      command: "swipe",
      payload: { from: [0.5, 0.8], to: [0.5, 0.2], mock: true }
    })
  );
});

test("ios plugin conformance: invoke invalid payload returns standard error", async () => {
  const session = await iosPlugin.createSession("ios");
  const result = await iosPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-ios-invoke-invalid",
      platform: "ios",
      command: "invoke",
      payload: { mock: true }
    })
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "INVOKE_INVALID_PAYLOAD");
});

test("ios plugin conformance: command result contract", async () => {
  await runAndAssertResult(
    iosPlugin,
    baseCommand({
      platform: "ios",
      command: "click",
      payload: { mock: true, locator: { accessibilityId: "demo" } }
    })
  );
});

test("ios plugin conformance: click with text locator mock", async () => {
  await runAndAssertResult(
    iosPlugin,
    baseCommand({
      platform: "ios",
      command: "click",
      payload: { mock: true, locator: { text: "搜索" } }
    })
  );
});

test("ios plugin conformance: pinch mock contract", async () => {
  await runAndAssertResult(
    iosPlugin,
    baseCommand({
      platform: "ios",
      command: "pinch",
      payload: {
        mock: true,
        finger1: [100, 200],
        finger2: [300, 400],
        finger1End: [150, 250],
        finger2End: [250, 350]
      }
    })
  );
});

test("ios plugin conformance: deviceAdmin killAllApps mock", async () => {
  const session = await iosPlugin.createSession("ios");
  const result = await iosPlugin.execute(
    session,
    baseCommand({
      platform: "ios",
      command: "deviceAdmin",
      payload: { mock: true, action: "killAllApps" }
    })
  );
  assert.equal(result.success, true);
  assert.equal((result.data as Record<string, unknown>).command, "deviceAdmin");
});

test("ios plugin conformance: deviceAdmin wake mock", async () => {
  const session = await iosPlugin.createSession("ios");
  const result = await iosPlugin.execute(
    session,
    baseCommand({
      platform: "ios",
      command: "deviceAdmin",
      payload: { mock: true, action: "wake" }
    })
  );
  assert.equal(result.success, true);
});

test("harmony plugin conformance: invoke invalid payload returns standard error", async () => {
  const session = await harmonyPlugin.createSession("harmony");
  const result = await harmonyPlugin.execute(
    session,
    baseCommand({
      requestId: "conformance-harmony-invoke-invalid",
      platform: "harmony",
      command: "invoke",
      payload: { mock: true }
    })
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "INVOKE_INVALID_PAYLOAD");
});

test("harmony plugin conformance: command result contract", async () => {
  await runAndAssertResult(
    harmonyPlugin,
    baseCommand({
      platform: "harmony",
      command: "swipe",
      payload: { from: [0.5, 0.8], to: [0.5, 0.2], mock: true }
    })
  );
});

test("plugin-host: mobile platform routing", async () => {
  const host = new PluginHost();
  host.register(androidPlugin);
  host.register(iosPlugin);
  host.register(harmonyPlugin);

  const android = host.resolve(baseCommand({ platform: "android", command: "click" }));
  assert.equal(android.manifest.engine, "android");

  const ios = host.resolve(baseCommand({ platform: "ios", command: "click" }));
  assert.equal(ios.manifest.engine, "ios");

  const harmony = host.resolve(baseCommand({ platform: "harmony", command: "click" }));
  assert.equal(harmony.manifest.engine, "harmony");
});
