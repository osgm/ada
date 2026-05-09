import test, { after } from "node:test";
import assert from "node:assert/strict";
import type { CommandEnvelope } from "@ada/contracts";
import type { DriverPlugin } from "@ada/plugin-sdk";
import playwrightPlugin from "@ada/driver-playwright";
import appiumPlugin from "@ada/driver-appium";

after(async () => {
  await playwrightPlugin.dispose();
  await appiumPlugin.dispose();
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

test("appium plugin conformance: command result contract", async () => {
  await runAndAssertResult(
    appiumPlugin,
    baseCommand({
      platform: "android",
      command: "swipe",
      payload: { from: [0.5, 0.8], to: [0.5, 0.2] }
    })
  );
});

test("appium plugin conformance: harmony command result contract", async () => {
  await runAndAssertResult(
    appiumPlugin,
    baseCommand({
      platform: "harmony",
      command: "swipe",
      payload: { from: [0.5, 0.8], to: [0.5, 0.2] }
    })
  );
});

test("appium plugin conformance: probe failure returns standard error fields", async () => {
  const command = baseCommand({
    requestId: "conformance-appium-probe",
    platform: "android",
    command: "swipe",
    payload: { probe: true }
  });
  const session = await appiumPlugin.createSession("android");
  const result = await appiumPlugin.execute(session, command);
  if (!result.success) {
    assert.equal(typeof result.errorCode, "string");
    assert.equal(typeof result.errorMessage, "string");
  }
});

test("appium plugin conformance: harmony real mode type missing target returns standard error", async () => {
  const command = baseCommand({
    requestId: "conformance-appium-harmony-type",
    platform: "harmony",
    command: "type",
    payload: { real: true, serverUrl: "http://127.0.0.1:4723", capabilities: {} }
  });
  const session = await appiumPlugin.createSession("harmony");
  const result = await appiumPlugin.execute(session, command);
  assert.equal(result.success, false);
  assert.ok(
    result.errorCode === "APPIUM_SESSION_CREATE_FAILED" ||
      result.errorCode === "APPIUM_TYPE_MISSING_ELEMENT" ||
      result.errorCode === "APPIUM_TYPE_ELEMENT_NOT_FOUND" ||
      result.errorCode === "APPIUM_TYPE_LOOKUP_FAILED" ||
      result.errorCode === "APPIUM_TYPE_FAILED"
  );
});

test("appium plugin conformance: real mode type missing target returns standard error", async () => {
  const command = baseCommand({
    requestId: "conformance-appium-type",
    platform: "android",
    command: "type",
    payload: { real: true, serverUrl: "http://127.0.0.1:4723", capabilities: {} }
  });
  const session = await appiumPlugin.createSession("android");
  const result = await appiumPlugin.execute(session, command);
  assert.equal(result.success, false);
  assert.ok(
    result.errorCode === "APPIUM_SESSION_CREATE_FAILED" ||
      result.errorCode === "APPIUM_TYPE_MISSING_ELEMENT" ||
      result.errorCode === "APPIUM_TYPE_ELEMENT_NOT_FOUND" ||
      result.errorCode === "APPIUM_TYPE_LOOKUP_FAILED" ||
      result.errorCode === "APPIUM_TYPE_FAILED"
  );
});
