import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { normalizeRecipeAction } from "@ada/driver-rpc";
import { guardWebCommandIfNeeded, recordWebCommandIfNeeded } from "./mcp-action-ledger.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export async function handleWebRecipe(
  args: Record<string, unknown>,
  deps: {
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
    allowMock: (args: Record<string, unknown>) => boolean;
    ensureWebRuntimeReady: () => Promise<void>;
    ensureSessionActive: (platform: "web", sessionId: string, command: string) => Promise<void>;
    ensureWebPageReady?: (sessionId: string, command: string) => Promise<void>;
    runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
    assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
    wrapCommandToolResult: (input: { tool: string; envelope: CommandEnvelope; result: CommandResult }) => any;
  }
): Promise<any> {
  const action = String(args.action ?? "").trim();
  if (!action) {
    throw new Error("ada_web_recipe requires action");
  }
  const normalizedAction = normalizeRecipeAction(action);
  if (normalizedAction !== "clickpath") {
    throw new Error(
      `ada_web_recipe only supports action=clickPath; use ada_extract mode=viewTree for page observation (got: ${action})`
    );
  }

  const sessionId = String(args.sessionId ?? "mcp-web-recipe");
  const payload = {
    ...asRecord(args.payload),
    action: normalizedAction,
    ...(args.path !== undefined ? { path: args.path } : {}),
    ...(args.strategy !== undefined ? { strategy: args.strategy } : {}),
    ...(args.waitNavigation !== undefined ? { waitNavigation: args.waitNavigation } : {})
  };

  guardWebCommandIfNeeded("web", sessionId, "recipe", payload);

  const envelope = deps.toCommandEnvelope(
    {
      ...args,
      platform: "web",
      command: "recipe",
      sessionId,
      payload
    },
    deps.allowMock(args)
  );

  await deps.ensureWebRuntimeReady();
  await deps.ensureSessionActive("web", sessionId, "recipe");
  if (deps.ensureWebPageReady) {
    await deps.ensureWebPageReady(sessionId, "recipe");
  }

  const result = await deps.runCommand(envelope);
  deps.assertRealResult(result, "ada_web_recipe", deps.allowMock(args));

  recordWebCommandIfNeeded("web", sessionId, "recipe", payload, result);

  return deps.wrapCommandToolResult({ tool: "ada_web_recipe", envelope, result });
}

