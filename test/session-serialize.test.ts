import assert from "node:assert/strict";
import test from "node:test";
import type { CommandEnvelope, CommandResult, PluginManifest } from "@ada/contracts";
import { TaskExecutor } from "@ada/core-kernel";
import type { PluginHost } from "@ada/plugin-host";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";

function makeHost(plugin: DriverPlugin): PluginHost {
  return {
    resolve() {
      return plugin;
    },
    async ensureInitialized() {
      return undefined;
    }
  } as unknown as PluginHost;
}

test("TaskExecutor serializes concurrent writes on the same session", async () => {
  const order: string[] = [];
  let active = 0;
  let maxActive = 0;

  const session: DriverSession = { id: "drv-1", platform: "web" };
  const manifest: PluginManifest = {
    id: "test-web",
    version: "0.0.0",
    platforms: ["web"],
    capabilities: ["click"],
    engine: "playwright"
  };
  const plugin: DriverPlugin = {
    manifest,
    async createSession() {
      return session;
    },
    async execute(_session, command) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`start:${command.requestId}`);
      await new Promise((resolve) => setTimeout(resolve, 40));
      order.push(`end:${command.requestId}`);
      active -= 1;
      return { requestId: command.requestId, success: true, data: {} } satisfies CommandResult;
    }
  };

  const executor = new TaskExecutor(makeHost(plugin), { maxAttempts: 1 });
  const base: Omit<CommandEnvelope, "requestId"> = {
    sessionId: "shared",
    platform: "web",
    command: "click",
    payload: { locator: { text: "ok" } }
  };

  const results = await Promise.all([
    executor.execute({ ...base, requestId: "a" }),
    executor.execute({ ...base, requestId: "b" }),
    executor.execute({ ...base, requestId: "c" })
  ]);

  assert.ok(results.every((item) => item.success), JSON.stringify(results));
  assert.equal(maxActive, 1);
  assert.equal(order.length, 6);
  for (let i = 0; i < order.length; i += 2) {
    assert.match(order[i]!, /^start:/);
    assert.match(order[i + 1]!, /^end:/);
    assert.equal(order[i]!.slice("start:".length), order[i + 1]!.slice("end:".length));
  }
});

test("TaskExecutor rejects parallel web recipe on busy session (heavy whitelist)", async () => {
  const session: DriverSession = { id: "drv-recipe", platform: "web" };
  const plugin: DriverPlugin = {
    manifest: {
      id: "test-web-recipe-busy",
      version: "0.0.0",
      platforms: ["web"],
      capabilities: ["recipe", "click"],
      engine: "playwright"
    },
    async createSession() {
      return session;
    },
    async execute(_session, command) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { requestId: command.requestId, success: true, data: {} } satisfies CommandResult;
    }
  };

  const prevStart = process.env.ADA_WEB_SESSION_BUSY_ON_PARALLEL_START;
  const prevWrites = process.env.ADA_WEB_SESSION_BUSY_WRITES;
  delete process.env.ADA_WEB_SESSION_BUSY_ON_PARALLEL_START;
  delete process.env.ADA_WEB_SESSION_BUSY_WRITES;
  try {
    const executor = new TaskExecutor(makeHost(plugin), { maxAttempts: 1 });
    const [a, b] = await Promise.all([
      executor.execute({
        requestId: "rec-a",
        sessionId: "web-rec",
        platform: "web",
        command: "recipe",
        payload: { action: "clickPath", path: ["A"] }
      }),
      executor.execute({
        requestId: "rec-b",
        sessionId: "web-rec",
        platform: "web",
        command: "recipe",
        payload: { action: "clickPath", path: ["B"] }
      })
    ]);
    const busy = a.success ? b : a;
    assert.equal(busy.success, false);
    assert.equal(busy.errorCode, "SESSION_BUSY");
  } finally {
    if (prevStart === undefined) delete process.env.ADA_WEB_SESSION_BUSY_ON_PARALLEL_START;
    else process.env.ADA_WEB_SESSION_BUSY_ON_PARALLEL_START = prevStart;
    if (prevWrites === undefined) delete process.env.ADA_WEB_SESSION_BUSY_WRITES;
    else process.env.ADA_WEB_SESSION_BUSY_WRITES = prevWrites;
  }
});

test("TaskExecutor still queues parallel click by default (heavy mode)", async () => {
  let maxActive = 0;
  let active = 0;
  const session: DriverSession = { id: "drv-click", platform: "web" };
  const plugin: DriverPlugin = {
    manifest: {
      id: "test-web-click-queue",
      version: "0.0.0",
      platforms: ["web"],
      capabilities: ["click"],
      engine: "playwright"
    },
    async createSession() {
      return session;
    },
    async execute(_session, command) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active -= 1;
      return { requestId: command.requestId, success: true, data: {} } satisfies CommandResult;
    }
  };

  const prevWrites = process.env.ADA_WEB_SESSION_BUSY_WRITES;
  delete process.env.ADA_WEB_SESSION_BUSY_WRITES;
  try {
    const executor = new TaskExecutor(makeHost(plugin), { maxAttempts: 1 });
    const results = await Promise.all([
      executor.execute({
        requestId: "c1",
        sessionId: "web-click",
        platform: "web",
        command: "click",
        payload: { locator: { text: "a" } }
      }),
      executor.execute({
        requestId: "c2",
        sessionId: "web-click",
        platform: "web",
        command: "click",
        payload: { locator: { text: "b" } }
      })
    ]);
    assert.ok(results.every((r) => r.success));
    assert.equal(maxActive, 1);
  } finally {
    if (prevWrites === undefined) delete process.env.ADA_WEB_SESSION_BUSY_WRITES;
    else process.env.ADA_WEB_SESSION_BUSY_WRITES = prevWrites;
  }
});

test("TaskExecutor rejects parallel web navigate on busy session with SESSION_BUSY", async () => {
  const session: DriverSession = { id: "drv-busy", platform: "web" };
  const manifest: PluginManifest = {
    id: "test-web-busy",
    version: "0.0.0",
    platforms: ["web"],
    capabilities: ["navigate"],
    engine: "playwright"
  };
  const plugin: DriverPlugin = {
    manifest,
    async createSession() {
      return session;
    },
    async execute(_session, command) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { requestId: command.requestId, success: true, data: {} } satisfies CommandResult;
    }
  };

  const prev = process.env.ADA_WEB_SESSION_BUSY_ON_PARALLEL_START;
  delete process.env.ADA_WEB_SESSION_BUSY_ON_PARALLEL_START;
  try {
    const executor = new TaskExecutor(makeHost(plugin), { maxAttempts: 1 });
    const base: Omit<CommandEnvelope, "requestId"> = {
      sessionId: "web-shared",
      platform: "web",
      command: "navigate",
      payload: { url: "https://example.com" }
    };
    const [a, b] = await Promise.all([
      executor.execute({ ...base, requestId: "nav-a" }),
      executor.execute({ ...base, requestId: "nav-b" })
    ]);
    const ok = a.success ? a : b;
    const busy = a.success ? b : a;
    assert.equal(ok.success, true);
    assert.equal(busy.success, false);
    assert.equal(busy.errorCode, "SESSION_BUSY");
    assert.equal((busy.data as { sessionBusy?: boolean })?.sessionBusy, true);
    assert.match(String((busy.data as { suggestedSessionId?: string })?.suggestedSessionId ?? ""), /^web-shared-r/);
  } finally {
    if (prev === undefined) delete process.env.ADA_WEB_SESSION_BUSY_ON_PARALLEL_START;
    else process.env.ADA_WEB_SESSION_BUSY_ON_PARALLEL_START = prev;
  }
});

test("TaskExecutor serializes different mobile sessionIds on the same device", async () => {
  let active = 0;
  let maxActive = 0;
  const session: DriverSession = { id: "drv-android", platform: "android" };
  const plugin: DriverPlugin = {
    manifest: {
      id: "test-android-device-gate",
      version: "0.0.0",
      platforms: ["android"],
      capabilities: ["click", "screenshot"],
      engine: "appium"
    },
    async createSession() {
      return session;
    },
    async execute(_session, command) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 50));
      active -= 1;
      return { requestId: command.requestId, success: true, data: {} } satisfies CommandResult;
    }
  };

  const prev = process.env.ADA_MOBILE_DEVICE_SERIALIZE;
  delete process.env.ADA_MOBILE_DEVICE_SERIALIZE;
  try {
    const executor = new TaskExecutor(makeHost(plugin), { maxAttempts: 1 });
    const payload = { capabilities: { udid: "emulator-5554" } };
    const results = await Promise.all([
      executor.execute({
        requestId: "m1",
        sessionId: "mobile-a",
        platform: "android",
        command: "click",
        payload
      }),
      executor.execute({
        requestId: "m2",
        sessionId: "mobile-b",
        platform: "android",
        command: "screenshot",
        payload
      })
    ]);
    assert.ok(results.every((r) => r.success));
    assert.equal(maxActive, 1);
  } finally {
    if (prev === undefined) delete process.env.ADA_MOBILE_DEVICE_SERIALIZE;
    else process.env.ADA_MOBILE_DEVICE_SERIALIZE = prev;
  }
});

test("TaskExecutor allows parallel mobile ops on different devices", async () => {
  let active = 0;
  let maxActive = 0;
  const session: DriverSession = { id: "drv-android-2", platform: "android" };
  const plugin: DriverPlugin = {
    manifest: {
      id: "test-android-multi-device",
      version: "0.0.0",
      platforms: ["android"],
      capabilities: ["click"],
      engine: "appium"
    },
    async createSession() {
      return session;
    },
    async execute(_session, command) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active -= 1;
      return { requestId: command.requestId, success: true, data: {} } satisfies CommandResult;
    }
  };

  const prev = process.env.ADA_MOBILE_DEVICE_SERIALIZE;
  delete process.env.ADA_MOBILE_DEVICE_SERIALIZE;
  try {
    const executor = new TaskExecutor(makeHost(plugin), { maxAttempts: 1 });
    const results = await Promise.all([
      executor.execute({
        requestId: "d1",
        sessionId: "s1",
        platform: "android",
        command: "click",
        payload: { capabilities: { udid: "dev-1" } }
      }),
      executor.execute({
        requestId: "d2",
        sessionId: "s2",
        platform: "android",
        command: "click",
        payload: { capabilities: { udid: "dev-2" } }
      })
    ]);
    assert.ok(results.every((r) => r.success));
    assert.equal(maxActive, 2);
  } finally {
    if (prev === undefined) delete process.env.ADA_MOBILE_DEVICE_SERIALIZE;
    else process.env.ADA_MOBILE_DEVICE_SERIALIZE = prev;
  }
});

test("TaskExecutor allows concurrent read-only commands on the same session", async () => {
  let active = 0;
  let maxActive = 0;

  const session: DriverSession = { id: "drv-2", platform: "web" };
  const manifest: PluginManifest = {
    id: "test-web-ro",
    version: "0.0.0",
    platforms: ["web"],
    capabilities: ["wait", "screenshot"],
    engine: "playwright"
  };
  const plugin: DriverPlugin = {
    manifest,
    async createSession() {
      return session;
    },
    async execute(_session, command) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 50));
      active -= 1;
      return { requestId: command.requestId, success: true, data: {} } satisfies CommandResult;
    }
  };

  const prev = process.env.ADA_SESSION_SERIALIZE_ALL;
  delete process.env.ADA_SESSION_SERIALIZE_ALL;
  try {
    const executor = new TaskExecutor(makeHost(plugin), { maxAttempts: 1 });
    const results = await Promise.all([
      executor.execute({
        requestId: "r1",
        sessionId: "shared-ro",
        platform: "web",
        command: "wait",
        payload: { ms: 1 }
      }),
      executor.execute({
        requestId: "r2",
        sessionId: "shared-ro",
        platform: "web",
        command: "screenshot",
        payload: {}
      }),
      executor.execute({
        requestId: "r3",
        sessionId: "shared-ro",
        platform: "web",
        command: "wait",
        payload: { ms: 1 }
      })
    ]);
    assert.ok(results.every((item) => item.success));
    assert.ok(maxActive >= 2, `expected parallel reads, maxActive=${maxActive}`);
  } finally {
    if (prev === undefined) delete process.env.ADA_SESSION_SERIALIZE_ALL;
    else process.env.ADA_SESSION_SERIALIZE_ALL = prev;
  }
});
