import { clearActionLedger } from "./mcp-action-ledger.js";
import { clearLocatorHintCache } from "./mcp-locator-cache.js";
import { invalidateMobilePageSourceCache } from "./mcp-mobile-dump-cache.js";
import { clearMobileSessionProbeCache } from "./mcp-mobile-session-liveness.js";
import type { AdaPlatform } from "./mcp-normalize.js";
import { clearSessionLease } from "./mcp-session-lease.js";
import { clearWebSessionTrack } from "./mcp-session-liveness.js";
import { getTaskBySession, unregisterTask } from "./mcp-task-lifecycle.js";

/** 内核已释放驱动会话时，清掉 MCP 侧按 session 堆积的缓存（不关浏览器，浏览器由内核 destroy）。 */
export function releaseMcpSessionCaches(platform: string, sessionId: string): void {
  const id = sessionId.trim();
  if (!id) return;
  clearSessionLease(platform, id);
  clearLocatorHintCache(id);
  clearActionLedger(id);
  if (platform === "web") {
    clearWebSessionTrack(id);
  } else if (platform === "android" || platform === "ios" || platform === "harmony") {
    invalidateMobilePageSourceCache(platform, id);
    clearMobileSessionProbeCache(platform as AdaPlatform, id);
  }
  const task = getTaskBySession(platform as AdaPlatform, id);
  if (task) unregisterTask(task.taskId);
}
