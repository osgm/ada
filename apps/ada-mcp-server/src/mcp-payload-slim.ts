import type { CommandResult } from "@ada/contracts";
import { buildRecoveryPlan, type McpErrorKind } from "./mcp-recovery.js";
import { isMcpVerboseResult, slimCommandResult } from "./mcp-response-mode.js";

const INSTALL_LOG_TAIL_LINES = 32;
const INSTALL_LOG_ERROR_PATTERNS = /error|fail|exception|denied|404|enoent|timeout|fatal/i;

export function slimInstallDepsLogs(logs: string[], verbose = isMcpVerboseResult()): {
  logs?: string[];
  logTail?: string[];
  logErrorLines?: string[];
  logLines: number;
  logMode: "verbose" | "slim";
} {
  if (verbose || logs.length <= INSTALL_LOG_TAIL_LINES) {
    return { logs, logLines: logs.length, logMode: verbose ? "verbose" : "slim" };
  }
  const errorLines = logs.filter((line) => INSTALL_LOG_ERROR_PATTERNS.test(line));
  const tail = logs.slice(-INSTALL_LOG_TAIL_LINES);
  const mergedTail = [...new Set([...errorLines.slice(-8), ...tail])];
  return {
    logTail: mergedTail,
    logErrorLines: errorLines.length > 0 ? errorLines.slice(-12) : undefined,
    logLines: logs.length,
    logMode: "slim"
  };
}

export interface StepOutcomeSummary {
  index: number;
  command: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

function summarizeStepErrors(result: CommandResult): Pick<StepOutcomeSummary, "errorCode" | "errorMessage"> {
  return {
    errorCode: result.errorCode,
    errorMessage: result.errorMessage ? String(result.errorMessage).slice(0, 240) : undefined
  };
}

export function slimBatchStepResults(
  results: Array<{ index: number; command: string; attempts: number; result: CommandResult }>,
  verbose = isMcpVerboseResult()
): {
  results?: Array<{ index: number; command: string; attempts: number; result: CommandResult }>;
  stepOutcomes?: StepOutcomeSummary[];
  failedStep?: { index: number; command: string; attempts: number; result: CommandResult };
} {
  if (verbose || results.length <= 1) {
    return { results };
  }
  const failed = results.find((item) => !item.result.success);
  const stepOutcomes: StepOutcomeSummary[] = results.map((item) => ({
    index: item.index,
    command: item.command,
    success: item.result.success,
    ...summarizeStepErrors(item.result)
  }));
  if (!failed) {
    return { stepOutcomes };
  }
  const slimFailed = {
    index: failed.index,
    command: failed.command,
    attempts: failed.attempts,
    result: slimCommandResult(failed.result)
  };
  return { stepOutcomes, failedStep: slimFailed };
}

export function slimTaskFileResults(
  results: CommandResult[],
  verbose = isMcpVerboseResult()
): {
  results?: CommandResult[];
  stepOutcomes?: StepOutcomeSummary[];
  failedStep?: { index: number; result: CommandResult };
} {
  if (verbose) {
    return { results };
  }
  const failureIndex = results.findIndex((item) => !item.success);
  const stepOutcomes: StepOutcomeSummary[] = results.map((item, index) => ({
    index,
    command: "task",
    success: item.success,
    ...summarizeStepErrors(item)
  }));
  if (failureIndex < 0) {
    return { stepOutcomes };
  }
  return {
    stepOutcomes,
    failedStep: { index: failureIndex, result: slimCommandResult(results[failureIndex]) }
  };
}

export function resolveRecoveryFields(input: {
  tool: string;
  envelope?: import("@ada/contracts").CommandEnvelope;
  result?: CommandResult;
  errorKind: McpErrorKind;
  sessionId?: string;
  platform?: string;
}): { recoveryPlan: ReturnType<typeof buildRecoveryPlan>; recoveryHint?: string } {
  const recoveryPlan = buildRecoveryPlan(input);
  if (isMcpVerboseResult()) {
    const head = `Recovery for ${input.tool} sessionId="${input.sessionId ?? input.envelope?.sessionId ?? "same-session"}".`;
    const steps = recoveryPlan
      .slice(0, 4)
      .map((step, idx) => `${idx + 1}) ${step.tool}: ${step.note}`)
      .join(" ");
    return { recoveryPlan, recoveryHint: steps.length > 0 ? `${head} ${steps}` : head };
  }
  return { recoveryPlan };
}
