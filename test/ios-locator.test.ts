import test from "node:test";
import assert from "node:assert/strict";
import { capsOf, iosLocatorToUsing, isIosClearTypeOp } from "@ada/driver-ios";

test("iosLocatorToUsing maps text to label/name/value xpath", () => {
  const mapped = iosLocatorToUsing({ text: "搜索" });
  assert.ok(mapped);
  assert.equal(mapped!.using, "xpath");
  assert.match(mapped!.value, /contains\(@label, "搜索"\)/);
  assert.match(mapped!.value, /contains\(@name, "搜索"\)/);
  assert.match(mapped!.value, /contains\(@value, "搜索"\)/);
});

test("iosLocatorToUsing preserves id and accessibilityId", () => {
  assert.deepEqual(iosLocatorToUsing({ id: "login-btn" }), { using: "id", value: "login-btn" });
  assert.deepEqual(iosLocatorToUsing({ accessibilityId: "Search" }), {
    using: "accessibility id",
    value: "Search"
  });
});

test("isIosClearTypeOp detects clear intent", () => {
  assert.equal(isIosClearTypeOp({ locator: { text: "x" }, inputOp: "clear" }), true);
  assert.equal(isIosClearTypeOp({ locator: { id: "f" }, text: "" }), true);
  assert.equal(isIosClearTypeOp({ locator: { id: "f" }, text: "hi" }), false);
});

test("capsOf merges bundleId and ADA_IOS_DEVICE_UDID", () => {
  const prev = process.env.ADA_IOS_DEVICE_UDID;
  process.env.ADA_IOS_DEVICE_UDID = "DEVICE-UDID-1";
  try {
    const caps = capsOf({ appId: "com.example.app", capabilities: { platformVersion: "17.0" } });
    assert.equal(caps.bundleId, "com.example.app");
    assert.equal(caps.udid, "DEVICE-UDID-1");
    assert.equal(caps.platformName, "iOS");
    assert.equal(caps.automationName, "XCUITest");
    assert.equal(caps.platformVersion, "17.0");
  } finally {
    if (prev === undefined) delete process.env.ADA_IOS_DEVICE_UDID;
    else process.env.ADA_IOS_DEVICE_UDID = prev;
  }
});
