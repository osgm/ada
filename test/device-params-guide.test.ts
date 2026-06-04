import test from "node:test";
import assert from "node:assert/strict";
import { buildDeviceParamsGuide, type DeviceRegistry } from "@ada/runtime-probe";

function registry(devices: DeviceRegistry["devices"], defaults?: DeviceRegistry["defaults"]): DeviceRegistry {
  return {
    version: 1,
    lastScanAt: "2026-01-01T00:00:00.000Z",
    defaults: defaults ?? {},
    devices
  };
}

test("buildDeviceParamsGuide: android recommended with udid", () => {
  const guide = buildDeviceParamsGuide(
    registry([
      {
        platform: "android",
        id: "R28M30T7HFV",
        state: "device",
        authorized: true,
        kind: "physical",
        source: "adb"
      }
    ])
  );
  assert.ok(guide.recommended);
  assert.equal(guide.recommended.platform, "android");
  assert.equal(guide.recommended.adaMobileAction.platform, "android");
  assert.equal(guide.recommended.adaMobileAction.payload.capabilities.udid, "R28M30T7HFV");
  assert.match(guide.recommended.adaMobileAction.sessionId, /^ada-android-/);
  assert.equal(guide.byPlatform.android?.length, 1);
});

test("buildDeviceParamsGuide: harmony uses deviceSn", () => {
  const guide = buildDeviceParamsGuide(
    registry([
      {
        platform: "harmony",
        id: "2QS0224716026324",
        state: "device",
        authorized: true,
        kind: "physical",
        source: "hdc"
      }
    ])
  );
  assert.equal(guide.recommended?.platform, "harmony");
  assert.equal(guide.recommended?.adaMobileAction.payload.capabilities.deviceSn, "2QS0224716026324");
  assert.equal(guide.recommended?.adaMobileAction.payload.capabilities.udid, undefined);
  assert.ok(guide.harmonyLaunchApp);
  assert.equal(guide.harmonyLaunchApp?.args.payload.abilityId, "EntryAbility");
  assert.equal(guide.harmonyLaunchApp?.args.command, "launchApp");
  assert.ok(guide.rules.some((r) => r.includes("abilityId")));
});

test("buildDeviceParamsGuide: prefers default android over harmony", () => {
  const guide = buildDeviceParamsGuide(
    registry(
      [
        {
          platform: "harmony",
          id: "2QS0224716026324",
          state: "device",
          authorized: true,
          kind: "physical",
          source: "hdc"
        },
        {
          platform: "android",
          id: "R28M30T7HFV",
          state: "device",
          authorized: true,
          kind: "physical",
          source: "adb"
        }
      ],
      { android: "R28M30T7HFV", harmony: "2QS0224716026324" }
    )
  );
  assert.equal(guide.recommended?.deviceId, "R28M30T7HFV");
  assert.equal(guide.recommended?.isDefault, true);
});

test("buildDeviceParamsGuide: empty registry", () => {
  const guide = buildDeviceParamsGuide(null);
  assert.equal(guide.recommended, undefined);
  assert.deepEqual(guide.byPlatform, {});
  assert.ok(guide.rules.some((r) => r.includes("No authorized device")));
});
