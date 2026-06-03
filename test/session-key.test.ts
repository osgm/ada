import test from "node:test";
import assert from "node:assert/strict";
import { buildKernelSessionKey, parseKernelSessionKey, resolveMobileDeviceId } from "@ada/driver-rpc";

test("buildKernelSessionKey: android includes udid", () => {
  const key = buildKernelSessionKey("android", "s1", { capabilities: { udid: "emulator-5554" } });
  assert.equal(key, "android:emulator-5554:s1");
});

test("buildKernelSessionKey: harmony includes deviceSn", () => {
  const key = buildKernelSessionKey("harmony", "hm", { capabilities: { deviceSn: "ABC123" } });
  assert.equal(key, "harmony:ABC123:hm");
});

test("parseKernelSessionKey roundtrip", () => {
  const key = buildKernelSessionKey("ios", "sess", { capabilities: { udid: "ios-udid" } });
  const parsed = parseKernelSessionKey(key);
  assert.equal(parsed?.platform, "ios");
  assert.equal(parsed?.deviceId, "ios-udid");
  assert.equal(parsed?.sessionId, "sess");
});

test("resolveMobileDeviceId from env", () => {
  const prev = process.env.ADA_ANDROID_UDID;
  process.env.ADA_ANDROID_UDID = "from-env";
  assert.equal(resolveMobileDeviceId("android", {}), "from-env");
  if (prev === undefined) delete process.env.ADA_ANDROID_UDID;
  else process.env.ADA_ANDROID_UDID = prev;
});
