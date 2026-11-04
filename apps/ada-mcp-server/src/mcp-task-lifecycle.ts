import { resolveIosDeviceUdid, stopIosIproxyForUdid } from "@ada/runtime-probe";
import { clearActionLedger } from "./mcp-action-ledger.js";
import { clearLocatorHintCache } from "./mcp-locator-cache.js";
import { invalidateMobilePageSourceCache } from "./mcp-mobile-dump-cache.js";
import { clearMobileSessionProbeCache } from "./mcp-mobile-session-liveness.js";
import type { AdaPlatform } from "./mcp-normalize.js";
import { markSessionReleased } from "./mcp-released-sessions.js";
import { clearSessionLease, touchSessionLease } from "./mcp-session-lease.js";
import { clearWebSessionTrack } from "./mcp-session-liveness.js";
import { asRecord } from "./mcp-utils.js";

export type AdaTaskRecord = {
  taskId: string;
  sessionId: string;
  platform: AdaPlatform;
  prefix: string;
  createdAt: number;
};

const tasksById = new Map<string, AdaTaskRecord>();
const taskIdBySession = new Map<string, string>();

function sessionKey(platform: AdaPlatform, sessionId: string): string {
  return `${platform}::${sessionId}`;
}

function sanitizePrefix(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || "task";
}

/** 分配 taskId + sessionId（不启动浏览器；navigate/launchApp 时才建连接）。 */
export function allocateTaskIds(input: {
  platform: AdaPlatform;
  prefix?: string;
}): { taskId: string; sessionId: string; prefix: string } {
  const prefix = sanitizePrefix(input.prefix?.trim() || `${input.platform}-task`);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const sessionId = `${prefix}-${stamp}${rand}`;
  const taskId = `task-${prefix}-${stamp}${rand}`;
  return { taskId, sessionId, prefix };
}

export function registerTask(record: AdaTaskRecord): void {
  tasksById.set(record.taskId, record);
  taskIdBySession.set(sessionKey(record.platform, record.sessionId), record.taskId);
}

export function getTaskById(taskId: string): AdaTaskRecord | undefined {
  return tasksById.get(taskId);
}

export function getTaskBySession(platform: AdaPlatform, sessionId: string): AdaTaskRecord | undefined {
  const id = taskIdBySession.get(sessionKey(platform, sessionId));
  return id ? tasksById.get(id) : undefined;
}

export function unregisterTask(taskId: string): AdaTaskRecord | undefined {
  const record = tasksById.get(taskId);
  if (!record) return undefined;
  tasksById.delete(taskId);
  taskIdBySession.delete(sessionKey(record.platform, record.sessionId));
  return record;
}

export function listRegisteredTasks(): AdaTaskRecord[] {
  return [...tasksById.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export function clearAllTasks(): void {
  tasksById.clear();
  taskIdBySession.clear();
}

export function handleBeginTask(
  args: Record<string, unknown>,
  deps: {
    normalizePlatform: (value: unknown, options?: { allowDefaultWeb?: boolean }) => AdaPlatform;
    mcpTextResult: (data: Record<string, unknown>) => unknown;
  }
): unknown {
  const platform = deps.normalizePlatform(args.platform, { allowDefaultWeb: true });
  const prefix = typeof args.prefix === "string" ? args.prefix : undefined;
  const allocated = allocateTaskIds({ platform, prefix });
  const record: AdaTaskRecord = {
    taskId: allocated.taskId,
    sessionId: allocated.sessionId,
    platform,
    prefix: allocated.prefix,
    createdAt: Date.now()
  };
  registerTask(record);
  touchSessionLease({
    platform: record.platform,
    sessionId: record.sessionId,
    source: "ada_begin_task",
    tool: "ada_begin_task"
  });
  return deps.mcpTextResult({
    status: "ok",
    recommended: true,
    note:
      "Optional helper. Reuse returned sessionId for this task until ada_end_task. " +
      "Hand-written sessionId still works without begin_task.",
    taskId: record.taskId,
    sessionId: record.sessionId,
    platform: record.platform,
    prefix: record.prefix,
    next:
      platform === "web"
        ? { tool: "ada_web_action", command: "navigate", sessionId: record.sessionId }
        : { tool: "ada_mobile_action", command: "launchApp", sessionId: record.sessionId }
  });
}

export async function handleEndTask(
  args: Record<string, unknown>,
  deps: {
    normalizePlatform: (value: unknown, options?: { allowDefaultWeb?: boolean }) => AdaPlatform;
    mergeWebEngineIntoPayload: (args: Record<string, unknown>) => Record<string, unknown>;
    closeSession: (
      platform: AdaPlatform,
      sessionId: string,
      options: { engine?: "playwright"; payload?: Record<string, unknown> }
    ) => Promise<boolean>;
    mcpTextResult: (data: Record<string, unknown>) => unknown;
  }
): Promise<unknown> {
  const taskIdArg = typeof args.taskId === "string" ? args.taskId.trim() : "";
  const sessionIdArg = typeof args.sessionId === "string" ? args.sessionId.trim() : "";

  let record = taskIdArg ? getTaskById(taskIdArg) : undefined;
  let platform: AdaPlatform;
  let sessionId: string;
  let taskId: string | undefined;

  if (record) {
    platform = record.platform;
    sessionId = record.sessionId;
    taskId = record.taskId;
  } else if (sessionIdArg) {
    platform = deps.normalizePlatform(args.platform, { allowDefaultWeb: true });
    sessionId = sessionIdArg;
    record = getTaskBySession(platform, sessionId);
    taskId = record?.taskId;
  } else {
    throw new Error("ada_end_task requires taskId or sessionId");
  }

  const payload = deps.mergeWebEngineIntoPayload(args);
  const engine =
    platform === "web" && typeof payload.engine === "string" ? (payload.engine as "playwright") : undefined;
  const closed = await deps.closeSession(platform, sessionId, { engine, payload });

  let iproxyStopped = 0;
  if (closed) {
    markSessionReleased(platform, sessionId, "ada_end_task");
    clearSessionLease(platform, sessionId);
    if (platform === "web") {
      clearWebSessionTrack(sessionId);
      clearActionLedger(sessionId);
      clearLocatorHintCache(sessionId);
    } else {
      invalidateMobilePageSourceCache(platform, sessionId);
      clearMobileSessionProbeCache(platform, sessionId);
      clearLocatorHintCache(sessionId);
    }
    if (platform === "ios") {
      const caps = asRecord(payload.capabilities);
      let udid = String(caps.udid ?? process.env.ADA_IOS_DEVICE_UDID ?? "").trim();
      if (!udid) {
        udid = String((await resolveIosDeviceUdid().catch(() => "")) ?? "").trim();
      }
      if (udid) {
        iproxyStopped = stopIosIproxyForUdid(udid);
      }
    }
  }

  if (taskId) {
    unregisterTask(taskId);
  }

  return deps.mcpTextResult({
    status: "ok",
    ended: true,
    closed,
    taskId: taskId ?? null,
    sessionId,
    platform,
    engine,
    iproxyStopped,
    note: "Task ended. Do not reuse this sessionId; call ada_begin_task for a new task."
  });
}
