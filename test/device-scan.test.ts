import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeDeviceScan,
  parseAdbDevicesOutput,
  parseHdcTargetsOutput,
  pickDefaultDeviceId,
  createEmptyDeviceRegistry,
  registryToDeviceListRows
} from "@ada/runtime-probe";

test("parseAdbDevicesOutput: device / unauthorized / offline", () => {
  const rows = parseAdbDevicesOutput(`List of devices attached
R28M30T7HFV\tdevice
emulator-5554\tunauthorized
192.168.1.5:5555\toffline
`);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { id: "R28M30T7HFV", state: "device" });
  assert.deepEqual(rows[1], { id: "emulator-5554", state: "unauthorized" });
  assert.deepEqual(rows[2], { id: "192.168.1.5:5555", state: "offline" });
});

test("parseHdcTargetsOutput", () => {
  const rows = parseHdcTargetsOutput(`127.0.0.1:5555
FMR0223456001234    device
`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "127.0.0.1:5555");
  assert.equal(rows[1].state, "device");
});

test("pickDefaultDeviceId prefers authorized physical", () => {
  const id = pickDefaultDeviceId([
    { platform: "android", id: "emu", state: "device", authorized: true, kind: "emulator", source: "t" },
    { platform: "android", id: "phone", state: "device", authorized: true, kind: "physical", source: "t" }
  ]);
  assert.equal(id, "phone");
});

test("mergeDeviceScan sets defaults and preserves firstSeenAt", () => {
  const base = createEmptyDeviceRegistry(["lab"]);
  base.devices.push({
    platform: "android",
    id: "old",
    state: "device",
    authorized: true,
    kind: "physical",
    source: "adb",
    firstSeenAt: "2020-01-01T00:00:00.000Z",
    lastSeenAt: "2020-01-01T00:00:00.000Z"
  });
  const merged = mergeDeviceScan(base, {
    scannedAt: "2026-01-02T00:00:00.000Z",
    android: [
      {
        platform: "android",
        id: "old",
        state: "device",
        authorized: true,
        kind: "physical",
        source: "adb devices",
        model: "Pixel"
      },
      {
        platform: "android",
        id: "new",
        state: "unauthorized",
        authorized: false,
        kind: "physical",
        source: "adb devices"
      }
    ],
    ios: [],
    harmony: [],
    errors: []
  });
  assert.equal(merged.defaults.android, "old");
  assert.equal(merged.devices.find((d) => d.id === "old")?.firstSeenAt, "2020-01-01T00:00:00.000Z");
  assert.equal(merged.devices.find((d) => d.id === "old")?.model, "Pixel");
  assert.deepEqual(merged.deviceTags, ["lab"]);
});

test("registryToDeviceListRows formats display columns", () => {
  const rows = registryToDeviceListRows({
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    defaults: { android: "phone1" },
    devices: [
      {
        platform: "android",
        id: "phone1",
        state: "device",
        authorized: true,
        label: "Pixel 8",
        sdkVersion: "34",
        osVersion: "14",
        screenWidth: 1080,
        screenHeight: 2400,
        kind: "physical",
        source: "adb",
        firstSeenAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z"
      }
    ]
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deviceName, "Pixel 8");
  assert.equal(rows[0].deviceId, "phone1");
  assert.equal(rows[0].resolution, "1080×2400");
  assert.equal(rows[0].systemCategory, "Android");
  assert.match(rows[0].sdkInfo, /API 34/);
  assert.match(rows[0].sdkInfo, /Android 14/);
  assert.equal(rows[0].isDefault, true);
});
