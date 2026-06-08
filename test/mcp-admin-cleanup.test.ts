import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  guardWebCommandIfNeeded,
  handleCloseAllSessions,
  handleRunTaskFile,
  recordWebCommandIfNeeded
} from "@ada-mcp/mcp-server/testing";

function mcpTextResult(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

describe("mcp-admin cleanup", () => {
  it("handleCloseAllSessions clears web action ledgers", async () => {
    const sessionId = "close-all-ledger";
    const payload = { locator: { css: "#menu-item" } };
    const ok: CommandResult = { requestId: "r1", success: true, data: {} };
    for (let i = 0; i < 3; i += 1) {
      guardWebCommandIfNeeded("web", sessionId, "click", payload);
      recordWebCommandIfNeeded("web", sessionId, "click", payload, ok);
    }

    const out = await handleCloseAllSessions({
      closeAllSessions: async () => 2,
      mcpTextResult
    });
    const data = JSON.parse(out.content[0].text) as Record<string, unknown>;
    assert.equal(data.status, "ok");
    assert.equal(data.closed, 2);

    assert.doesNotThrow(() => guardWebCommandIfNeeded("web", sessionId, "click", payload));
  });
});

describe("handleRunTaskFile ledger", () => {
  it("guards repeated web clicks across task steps", async () => {
    const clickTask = (index: number): CommandEnvelope => ({
      requestId: `t-${index}`,
      sessionId: "task-ledger",
      platform: "web",
      command: "click",
      payload: { locator: { css: "#same" } }
    });
    const tasks = [clickTask(1), clickTask(2), clickTask(3), clickTask(4)];
    let runCount = 0;

    await assert.rejects(
      () =>
        handleRunTaskFile(
          { file: "demo.tasks.json" },
          {
            resolveTaskPath: (file) => file,
            loadTaskFile: async () => tasks,
            runCommand: async () => {
              runCount += 1;
              return { requestId: `r-${runCount}`, success: true, data: {} };
            },
            parseMonitorOptions: () => ({}),
            runMonitorCapture: () => undefined,
            allowMock: () => false,
            assertRealResult: () => undefined,
            mcpTextResult,
            buildRecoveryHint: () => ""
          }
        ),
      /ACTION_TOGGLE_LOOP|repeated action/
    );
    assert.equal(runCount, 3);
  });
});
