import assert from "node:assert/strict";
import test from "node:test";
import type { CommandResult } from "@ada/contracts";
import {
  executeInboundPlan,
  planInboundCommands
} from "../packages/agent-core/src/inbound-command.ts";

test("semantic verbs: goto text and css input share one session", () => {
  const plan = planInboundCommands({
    requestId: "task-1",
    action: "ada_batch_actions",
    payload: {
      platform: "web",
      sessionId: "qa-9-web",
      actions: [
        { action: "goto", url: "https://example.com" },
        { action: "click", selector: "登录" },
        { action: "input", selector: "#q", text: "ada" }
      ]
    }
  });
  assert.equal(plan.ok, true);
  if (!plan.ok || plan.kind !== "commands") return;
  assert.equal(plan.commands.length, 3);
  assert.equal(plan.commands[0]?.command, "navigate");
  assert.equal(plan.commands[0]?.payload?.url, "https://example.com");
  assert.equal(plan.commands[1]?.command, "click");
  assert.deepEqual(plan.commands[1]?.payload?.locator, { text: "登录" });
  assert.equal(plan.commands[1]?.payload?.selector, undefined);
  assert.equal(plan.commands[2]?.command, "type");
  assert.deepEqual(plan.commands[2]?.payload?.locator, { css: "#q" });
  assert.equal(plan.commands[2]?.payload?.text, "ada");
  for (const command of plan.commands) {
    assert.equal(command.sessionId, "qa-9-web");
    assert.equal(command.platform, "web");
  }
});

test("web recipe fill_search stays recipe", () => {
  const plan = planInboundCommands({
    requestId: "task-2",
    action: "ada_web_recipe",
    payload: { action: "fill_search", text: "手机", sessionId: "s" }
  });
  assert.equal(plan.ok, true);
  if (!plan.ok || plan.kind !== "commands") return;
  assert.equal(plan.commands[0]?.command, "recipe");
  assert.equal(plan.commands[0]?.payload?.action, "fill_search");
  assert.equal(plan.commands[0]?.platform, "web");
});

test("mobile input maps to type on the given platform", () => {
  const plan = planInboundCommands({
    requestId: "task-3",
    action: "ada_mobile_action",
    payload: { action: "input", selector: "搜索", text: "hi", platform: "harmony" }
  });
  assert.equal(plan.ok, true);
  if (!plan.ok || plan.kind !== "commands") return;
  assert.equal(plan.commands[0]?.platform, "harmony");
  assert.equal(plan.commands[0]?.command, "type");
  assert.equal(plan.commands[0]?.sessionId, "control-harmony");
  assert.deepEqual(plan.commands[0]?.payload?.locator, { text: "搜索" });
});

test("meta actions are not executed as UI commands", () => {
  const plan = planInboundCommands({ requestId: "hb", action: "ada_heartbeat", payload: {} });
  assert.deepEqual(plan, { ok: true, kind: "meta" });
});

test("batch stops on first failure and skips the rest", async () => {
  const plan = planInboundCommands({
    requestId: "batch",
    action: "ada_batch_actions",
    timeoutMs: 20_000,
    payload: {
      actions: [{ action: "click", selector: "#a" }, { action: "click", selector: "#b" }]
    }
  });
  const seen: string[] = [];
  const response = await executeInboundPlan(plan.ok ? { requestId: "batch", action: "ada_batch_actions", timeoutMs: 20_000 } : { requestId: "batch", action: "x" }, plan, async (command) => {
    seen.push(command.command);
    const result: CommandResult = {
      requestId: command.requestId,
      success: false,
      errorCode: "NOT_FOUND",
      errorMessage: "missing"
    };
    return result;
  });
  assert.deepEqual(seen, ["click"]);
  assert.equal(response.success, false);
  assert.match(response.error ?? "", /step 1 failed/);
  assert.equal(response.payload?.failedIndex, 0);
  assert.match(String(response.payload?.summary ?? ""), /failed at step 1/);
  assert.ok(Array.isArray(response.payload?.executed));
});

test("inbound budget reuses remaining wall time for later steps", async () => {
  const plan = planInboundCommands({
    requestId: "budget",
    action: "ada_batch_actions",
    timeoutMs: 12_000,
    payload: {
      actions: [
        { action: "click", selector: "#a" },
        { action: "click", selector: "#b" },
        { action: "click", selector: "#c" }
      ]
    }
  });
  assert.equal(plan.ok, true);
  if (!plan.ok || plan.kind !== "commands") return;

  const timeouts: number[] = [];
  await executeInboundPlan({ requestId: "budget", action: "ada_batch_actions", timeoutMs: 12_000 }, plan, async (command) => {
    timeouts.push(Number(command.payload?.commandTimeoutMs));
    return { requestId: command.requestId, success: true, data: {} };
  });

  assert.equal(timeouts.length, 3);
  // 旧均等切分约为 (12000-2000)/3 ≈ 3333；剩余预算应接近整段墙钟且逐步略减。
  assert.ok(timeouts[0]! >= 9_000, `expected first step to receive remaining budget, got ${timeouts[0]}`);
  assert.ok(timeouts[0]! <= 10_000);
  assert.ok(timeouts[2]! <= timeouts[0]!);
  assert.ok(timeouts.every((ms) => ms >= 3_000 && ms <= 30_000));
});
