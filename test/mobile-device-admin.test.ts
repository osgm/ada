import assert from "node:assert/strict";
import test from "node:test";
import { parseAndroidCurrentApp, parsePackageList, readDeviceAdminAction } from "@ada/driver-rpc";

test("readDeviceAdminAction aliases", () => {
  assert.equal(readDeviceAdminAction({ action: "appList" }), "listApps");
  assert.equal(readDeviceAdminAction({ action: "install", appId: "com.a" }), "installApp");
  assert.equal(readDeviceAdminAction({ action: "push", localPath: "/a" }), "pushFile");
});

test("parsePackageList", () => {
  const pkgs = parsePackageList("package:com.foo\npackage:com.bar\n");
  assert.deepEqual(pkgs, ["com.foo", "com.bar"]);
});

test("parseAndroidCurrentApp", () => {
  const info = parseAndroidCurrentApp(
    "mCurrentFocus=Window{abc u0 com.jd.app/com.jd.MainActivity}"
  );
  assert.equal(info?.appId, "com.jd.app");
});
