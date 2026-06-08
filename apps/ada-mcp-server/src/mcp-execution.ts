import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { AdaPlatform } from "./mcp-normalize.js";
import type { MonitorOptions } from "./monitoring.js";

export async function handleRunTaskFile(
  args: Record<string, unknown>,
  deps: {
    resolveTaskPath: (file: string) => string;
    loadTaskFile: (taskPath: string) => Promise<CommandEnvelope[]>;
    runTaskset: (tasks: CommandEnvelope[]) => Promise<CommandResult[]>;
    parseMonitorOptions: (args: Record<string, unknown>) => MonitorOptions;
    runMonitorCapture: (command: CommandEnvelope, result: CommandResult, options: MonitorOptions) => Promise<void> | void;
    allowMock: (args: Record<string, unknown>) => boolean;
    assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
    mcpTextResult: (data: Record<string, unknown>, options?: any) => any;
    buildRecoveryHint: (input: any) => string;
  }
): Promise<any> {
  const file = String(args.file ?? "");
  if (!file) {
    throw new Error("file is required");
  }
  const taskPath = deps.resolveTaskPath(file);
  const tasks = await deps.loadTaskFile(taskPath);
  const results = await deps.runTaskset(tasks);
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
  return deps.mcpTextResult(
    { file: taskPath, results, failureCount },
    failureCount > 0
      ? {
          isError: true,
          errorKind: "command_failed",
          recoverable: false,
          recoveryHint: deps.buildRecoveryHint({ tool: "ada_run_task_file", errorKind: "command_failed" })
        }
      : undefined
  );
}

export async function handleExecute(
  args: Record<string, unknown>,
  deps: {
    normalizeCommand: (value: unknown) => string;
    ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
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
  deps.ensureRiskAllowed(deps.normalizeCommand(args.command), args);
  const command = deps.toCommandEnvelope(args, deps.allowMock(args));
  await deps.withTiming(`ensureMobileRuntimeReady(${command.platform})`, () => deps.mobilePreflight(command.platform));
  const result = await deps.withTiming(`runCommand(${command.platform}:${command.command})`, () => deps.runCommand(command));
  const maybeJob = deps.runMonitorCapture(command, result, deps.parseMonitorOptions(args));
  if (maybeJob) {
    await maybeJob;
  }
  deps.assertRealResult(result, "ada_execute", deps.allowMock(args));
  return deps.wrapCommandToolResult({ tool: "ada_execute", envelope: command, result });
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
