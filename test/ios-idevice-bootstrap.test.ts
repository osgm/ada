import test from "node:test";
import assert from "node:assert/strict";
import { ensureIosIdeviceBootstrap, isIosFullInstallScope } from "@ada/install-deps";
import { ideviceBootstrapEnabled, probeIosIdeviceRuntime } from "@ada/runtime-probe";

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

test("probeIosIdeviceRuntime reflects host OS support", async () => {
  const probe = await probeIosIdeviceRuntime();
  if (process.platform === "darwin" || process.platform === "win32") {
    assert.equal(probe.hostSupported, true);
    assert.equal(typeof probe.ideviceinstallerOk, "boolean");
    return;
  }
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
    if (process.platform !== "darwin" && process.platform !== "win32") {
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
