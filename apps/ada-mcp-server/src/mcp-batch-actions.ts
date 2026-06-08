import type { CommandResult } from "@ada/contracts";
import { guardWebCommandIfNeeded, recordWebCommandIfNeeded } from "./mcp-action-ledger.js";
import type { AdaPlatform } from "./mcp-normalize.js";

type McpResult = ReturnType<
  (
    data: Record<string, unknown>,
    options?: {
      isError?: boolean;
      errorKind?: "validation" | "environment" | "assertion_failed" | "command_failed" | "timeout" | "risk_denied" | "unknown";
      recoverable?: boolean;
      suggestedNextTool?: string;
      recoveryHint?: string;
      recoveryPlan?: unknown;
    }
  ) => unknown
>;

export interface BatchActionDeps {
  normalizePlatform: (value: unknown) => AdaPlatform;
  mobilePreflight: (platform: AdaPlatform) => Promise<void>;
  withTiming: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  asRecord: (value: unknown) => Record<string, unknown>;
  normalizeCommand: (value: unknown) => string;
  ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
  toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => any;
  allowMock: (args: Record<string, unknown>) => boolean;
  executeWithTimeout: (envelope: any, timeoutMs?: number) => Promise<CommandResult>;
  assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
  mcpTextResult: (data: Record<string, unknown>, options?: any) => McpResult;
  buildRecoveryHint: (input: any) => string;
  buildRecoveryPlan: (input: any) => unknown;
}

function resolveOnFailure(args: Record<string, unknown>): "stop" | "continue" {
  if (args.onFailure === "stop" || args.onFailure === "continue") {
    return args.onFailure;
  }
  return args.continueOnError === true ? "continue" : "stop";
}

function buildBatchDryRunPreview(
  platform: AdaPlatform,
  sessionId: string,
  actions: unknown[],
  riskApproved: boolean,
  deps: BatchActionDeps
): { valid: boolean; steps: Array<Record<string, unknown>>; errors: Array<Record<string, unknown>> } {
  const steps: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];
  for (let i = 0; i < actions.length; i += 1) {
    const item = deps.asRecord(actions[i]);
    const stepRequestId = String(item.requestId ?? `batch-${Date.now()}-${i}`);
    try {
      const command = deps.normalizeCommand(item.command);
      deps.ensureRiskAllowed(command, { riskApproved });
      const timeoutMs = typeof item.timeoutMs === "number" ? Math.max(0, Math.floor(item.timeoutMs)) : 0;
      const retry = typeof item.retry === "number" ? Math.max(0, Math.floor(item.retry)) : 0;
      steps.push({
        index: i,
        requestId: stepRequestId,
        command,
        retry,
        timeoutMs,
        wouldExecute: true,
        sessionId,
        platform
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ index: i, requestId: stepRequestId, error: message });
      steps.push({ index: i, requestId: stepRequestId, wouldExecute: false, reason: message });
    }
  }
  return { valid: errors.length === 0, steps, errors };
}

export async function handleBatchActions(args: Record<string, unknown>, deps: BatchActionDeps): Promise<any> {
  const platform = deps.normalizePlatform(args.platform);
  await deps.withTiming(`ensureMobileRuntimeReady(${platform})`, () => deps.mobilePreflight(platform));
  const sessionId = String(args.sessionId ?? "mcp-batch");
  const onFailure = resolveOnFailure(args);
  const actions = Array.isArray(args.actions) ? args.actions : [];
  const dryRun = args.dryRun === true;
  const continueOnError = onFailure === "continue";

  if (dryRun) {
    const preview = buildBatchDryRunPreview(platform, sessionId, actions, args.riskApproved === true, deps);
    return deps.mcpTextResult(
      {
        status: preview.valid ? "ok" : "failed",
        mode: "dryRun",
        platform,
        sessionId,
        onFailure,
        continueOnError,
        summary: {
          total: actions.length,
          validSteps: preview.steps.filter((step) => step.wouldExecute === true).length,
          invalidSteps: preview.errors.length
        },
        steps: preview.steps,
        validationErrors: preview.errors
      },
      preview.valid
        ? undefined
        : {
            isError: true,
            errorKind: "validation",
            recoverable: true,
            suggestedNextTool: "ada_batch_actions",
            recoveryHint:
              "Fix validationErrors in dryRun preview (command name / riskApproved / payload), then rerun ada_batch_actions with dryRun=false."
          }
    );
  }

  const results: Array<{ index: number; command: string; attempts: number; result: CommandResult }> = [];
  for (let i = 0; i < actions.length; i += 1) {
    const item = deps.asRecord(actions[i]);
    const command = deps.normalizeCommand(item.command);
    deps.ensureRiskAllowed(command, args);
    const timeoutMs = typeof item.timeoutMs === "number" ? Math.max(0, Math.floor(item.timeoutMs)) : 0;
    const retry = typeof item.retry === "number" ? Math.max(0, Math.floor(item.retry)) : 0;
    let attempts = 0;
    let result: CommandResult = {
      requestId: String(item.requestId ?? `batch-${Date.now()}-${i}`),
      success: false,
      errorCode: "MCP_BATCH_NOT_EXECUTED",
      errorMessage: "batch action not executed"
    };
    const maxAttempts = retry + 1;
    while (attempts < maxAttempts) {
      attempts += 1;
      const isLastAction = i === actions.length - 1;
      const rawPayload = deps.asRecord(item.payload);
      const payload =
        platform === "android" || platform === "ios" || platform === "harmony"
          ? { ...rawPayload, keepSession: !isLastAction }
          : rawPayload;
      guardWebCommandIfNeeded(platform, sessionId, command, payload);
      const envelope = deps.toCommandEnvelope(
        {
          requestId: item.requestId ?? `batch-${Date.now()}-${i}-a${attempts}`,
          sessionId,
          platform,
          command,
          payload
        },
        deps.allowMock(args)
      );
      result = await deps.withTiming(`batch-action(${platform}:${command})`, () => deps.executeWithTimeout(envelope, timeoutMs));
      recordWebCommandIfNeeded(platform, sessionId, command, payload, result);
      if (result.success) {
        break;
      }
    }
    deps.assertRealResult(result, "ada_batch_actions", deps.allowMock(args));
    results.push({ index: i, command, attempts, result });
    if (!result.success && onFailure === "stop") {
      break;
    }
  }

  const successCount = results.filter((item) => item.result.success).length;
  const failureCount = results.length - successCount;
  const timeoutCount = results.filter((item) => item.result.errorCode === "MCP_ACTION_TIMEOUT").length;
  return deps.mcpTextResult(
    {
      status: failureCount > 0 ? "failed" : "ok",
      platform,
      sessionId,
      continueOnError,
      onFailure,
      executed: results.length,
      summary: {
        total: actions.length,
        executed: results.length,
        successCount,
        failureCount,
        timeoutCount,
        stoppedOnFailure: failureCount > 0 && onFailure === "stop"
      },
      results
    },
    failureCount > 0
      ? {
          isError: true,
          errorKind: timeoutCount > 0 ? "timeout" : "command_failed",
          recoverable: onFailure === "continue",
          suggestedNextTool: "ada_sessions",
          recoveryHint: deps.buildRecoveryHint({
            tool: "ada_batch_actions",
            sessionId,
            platform,
            errorKind: timeoutCount > 0 ? "timeout" : "command_failed"
          }),
          recoveryPlan: deps.buildRecoveryPlan({
            tool: "ada_batch_actions",
            sessionId,
            platform,
            errorKind: timeoutCount > 0 ? "timeout" : "command_failed"
          })
        }
      : undefined
  );
}
