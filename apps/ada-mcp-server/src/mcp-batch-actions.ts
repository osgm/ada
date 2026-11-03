import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  guardMobileCommandIfNeeded,
  guardWebCommandIfNeeded,
  recordMobileCommandIfNeeded,
  recordWebCommandIfNeeded
} from "./mcp-action-ledger.js";
import type { ActionRunOptions } from "./mcp-action-runner.js";
import { isMobilePlatform, type AdaPlatform } from "./mcp-normalize.js";
import { resolveRecoveryFields, slimBatchStepResults } from "./mcp-payload-slim.js";
import { suggestRecoveryTool } from "./mcp-recovery.js";

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
  ensureWebRuntimeReady?: () => Promise<void>;
  ensureSessionActive?: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
  ensureWebPageReady?: (sessionId: string, command: string) => Promise<void>;
  ensureMobileSessionReady?: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
  withTiming: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  asRecord: (value: unknown) => Record<string, unknown>;
  normalizeCommand: (value: unknown) => string;
  ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
  toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
  allowMock: (args: Record<string, unknown>) => boolean;
  runCommandWithRetry: (
    command: CommandEnvelope,
    options: ActionRunOptions
  ) => Promise<{ result: CommandResult; attempts: number }>;
  assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
  mcpTextResult: (data: Record<string, unknown>, options?: any) => McpResult;
  buildRecoveryFields: (input: any) => { recoveryPlan: unknown; recoveryHint?: string };
}

function resolveOnFailure(args: Record<string, unknown>): "stop" | "continue" {
  if (args.onFailure === "stop" || args.onFailure === "continue") {
    return args.onFailure;
  }
  return args.continueOnError === true ? "continue" : "stop";
}

function firstActionCommand(actions: unknown[], deps: BatchActionDeps): string {
  if (actions.length === 0) return "click";
  const item = deps.asRecord(actions[0]);
  try {
    return deps.normalizeCommand(item.command ?? item.action);
  } catch {
    return "click";
  }
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
      const command = deps.normalizeCommand(item.command ?? item.action);
      deps.ensureRiskAllowed(command, { riskApproved });
      const timeoutMs = typeof item.timeoutMs === "number" ? Math.max(0, Math.floor(item.timeoutMs)) : 0;
      const retry = typeof item.retry === "number" ? Math.max(0, Math.floor(item.retry)) : 0;
      const retryDelayMs =
        typeof item.retryDelayMs === "number" ? Math.max(0, Math.floor(item.retryDelayMs)) : 500;
      steps.push({
        index: i,
        requestId: stepRequestId,
        command,
        retry,
        retryDelayMs,
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

async function ensureBatchRuntimeReady(
  platform: AdaPlatform,
  deps: BatchActionDeps
): Promise<void> {
  if (platform === "web") {
    if (deps.ensureWebRuntimeReady) {
      await deps.withTiming("ensureWebRuntimeReady", () => deps.ensureWebRuntimeReady!());
    }
    return;
  }
  await deps.withTiming(`ensureMobileRuntimeReady(${platform})`, () => deps.mobilePreflight(platform));
}

/** 批开头一次会话探活：避免每步重复 probe，又比完全不探更快失败。 */
async function ensureBatchSessionReadyOnce(
  platform: AdaPlatform,
  sessionId: string,
  seedCommand: string,
  deps: BatchActionDeps
): Promise<void> {
  if (deps.ensureSessionActive) {
    await deps.ensureSessionActive(platform, sessionId, seedCommand);
  }
  if (platform === "web" && deps.ensureWebPageReady) {
    await deps.ensureWebPageReady(sessionId, seedCommand);
    return;
  }
  if (isMobilePlatform(platform) && deps.ensureMobileSessionReady) {
    await deps.ensureMobileSessionReady(platform, sessionId, seedCommand);
  }
}

export async function handleBatchActions(args: Record<string, unknown>, deps: BatchActionDeps): Promise<any> {
  const platform = deps.normalizePlatform(args.platform);
  const sessionId = String(args.sessionId ?? "mcp-batch");
  const onFailure = resolveOnFailure(args);
  const actions = Array.isArray(args.actions) ? args.actions : [];
  const dryRun = args.dryRun === true;
  const continueOnError = onFailure === "continue";
  const defaultRetryDelayMs =
    typeof args.retryDelayMs === "number" ? Math.max(0, Math.floor(args.retryDelayMs)) : 500;

  // dryRun 只做校验：跳过 runtime / session 探活，避免无意义的 Playwright/adb 等待
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

  await ensureBatchRuntimeReady(platform, deps);
  if (actions.length > 0) {
    await ensureBatchSessionReadyOnce(platform, sessionId, firstActionCommand(actions, deps), deps);
  }

  const results: Array<{ index: number; command: string; attempts: number; result: CommandResult }> = [];
  for (let i = 0; i < actions.length; i += 1) {
    const item = deps.asRecord(actions[i]);
    const command = deps.normalizeCommand(item.command ?? item.action);
    deps.ensureRiskAllowed(command, args);
    const timeoutMs = typeof item.timeoutMs === "number" ? Math.max(0, Math.floor(item.timeoutMs)) : 0;
    const retry = typeof item.retry === "number" ? Math.max(0, Math.floor(item.retry)) : 0;
    const retryDelayMs =
      typeof item.retryDelayMs === "number" ? Math.max(0, Math.floor(item.retryDelayMs)) : defaultRetryDelayMs;
    const isLastAction = i === actions.length - 1;
    const rawPayload = deps.asRecord(item.payload);
    const payload =
      platform === "android" || platform === "ios" || platform === "harmony"
        ? { ...rawPayload, keepSession: !isLastAction }
        : rawPayload;
    guardWebCommandIfNeeded(platform, sessionId, command, payload);
    guardMobileCommandIfNeeded(platform, sessionId, command, payload);
    const envelope = deps.toCommandEnvelope(
      {
        requestId: item.requestId ?? `batch-${Date.now()}-${i}`,
        sessionId,
        platform,
        command,
        payload
      },
      deps.allowMock(args)
    );
    const { result, attempts } = await deps.withTiming(`batch-action(${platform}:${command})`, () =>
      deps.runCommandWithRetry(envelope, { retry, retryDelayMs, timeoutMs })
    );
    recordWebCommandIfNeeded(platform, sessionId, command, payload, result);
    recordMobileCommandIfNeeded(platform, sessionId, command, payload, result);
    deps.assertRealResult(result, "ada_batch_actions", deps.allowMock(args));
    results.push({ index: i, command, attempts, result });
    if (!result.success && onFailure === "stop") {
      break;
    }
  }

  const successCount = results.filter((item) => item.result.success).length;
  const failureCount = results.length - successCount;
  const timeoutCount = results.filter((item) => item.result.errorCode === "MCP_ACTION_TIMEOUT").length;
  const failedStep = results.find((item) => !item.result.success);
  const errorKind = timeoutCount > 0 ? "timeout" : "command_failed";
  const slimResults = slimBatchStepResults(results);
  const recoveryInput = {
    tool: "ada_batch_actions",
    sessionId,
    platform,
    errorKind,
    result: failedStep?.result,
    envelope: failedStep
      ? {
          requestId: failedStep.result.requestId,
          sessionId,
          platform,
          command: failedStep.command,
          payload: {}
        }
      : undefined
  };
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
      ...slimResults
    },
    failureCount > 0
      ? {
          isError: true,
          errorKind,
          recoverable: onFailure === "continue",
          suggestedNextTool:
            (failedStep && suggestRecoveryTool(failedStep.result, platform)) ??
            (platform === "web" ? "ada_extract" : "ada_mobile_extract"),
          ...resolveRecoveryFields(recoveryInput)
        }
      : undefined
  );
}
