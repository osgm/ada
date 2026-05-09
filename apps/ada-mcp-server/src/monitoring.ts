import fs from "node:fs/promises";
import path from "node:path";
import { Jimp } from "jimp";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";

export interface MonitorOptions {
  enabled: boolean;
  outputDir: string;
  maxWidth: number;
  maxHeight: number;
  keepAspectRatio: boolean;
  onFailureOnly: boolean;
  groupBySession: boolean;
  nonBlocking: boolean;
}

function getScreenshotPath(result: CommandResult): string | null {
  const value = (result.data as Record<string, unknown> | undefined)?.screenshot;
  return typeof value === "string" ? value : null;
}

function buildOutputPath(options: MonitorOptions, command: CommandEnvelope): string {
  if (options.groupBySession) {
    return path.join(options.outputDir, command.sessionId, `${command.requestId}.png`);
  }
  return path.join(options.outputDir, `${command.requestId}.png`);
}

export async function captureMcpMonitor(
  command: CommandEnvelope,
  result: CommandResult,
  options: MonitorOptions,
  runCommand: (command: CommandEnvelope) => Promise<CommandResult>
): Promise<string | null> {
  if (!options.enabled) {
    return null;
  }
  if (options.onFailureOnly && result.success) {
    return null;
  }
  if (command.command === "screenshot") {
    return null;
  }

  const shotResult = await runCommand({
    requestId: `${command.requestId}-monitor`,
    sessionId: command.sessionId,
    platform: command.platform,
    command: "screenshot",
    payload: {
      ...(command.payload ?? {}),
      __monitorCapture: true
    }
  });
  if (!shotResult.success) {
    return null;
  }
  const sourcePath = getScreenshotPath(shotResult);
  if (!sourcePath) {
    return null;
  }

  const targetPath = buildOutputPath(options, command);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const image = await Jimp.read(sourcePath);
  if (options.keepAspectRatio) {
    image.scaleToFit({ w: options.maxWidth, h: options.maxHeight });
  } else {
    image.cover({ w: options.maxWidth, h: options.maxHeight });
  }
  await image.write(targetPath as `${string}.${string}`);

  return targetPath;
}
