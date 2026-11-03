import assert from "node:assert/strict";
import test from "node:test";
import type { CommandEnvelope, CommandResult, PluginManifest } from "@ada/contracts";
import { TaskExecutor } from "@ada/core-kernel";
import type { PluginHost } from "@ada/plugin-host";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";

test("TaskExecutor serializes concurrent commands on the same session", async () => {
  const order: string[] = [];
  let active = 0;
  let maxActive = 0;

  const session: DriverSession = { id: "drv-1", platform: "web" };
  const manifest: PluginManifest = {
    id: "test-web",
    version: "0.0.0",
    platforms: ["web"],
    capabilities: ["wait"],
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

  const host = {
    resolve() {
      return plugin;
    },
    async ensureInitialized() {
      return undefined;
    }
  } as unknown as PluginHost;

  const executor = new TaskExecutor(host, { maxAttempts: 1 });
  const base: Omit<CommandEnvelope, "requestId"> = {
    sessionId: "shared",
    platform: "web",
    command: "wait",
    payload: { ms: 1 }
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
