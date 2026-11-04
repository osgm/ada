import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutionGateKey,
  buildKernelSessionKey,
  parseKernelSessionKey,
  resolveMobileDeviceId,
  shouldSerializeMobileDevice
} from "@ada/driver-rpc";

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

test("buildExecutionGateKey: same android device shares gate across sessionIds", () => {
  const payload = { capabilities: { udid: "emulator-5554" } };
  const a = buildExecutionGateKey("android", "task-a", payload);
  const b = buildExecutionGateKey("android", "task-b", payload);
  assert.equal(a, "device-gate:android:emulator-5554");
  assert.equal(a, b);
  assert.notEqual(a, buildKernelSessionKey("android", "task-a", payload));
});

test("buildExecutionGateKey: different devices stay isolated", () => {
  const a = buildExecutionGateKey("android", "s1", { capabilities: { udid: "dev-1" } });
  const b = buildExecutionGateKey("android", "s1", { capabilities: { udid: "dev-2" } });
  assert.notEqual(a, b);
});

test("buildExecutionGateKey: web stays per-session", () => {
  const a = buildExecutionGateKey("web", "w1", {});
  const b = buildExecutionGateKey("web", "w2", {});
  assert.notEqual(a, b);
});

test("shouldSerializeMobileDevice defaults on", () => {
  const prev = process.env.ADA_MOBILE_DEVICE_SERIALIZE;
  delete process.env.ADA_MOBILE_DEVICE_SERIALIZE;
  try {
    assert.equal(shouldSerializeMobileDevice("android"), true);
    assert.equal(shouldSerializeMobileDevice("web"), false);
    process.env.ADA_MOBILE_DEVICE_SERIALIZE = "0";
    assert.equal(shouldSerializeMobileDevice("android"), false);
  } finally {
    if (prev === undefined) delete process.env.ADA_MOBILE_DEVICE_SERIALIZE;
    else process.env.ADA_MOBILE_DEVICE_SERIALIZE = prev;
  }
});
