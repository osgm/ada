import fs from "node:fs/promises";
import path from "node:path";
import { Jimp } from "jimp";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { AgentConfig } from "./types.js";
import type { RuntimeTransport } from "./transport-client.js";
import { log } from "./logger.js";

interface MonitorContext {
  config: AgentConfig;
  transport?: RuntimeTransport | null;
  executeLocal?: (command: CommandEnvelope) => Promise<CommandResult>;
}

function shouldMonitorCommand(command: CommandEnvelope, config: AgentConfig, index: number): boolean {
  if (!config.monitoring.enabled) {
    return false;
  }
  if (!config.monitoring.platforms.includes(command.platform)) {
    return false;
  }
  if (command.command === "screenshot") {
    return false;
  }
  const sampleEvery = Math.max(1, config.monitoring.sampleEvery || 1);
  return (index + 1) % sampleEvery === 0;
}

function withMonitorPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  return {
    ...(payload ?? {}),
    __monitorCapture: true
  };
}

async function executeMonitorScreenshot(
  command: CommandEnvelope,
  context: MonitorContext
): Promise<CommandResult | null> {
  const monitorCommand: CommandEnvelope = {
    requestId: `${command.requestId}-monitor`,
    sessionId: command.sessionId,
    platform: command.platform,
    command: "screenshot",
    payload: withMonitorPayload(command.payload)
  };
  if (context.transport) {
    return context.transport.execute(monitorCommand);
  }
  if (context.executeLocal) {
    return context.executeLocal(monitorCommand);
  }
  return null;
}

function getScreenshotPath(result: CommandResult): string | null {
  const pathValue = (result.data as Record<string, unknown> | undefined)?.screenshot;
  return typeof pathValue === "string" ? pathValue : null;
}

function buildMonitorOutputPath(config: AgentConfig, sourcePath: string, requestId: string, sessionId: string): string {
  const ext = path.extname(sourcePath) || ".png";
  if (config.monitoring.groupBySession) {
    return path.join(config.monitoring.outputDir, sessionId, `${requestId}${ext}`);
  }
  return path.join(config.monitoring.outputDir, `${requestId}${ext}`);
}

export async function captureOperationMonitor(
  command: CommandEnvelope,
  result: CommandResult,
  index: number,
  context: MonitorContext
): Promise<void> {
  if (!shouldMonitorCommand(command, context.config, index)) {
    return;
  }
  if (context.config.monitoring.onFailureOnly && result.success) {
    return;
  }

  const monitorResult = await executeMonitorScreenshot(command, context);
  if (!monitorResult?.success) {
    log("warn", {
      event: "monitor.capture.failed",
      details: { requestId: command.requestId, error: monitorResult?.errorMessage ?? "monitor unsupported" }
    });
    return;
  }

  const sourcePath = getScreenshotPath(monitorResult);
  if (!sourcePath) {
    return;
  }

  const targetPath = buildMonitorOutputPath(context.config, sourcePath, command.requestId, command.sessionId);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const { maxWidth, maxHeight, keepAspectRatio } = context.config.monitoring.resolution;
  const mw = Math.max(1, maxWidth);
  const mh = Math.max(1, maxHeight);
  const image = await Jimp.read(sourcePath);
  if (keepAspectRatio) {
    image.scaleToFit({ w: mw, h: mh });
  } else {
    image.cover({ w: mw, h: mh });
  }
  await image.write(targetPath as `${string}.${string}`);

  log("info", {
    event: "monitor.capture.saved",
    details: {
      requestId: command.requestId,
      platform: command.platform,
      sourcePath,
      targetPath,
      maxWidth,
      maxHeight,
      keepAspectRatio
    }
  });
}
