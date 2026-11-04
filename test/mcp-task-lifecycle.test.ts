import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateTaskIds,
  clearAllTasks,
  getTaskById,
  getTaskBySession,
  handleBeginTask,
  handleEndTask,
  listRegisteredTasks,
  unregisterTask
} from "../apps/ada-mcp-server/src/mcp-task-lifecycle.ts";
import { handleSessions } from "../apps/ada-mcp-server/src/mcp-admin.ts";
import { clearReleasedSession, getReleasedSession } from "../apps/ada-mcp-server/src/mcp-released-sessions.ts";

test("allocateTaskIds uses sanitized prefix", () => {
  const a = allocateTaskIds({ platform: "web", prefix: "CI Job 42!" });
  assert.match(a.prefix, /^ci-job-42$/);
  assert.match(a.sessionId, /^ci-job-42-/);
  assert.match(a.taskId, /^task-ci-job-42-/);
});

test("handleBeginTask registers task and returns next navigate hint", () => {
  clearAllTasks();
  const out = handleBeginTask(
    { platform: "web", prefix: "pet" },
    {
      normalizePlatform: () => "web",
      mcpTextResult: (data) => data
    }
  ) as Record<string, unknown>;
  assert.equal(out.status, "ok");
  assert.equal(out.recommended, true);
  assert.equal(typeof out.sessionId, "string");
  assert.equal(typeof out.taskId, "string");
  assert.deepEqual(out.next, {
    tool: "ada_web_action",
    command: "navigate",
    sessionId: out.sessionId
  });
  assert.ok(getTaskById(String(out.taskId)));
  assert.ok(getTaskBySession("web", String(out.sessionId)));
  clearAllTasks();
});

test("handleEndTask closes session, marks released, unregisters task", async () => {
  clearAllTasks();
  clearReleasedSession();
  const begun = handleBeginTask(
    { platform: "web", prefix: "endme" },
    {
      normalizePlatform: () => "web",
      mcpTextResult: (data) => data
    }
  ) as { taskId: string; sessionId: string };

  let closedArgs: Record<string, unknown> | undefined;
  const out = (await handleEndTask(
    { taskId: begun.taskId },
    {
      normalizePlatform: () => "web",
      mergeWebEngineIntoPayload: (args) => args,
      closeSession: async (platform, sessionId) => {
        closedArgs = { platform, sessionId };
        return true;
      },
      mcpTextResult: (data) => data
    }
  )) as Record<string, unknown>;

  assert.equal(out.ended, true);
  assert.equal(out.closed, true);
  assert.deepEqual(closedArgs, { platform: "web", sessionId: begun.sessionId });
  assert.equal(getTaskById(begun.taskId), undefined);
  assert.ok(getReleasedSession("web", begun.sessionId));
  clearReleasedSession();
  clearAllTasks();
});

test("handleSessions includes tasks from begin_task", () => {
  clearAllTasks();
  handleBeginTask(
    { platform: "web", prefix: "list" },
    {
      normalizePlatform: () => "web",
      mcpTextResult: (data) => data
    }
  );
  const out = handleSessions({
    listActiveSessions: () => [],
    mcpTextResult: (data) => data
  }) as { tasks: unknown[] };
  assert.equal(listRegisteredTasks().length, 1);
  assert.equal(out.tasks.length, 1);
  clearAllTasks();
});

test("unregisterTask is idempotent", () => {
  clearAllTasks();
  assert.equal(unregisterTask("missing"), undefined);
});
