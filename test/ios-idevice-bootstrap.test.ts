import test from "node:test";
import assert from "node:assert/strict";
import { ideviceBootstrapEnabled, probeIosIdeviceRuntime } from "../packages/runtime-probe/src/ios-idevice-probe.js";
import { ensureIosIdeviceBootstrap } from "../packages/install-deps/src/ios-idevice-bootstrap.js";
import { isIosFullInstallScope } from "../packages/install-deps/src/platform-support.js";

test("ideviceBootstrapEnabled respects ADA_IOS_IDEVICE_BOOTSTRAP", () => {
  const prev = process.env.ADA_IOS_IDEVICE_BOOTSTRAP;
  try {
    process.env.ADA_IOS_IDEVICE_BOOTSTRAP = "1";
    assert.equal(ideviceBootstrapEnabled(), true);
    process.env.ADA_IOS_IDEVICE_BOOTSTRAP = "0";
    assert.equal(ideviceBootstrapEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.ADA_IOS_IDEVICE_BOOTSTRAP;
    else process.env.ADA_IOS_IDEVICE_BOOTSTRAP = prev;
  }
});

test("probeIosIdeviceRuntime on non-darwin reports host unsupported", async () => {
  if (process.platform === "darwin") {
    const probe = await probeIosIdeviceRuntime();
    assert.equal(probe.hostSupported, true);
    assert.equal(typeof probe.ideviceinstallerOk, "boolean");
    return;
  }
  const probe = await probeIosIdeviceRuntime();
  assert.equal(probe.hostSupported, false);
  assert.equal(probe.ideviceinstallerOk, false);
});

test("isIosFullInstallScope matches ios and all only", () => {
  assert.equal(isIosFullInstallScope("ios"), true);
  assert.equal(isIosFullInstallScope("all"), true);
  assert.equal(isIosFullInstallScope("playwright"), false);
  assert.equal(isIosFullInstallScope("mobile"), false);
});

test("ensureIosIdeviceBootstrap without flag stays skipped/missing", async () => {
  const prev = process.env.ADA_IOS_IDEVICE_BOOTSTRAP;
  try {
    delete process.env.ADA_IOS_IDEVICE_BOOTSTRAP;
    const { outcome } = await ensureIosIdeviceBootstrap();
    if (process.platform !== "darwin") {
      assert.equal(outcome.id, "ios-idevice");
      assert.equal(outcome.status, "missing");
      return;
    }
    if (outcome.status === "skipped") {
      assert.match(String(outcome.detail), /ideviceinstaller on PATH|bootstrap disabled/);
    }
  } finally {
    if (prev === undefined) delete process.env.ADA_IOS_IDEVICE_BOOTSTRAP;
    else process.env.ADA_IOS_IDEVICE_BOOTSTRAP = prev;
  }
});
