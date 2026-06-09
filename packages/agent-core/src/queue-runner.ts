import fs from "node:fs/promises";
import path from "node:path";
import type { AgentConfig } from "./types.js";
import { loadTaskFile } from "./task-loader.js";
import { runTaskset, type RunTasksetOptions } from "./runtime.js";
import { log } from "./logger.js";

interface FailedMeta {
  file: string;
  failedAt: string;
  attempts: number;
  message: string;
}

async function ensureDirs(config: AgentConfig): Promise<void> {
  await fs.mkdir(config.queue.inboxDir, { recursive: true });
  await fs.mkdir(config.queue.processedDir, { recursive: true });
  await fs.mkdir(config.queue.failedDir, { recursive: true });
}

async function listTaskFiles(inboxDir: string): Promise<string[]> {
  const entries = await fs.readdir(inboxDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(inboxDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function moveTo(targetDir: string, sourcePath: string): Promise<void> {
  const fileName = path.basename(sourcePath);
  const destination = path.join(targetDir, fileName);
  await fs.rename(sourcePath, destination);
}

async function writeFailedMeta(targetDir: string, sourcePath: string, meta: FailedMeta): Promise<void> {
  const fileName = `${path.basename(sourcePath)}.error.json`;
  const destination = path.join(targetDir, fileName);
  await fs.writeFile(destination, JSON.stringify(meta, null, 2), "utf8");
}

export async function processQueueOnce(config: AgentConfig, options: RunTasksetOptions = {}): Promise<number> {
  await ensureDirs(config);
  const files = await listTaskFiles(config.queue.inboxDir);
  let processedCount = 0;

  for (const file of files) {
    let attempt = 0;
    let lastError: unknown = undefined;

    while (attempt < Math.max(1, config.queue.maxFileRetryAttempts)) {
      attempt += 1;
      try {
        const tasks = await loadTaskFile(file);
        await runTaskset(tasks, options);
        await moveTo(config.queue.processedDir, file);
        processedCount += 1;
        log("info", { event: "queue.file.processed", details: { file, attempt } });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        log("warn", {
          event: "queue.file.retry",
          details: {
            file,
            attempt,
            maxAttempts: config.queue.maxFileRetryAttempts,
            message: error instanceof Error ? error.message : String(error)
          }
        });
      }
    }

    if (!lastError) {
      continue;
    }

    try {
      await moveTo(config.queue.failedDir, file);
      await writeFailedMeta(config.queue.failedDir, file, {
        file,
        failedAt: new Date().toISOString(),
        attempts: config.queue.maxFileRetryAttempts,
        message: lastError instanceof Error ? lastError.message : String(lastError)
      });
      log("error", {
        event: "queue.file.failed",
        details: {
          file,
          attempts: config.queue.maxFileRetryAttempts,
          message: lastError instanceof Error ? lastError.message : String(lastError)
        }
      });
    } catch (moveError) {
      log("error", {
        event: "queue.file.failed.move-error",
        details: { file, message: moveError instanceof Error ? moveError.message : String(moveError) }
      });
    }
  }

  return processedCount;
}

export async function watchQueue(
  config: AgentConfig,
  shouldStop?: () => boolean,
  options: RunTasksetOptions = {}
): Promise<void> {
  await ensureDirs(config);
  log("info", {
    event: "queue.watch.started",
    details: {
      inboxDir: config.queue.inboxDir,
      pollIntervalMs: config.queue.pollIntervalMs
    }
  });

  while (!shouldStop || !shouldStop()) {
    await processQueueOnce(config, options);
    await new Promise((resolve) => setTimeout(resolve, config.queue.pollIntervalMs));
  }
  log("info", { event: "queue.watch.stopped" });
}
