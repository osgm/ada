import assert from "node:assert/strict";
import test from "node:test";
import { classifyStreamMessage } from "@ada/transport-stream";

test("pending requestId is a response even if action is present", () => {
  const route = classifyStreamMessage(
    { requestId: "out-1", action: "ada_heartbeat", success: true, payload: { heartbeat: true } },
    (id) => id === "out-1"
  );
  assert.equal(route.kind, "response");
  if (route.kind !== "response") return;
  assert.equal(route.response.success, true);
});

test("control-plane push without success is inbound", () => {
  const route = classifyStreamMessage(
    {
      requestId: "task-1",
      action: "ada_web_action",
      payload: { action: "goto", url: "https://example.com" },
      timeoutMs: 45000
    },
    () => false
  );
  assert.equal(route.kind, "inbound");
  if (route.kind !== "inbound") return;
  assert.equal(route.request.action, "ada_web_action");
  assert.equal(route.request.timeoutMs, 45000);
});

test("welcome frame is ignored", () => {
  const route = classifyStreamMessage(
    { requestId: "welcome-1", success: true, payload: { message: "ada-control connected" } },
    () => false
  );
  assert.equal(route.kind, "ignore");
});
