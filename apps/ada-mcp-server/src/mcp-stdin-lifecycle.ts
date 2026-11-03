import { isBootstrapInstallActive } from "@ada/install-deps";
import { stopAllIosIproxyForwards } from "@ada/runtime-probe";

import { shutdownExecutor } from "./executor.js";
import { mcpLog, mcpLogIfVerbose } from "./mcp-log.js";

let shuttingDown = false;
let stdinDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

function isTruthyEnv(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function shouldExitProcessOnStdinClose(): boolean {
  return isTruthyEnv("ADA_MCP_EXIT_ON_STDIN_CLOSE");
}

function resolveStdinDisconnectDebounceMs(): number {
  if (isBootstrapInstallActive() || process.env.ADA_MCP_BOOTSTRAP_IN_PROGRESS === "1") {
    const bootstrapRaw = Number(process.env.ADA_MCP_BOOTSTRAP_DEBOUNCE_MS ?? 300_000);
    if (Number.isFinite(bootstrapRaw)) {
      return Math.min(Math.max(Math.floor(bootstrapRaw), 0), 600_000);
    }
    return 300_000;
  }
  const raw = Number(process.env.ADA_MCP_STDIN_SHUTDOWN_DEBOUNCE_MS ?? 2000);
  if (!Number.isFinite(raw)) {
    return 2000;
  }
  return Math.min(Math.max(Math.floor(raw), 0), 60_000);
}

function stdinLooksAlive(): boolean {
  return Boolean(process.stdin.readable && !process.stdin.readableEnded && !process.stdin.destroyed);
}

async function releaseExecutorSessions(reason: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  mcpLog("info", `releasing sessions (${reason}), server stays up`);
  try {
    await shutdownExecutor({ timeoutMs: 10_000 });
    await shutdownExecutor({ force: true });
  } catch (error) {
    mcpLog("warn", `releaseExecutorSessions: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function scheduleStdinDisconnect(reason: string): void {
  if (stdinDisconnectTimer) {
    clearTimeout(stdinDisconnectTimer);
  } else {
    const ms = resolveStdinDisconnectDebounceMs();
    mcpLogIfVerbose(
      `${reason}: debounce ${ms}ms (release sessions only; ADA_MCP_EXIT_ON_STDIN_CLOSE=1 to exit process)`
    );
  }
  const ms = resolveStdinDisconnectDebounceMs();
  if (ms <= 0) {
    void onStdinDisconnect(reason);
    return;
  }
  stdinDisconnectTimer = setTimeout(() => {
    stdinDisconnectTimer = null;
    void onStdinDisconnect(reason);
  }, ms);
}

async function onStdinDisconnect(reason: string): Promise<void> {
  if (stdinLooksAlive()) {
    mcpLogIfVerbose(`${reason} recovered, server continues`);
    return;
  }
  if (isBootstrapInstallActive() || process.env.ADA_MCP_BOOTSTRAP_IN_PROGRESS === "1") {
    mcpLog(
      "info",
      `${reason} during dependency bootstrap; defer session release (install in progress)`
    );
    scheduleStdinDisconnect(reason);
    return;
  }
  if (shouldExitProcessOnStdinClose()) {
    await gracefulShutdown(reason);
    return;
  }
  await releaseExecutorSessions(reason);
}

export function wireStdinShutdownHandlers(): void {
  process.stdin.on("end", () => scheduleStdinDisconnect("stdin-end"));
  process.stdin.on("close", () => scheduleStdinDisconnect("stdin-close"));
}

export async function gracefulShutdown(reason: string): Promise<void> {
  if (stdinDisconnectTimer) {
    clearTimeout(stdinDisconnectTimer);
    stdinDisconnectTimer = null;
  }
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    mcpLog("warn", `shutting down: ${reason}`);
    await shutdownExecutor({ timeoutMs: 10_000 });
    await shutdownExecutor({ force: true });
  } catch (error) {
    mcpLog("error", `shutdownExecutor: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try {
      stopAllIosIproxyForwards();
    } catch {
      // best-effort
    }
    process.exit(0);
  }
}
