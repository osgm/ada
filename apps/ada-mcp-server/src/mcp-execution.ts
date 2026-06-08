import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { guardWebCommandIfNeeded, recordWebCommandIfNeeded } from "./mcp-action-ledger.js";
import { slimTaskFileResults } from "./mcp-payload-slim.js";
import type { AdaPlatform } from "./mcp-normalize.js";
import type { MonitorOptions } from "./monitoring.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export async function handleRunTaskFile(
  args: Record<string, unknown>,
  deps: {
    resolveTaskPath: (file: string) => string;
    loadTaskFile: (taskPath: string) => Promise<CommandEnvelope[]>;
    runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
    parseMonitorOptions: (args: Record<string, unknown>) => MonitorOptions;
    runMonitorCapture: (command: CommandEnvelope, result: CommandResult, options: MonitorOptions) => Promise<void> | void;
    allowMock: (args: Record<string, unknown>) => boolean;
    assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
    mcpTextResult: (data: Record<string, unknown>, options?: any) => any;
    buildRecoveryFields: (input: any) => { recoveryPlan: unknown; recoveryHint?: string };
  }
): Promise<any> {
  const file = String(args.file ?? "");
  if (!file) {
    throw new Error("file is required");
  }
  const taskPath = deps.resolveTaskPath(file);
  const tasks = await deps.loadTaskFile(taskPath);
  const results: CommandResult[] = [];
  for (const task of tasks) {
    const payload = asRecord(task.payload);
    guardWebCommandIfNeeded(task.platform, task.sessionId, task.command, payload);
    const result = await deps.runCommand(task);
    recordWebCommandIfNeeded(task.platform, task.sessionId, task.command, payload, result);
    results.push(result);
  }
  const monitor = deps.parseMonitorOptions(args);
  const monitorJobs: Promise<void>[] = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const maybeJob = deps.runMonitorCapture(tasks[i], results[i], monitor);
    if (maybeJob) {
      monitorJobs.push(maybeJob);
    }
  }
  if (monitorJobs.length > 0) {
    await Promise.allSettled(monitorJobs);
  }
  const allowMockMode = deps.allowMock(args);
  for (const result of results) {
    deps.assertRealResult(result, "ada_run_task_file", allowMockMode);
  }
  const failureCount = results.filter((item) => !item.success).length;
  const slimResults = slimTaskFileResults(results);
  return deps.mcpTextResult(
    { file: taskPath, failureCount, ...slimResults },
    failureCount > 0
      ? {
          isError: true,
          errorKind: "command_failed",
          recoverable: false,
          ...deps.buildRecoveryFields({ tool: "ada_run_task_file", errorKind: "command_failed" })
        }
      : undefined
  );
}

export async function handleInvoke(
  args: Record<string, unknown>,
  deps: {
    ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
    normalizePlatform: (value: unknown) => AdaPlatform;
    ensureSessionActive?: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
    ensureWebPageReady?: (sessionId: string, command: string) => Promise<void>;
    ensureRealPayloadForPlatform: (
      platform: AdaPlatform,
      payload: Record<string, unknown>,
      allowMockMode: boolean
    ) => Record<string, unknown>;
    buildInvokeCommandPayload: (args: Record<string, unknown>) => Record<string, unknown>;
    allowMock: (args: Record<string, unknown>) => boolean;
    withTiming: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
    mobilePreflight: (platform: AdaPlatform) => Promise<void>;
    runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
    runMonitorCapture: (command: CommandEnvelope, result: CommandResult, options: MonitorOptions) => Promise<void> | void;
    parseMonitorOptions: (args: Record<string, unknown>) => MonitorOptions;
    assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
    wrapCommandToolResult: (input: { tool: string; envelope: CommandEnvelope; result: CommandResult; attempts?: number }) => any;
  }
): Promise<any> {
  deps.ensureRiskAllowed("invoke", args);
  const platform = deps.normalizePlatform(args.platform);
  const payload = deps.ensureRealPayloadForPlatform(platform, deps.buildInvokeCommandPayload(args), deps.allowMock(args));
  const envelope: CommandEnvelope = {
    requestId: String(args.requestId ?? `invoke-${Date.now()}`),
    sessionId: String(args.sessionId ?? "mcp-invoke"),
    platform,
    command: "invoke",
    payload
  };
  if (deps.ensureSessionActive) {
    await deps.ensureSessionActive(platform, envelope.sessionId, "invoke");
  }
  if (platform === "web" && deps.ensureWebPageReady) {
    await deps.ensureWebPageReady(envelope.sessionId, "invoke");
  }
  await deps.withTiming(`ensureMobileRuntimeReady(${platform})`, () => deps.mobilePreflight(platform));
  const result = await deps.withTiming(`runCommand(${platform}:invoke)`, () => deps.runCommand(envelope));
  const maybeJob = deps.runMonitorCapture(envelope, result, deps.parseMonitorOptions(args));
  if (maybeJob) {
    await maybeJob;
  }
  deps.assertRealResult(result, "ada_invoke", deps.allowMock(args));
  return deps.wrapCommandToolResult({ tool: "ada_invoke", envelope, result });
}
