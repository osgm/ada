import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePluginInstallScope,
  shouldAutoRepairPluginDeps
} from "@ada/install-deps";
import { PluginHost } from "@ada/plugin-host";
import type { DriverPlugin } from "@ada/plugin-sdk";

test("resolvePluginInstallScope maps engines and ids", () => {
  assert.equal(resolvePluginInstallScope("driver-playwright"), "playwright");
  assert.equal(resolvePluginInstallScope("playwright"), "playwright");
  assert.equal(resolvePluginInstallScope("driver-android"), "android");
  assert.equal(resolvePluginInstallScope("driver-ios"), "ios");
  assert.equal(resolvePluginInstallScope("driver-harmony"), "harmony");
  assert.equal(resolvePluginInstallScope("unknown-x"), null);
});

test("shouldAutoRepairPluginDeps respects ADA_PLUGIN_AUTO_INSTALL_DEPS=0", () => {
  const prev = process.env.ADA_PLUGIN_AUTO_INSTALL_DEPS;
  process.env.ADA_PLUGIN_AUTO_INSTALL_DEPS = "0";
  try {
    assert.equal(shouldAutoRepairPluginDeps(), false);
  } finally {
    if (prev === undefined) delete process.env.ADA_PLUGIN_AUTO_INSTALL_DEPS;
    else process.env.ADA_PLUGIN_AUTO_INSTALL_DEPS = prev;
  }
});

test("PluginHost ensureInitialized runs depsGate before init", async () => {
  const order: string[] = [];
  const plugin: DriverPlugin = {
    manifest: {
      id: "driver-test",
      version: "0.1.0",
      platforms: ["web"],
      capabilities: ["navigate"],
      engine: "playwright"
    },
    async init() {
      order.push("init");
    },
    async createSession() {
      return { id: "s", platform: "web" };
    },
    async execute() {
      return { requestId: "r", success: true };
    },
    async dispose() {
      order.push("dispose");
    }
  };

  const host = new PluginHost({
    depsGate: async () => {
      order.push("gate");
    },
    onStopped: () => {
      order.push("stopped");
    }
  });
  host.register(plugin);
  await host.ensureInitialized("driver-test");
  assert.deepEqual(order, ["gate", "init"]);
  assert.equal(host.isInitialized("driver-test"), true);

  await host.disposePlugin("driver-test");
  assert.deepEqual(order, ["gate", "init", "dispose", "stopped"]);
  assert.equal(host.isInitialized("driver-test"), false);

  // restart must pass gate again
  await host.ensureInitialized("driver-test");
  assert.deepEqual(order, ["gate", "init", "dispose", "stopped", "gate", "init"]);
});

test("PluginHost ensureInitialized fails when depsGate throws", async () => {
  const plugin: DriverPlugin = {
    manifest: {
      id: "driver-fail",
      version: "0.1.0",
      platforms: ["android"],
      capabilities: ["click"],
      engine: "android"
    },
    async init() {
      throw new Error("should not init");
    },
    async createSession() {
      return { id: "s", platform: "android" };
    },
    async execute() {
      return { requestId: "r", success: true };
    },
    async dispose() {}
  };
  const host = new PluginHost({
    depsGate: async () => {
      throw new Error("deps missing");
    }
  });
  host.register(plugin);
  await assert.rejects(() => host.ensureInitialized("driver-fail"), /deps missing/);
  assert.equal(host.isInitialized("driver-fail"), false);
});
