import test from "node:test";
import assert from "node:assert/strict";
import { androidSessionSignature } from "../plugins/driver-android/src/session-signature.js";
import { iosSessionSignature } from "../plugins/driver-ios/src/session-signature.js";
import { ElementIdCache, locatorCacheKey, isTransientMobileErrorCode } from "@ada/driver-rpc";
import androidPlugin from "../plugins/driver-android/src/index.js";
import iosPlugin from "../plugins/driver-ios/src/index.js";
import type { CommandEnvelope } from "@ada/contracts";

test("androidSessionSignature: stable across empty capabilities", () => {
  const a = androidSessionSignature({});
  const b = androidSessionSignature({ capabilities: undefined });
  assert.equal(a, b);
});

test("iosSessionSignature: stable when capabilities omitted", () => {
  const a = iosSessionSignature({});
  const b = iosSessionSignature({ capabilities: undefined });
  assert.equal(a, b);
});

test("locatorCacheKey: same locator yields same key", () => {
  const key = locatorCacheKey({ id: "com.example:id/btn" });
  assert.equal(key, locatorCacheKey({ id: "com.example:id/btn" }));
});

test("ElementIdCache: expires after ttl", async () => {
  const cache = new ElementIdCache(20);
  cache.set("id:btn", "elem-1");
  assert.equal(cache.get("id:btn"), "elem-1");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(cache.get("id:btn"), undefined);
});

test("isTransientMobileErrorCode: recognizes mobile invoke failures", () => {
  assert.equal(isTransientMobileErrorCode("INVOKE_HTTP_FAILED"), true);
  assert.equal(isTransientMobileErrorCode("DRIVER_CAPABILITY_UNSUPPORTED"), false);
});

test("android plugin: reuses adapter session across commands (mock)", async () => {
  const session = await androidPlugin.createSession("android");
  const payload = { mock: true };
  const cmd = (command: string): CommandEnvelope => ({
    requestId: `sig-${command}`,
    sessionId: "reuse-test",
    platform: "android",
    command,
    payload
  });
  const r1 = await androidPlugin.execute(session, cmd("click"));
  const r2 = await androidPlugin.execute(session, cmd("wait"));
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal((r1.data as { mode?: string }).mode, "mock");
  assert.equal((r2.data as { mode?: string }).mode, "mock");
});

test("ios plugin: reuses adapter session across commands (mock)", async () => {
  const session = await iosPlugin.createSession("ios");
  const payload = { mock: true };
  const cmd = (command: string): CommandEnvelope => ({
    requestId: `sig-ios-${command}`,
    sessionId: "reuse-test-ios",
    platform: "ios",
    command,
    payload
  });
  const r1 = await iosPlugin.execute(session, cmd("click"));
  const r2 = await iosPlugin.execute(session, cmd("wait"));
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
});
