import { TaskExecutor } from "@ada/core-kernel";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { buildPluginHost } from "./plugin-registry.js";
import { log } from "./logger.js";
import type { RuntimeTransport } from "./transport-client.js";
import type { AgentConfig } from "./types.js";
import { captureOperationMonitor } from "./monitoring.js";

export interface RunTasksetOptions {
  transport?: RuntimeTransport | null;
  config?: AgentConfig;
}

export async function runTaskset(commands: CommandEnvelope[], options: RunTasksetOptions = {}): Promise<CommandResult[]> {
  const executor = new TaskExecutor(buildPluginHost());
  const results: CommandResult[] = [];
  const monitorJobs: Promise<void>[] = [];
  for (const cmd of commands) {
    const executeLocal = (command: CommandEnvelope) => executor.execute(command);
    const result = options.transport ? await options.transport.execute(cmd) : await executeLocal(cmd);
    results.push(result);
    log("info", { event: "task.executed", details: result });
    if (options.config) {
      const monitorJob = captureOperationMonitor(cmd, result, results.length - 1, {
        config: options.config,
        transport: options.transport,
        executeLocal
      });
      if (options.config.monitoring.nonBlocking) {
        monitorJobs.push(
          monitorJob.catch((error) => {
            log("warn", {
              event: "monitor.capture.unhandled",
              details: { requestId: cmd.requestId, message: error instanceof Error ? error.message : String(error) }
            });
          })
        );
      } else {
        await monitorJob;
      }
    }
  }
  if (monitorJobs.length > 0) {
    await Promise.allSettled(monitorJobs);
  }
  return results;
}

export async function runDemoTaskset(options: RunTasksetOptions = {}): Promise<void> {
  await runTaskset(
    [
    {
      requestId: "req-web-1",
      sessionId: "session-web",
      platform: "web",
      command: "click",
      payload: { locator: { testId: "login-btn" } }
    },
    {
      requestId: "req-ios-1",
      sessionId: "session-ios",
      platform: "ios",
      command: "swipe",
      payload: { from: [0.5, 0.8], to: [0.5, 0.2] }
    }
    ],
    options
  );
}

export async function runForegroundLoop(skipDemo = false, options: RunTasksetOptions = {}): Promise<void> {
  log("info", { event: "agent.runtime.ready", details: { mode: "foreground" } });
  if (skipDemo) {
    return;
  }
  await runDemoTaskset(options);
}
