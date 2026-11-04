import test from "node:test";
import assert from "node:assert/strict";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { handleWebAssertions } from "../apps/ada-mcp-server/src/mcp-assertions.ts";

function okEval(value: unknown): CommandResult {
  return { requestId: "r", success: true, data: { value } };
}

test("ada_assertions title / count / attribute / notVisible", async () => {
  const calls: string[] = [];
  const deps = {
    runCommand: async (command: CommandEnvelope) => {
      calls.push(command.command);
      if (command.command === "custom") {
        const script = String((command.payload as { script?: string })?.script ?? "");
        if (script.includes("document.title")) return okEval("Pet HIS");
        if (script.includes("querySelectorAll")) return okEval(3);
        if (script.includes("getAttribute")) return okEval("submit");
        return okEval(null);
      }
      if (command.command === "assertVisible") {
        return { requestId: "r", success: false, errorCode: "LOCATOR_NOT_FOUND" };
      }
      return { requestId: "r", success: true, data: {} };
    },
    toCommandEnvelope: (input: Record<string, unknown>) => input as unknown as CommandEnvelope,
    allowMock: () => false,
    ensureRiskAllowed: () => undefined,
    assertRealResult: () => undefined,
    wrapAssertionResult: (input: {
      type: string;
      pass: boolean;
      details: Record<string, unknown>;
    }) => input
  };

  const title = (await handleWebAssertions(
    { sessionId: "s", type: "title", payload: { expectedTitle: "Pet" } },
    deps
  )) as { pass: boolean; type: string };
  assert.equal(title.type, "title");
  assert.equal(title.pass, true);

  const count = (await handleWebAssertions(
    { sessionId: "s", type: "count", payload: { css: ".row", expectedCount: 3 } },
    deps
  )) as { pass: boolean; details: { actualCount: number } };
  assert.equal(count.pass, true);
  assert.equal(count.details.actualCount, 3);

  const attr = (await handleWebAssertions(
    {
      sessionId: "s",
      type: "attribute",
      payload: { css: "button", attribute: "type", expected: "submit" }
    },
    deps
  )) as { pass: boolean };
  assert.equal(attr.pass, true);

  const notVisible = (await handleWebAssertions(
    { sessionId: "s", type: "notVisible", payload: { locator: { text: "gone" } } },
    deps
  )) as { pass: boolean };
  assert.equal(notVisible.pass, true);
  assert.ok(calls.includes("custom"));
  assert.ok(calls.includes("assertVisible"));
});
