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
