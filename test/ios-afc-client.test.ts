import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAfcClientArgs,
  parseIosRemotePath,
  resolveIosDeviceUdid
} from "../plugins/driver-ios/src/ios-afc-client.js";

test("parseIosRemotePath: documents container", () => {
  const r = parseIosRemotePath("@com.example.app:documents/logs/app.log");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.parsed.bundleId, "com.example.app");
  assert.equal(r.parsed.container, "documents");
  assert.equal(r.parsed.devicePath, "logs/app.log");
});

test("parseIosRemotePath: container scope", () => {
  const r = parseIosRemotePath("@com.example.app:container/tmp/x.dat");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.parsed.container, "container");
  assert.equal(r.parsed.devicePath, "tmp/x.dat");
});

test("parseIosRemotePath: shorthand bundle path defaults to documents", () => {
  const r = parseIosRemotePath("@com.example.app:notes.txt");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.parsed.container, "documents");
  assert.equal(r.parsed.devicePath, "notes.txt");
});

test("parseIosRemotePath: plain path uses fallback bundleId", () => {
  const r = parseIosRemotePath("artifacts/out.png", "com.example.app");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.parsed.bundleId, "com.example.app");
  assert.equal(r.parsed.devicePath, "artifacts/out.png");
});

test("parseIosRemotePath: plain path without bundle uses AFC root", () => {
  const r = parseIosRemotePath("DCIM/100APPLE/IMG.jpg");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.parsed.container, "afc");
  assert.equal(r.parsed.devicePath, "DCIM/100APPLE/IMG.jpg");
});

test("buildAfcClientArgs: put with documents", () => {
  const args = buildAfcClientArgs({
    udid: "UDID-1",
    parsed: { bundleId: "com.a", container: "documents", devicePath: "f.txt" },
    verb: "put",
    localPath: "/tmp/f.txt"
  });
  assert.deepEqual(args, ["-u", "UDID-1", "--documents", "com.a", "put", "/tmp/f.txt", "f.txt"]);
});

test("buildAfcClientArgs: get without bundle uses AFC", () => {
  const args = buildAfcClientArgs({
    parsed: { container: "afc", devicePath: "DCIM/x.jpg" },
    verb: "get",
    localPath: "/tmp/x.jpg"
  });
  assert.deepEqual(args, ["get", "DCIM/x.jpg", "/tmp/x.jpg"]);
});

test("resolveIosDeviceUdid prefers capabilities.udid", () => {
  const prev = process.env.ADA_IOS_DEVICE_UDID;
  process.env.ADA_IOS_DEVICE_UDID = "ENV-UDID";
  try {
    assert.equal(resolveIosDeviceUdid({ capabilities: { udid: "CAP-UDID" } }), "CAP-UDID");
    assert.equal(resolveIosDeviceUdid({}), "ENV-UDID");
  } finally {
    if (prev === undefined) delete process.env.ADA_IOS_DEVICE_UDID;
    else process.env.ADA_IOS_DEVICE_UDID = prev;
  }
});
