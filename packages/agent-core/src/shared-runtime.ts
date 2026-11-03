import { TaskExecutor } from "@ada/core-kernel";
import type { PluginHost } from "@ada/plugin-host";
import {
  buildPluginHost,
  listBuiltInPluginManifests,
  peekPluginHostCache,
  resetPluginHostCache
} from "./plugin-registry.js";

export { listBuiltInPluginManifests };

/**
 * 进程内共享运行时：MCP 工具执行与控制面 inbound 共用同一 PluginHost + TaskExecutor，
 * 避免双实例导致会话分裂、depsGate 重复、浏览器/设备资源翻倍。
 */
let sharedExecutor: TaskExecutor | null = null;

export function getSharedPluginHost(): PluginHost {
  return buildPluginHost();
}

export function getSharedTaskExecutor(): TaskExecutor {
  if (!sharedExecutor) {
    sharedExecutor = new TaskExecutor(getSharedPluginHost());
  }
  return sharedExecutor;
}

/** 不创建；shutdown 用。 */
export function peekSharedRuntime(): { host: PluginHost | null; executor: TaskExecutor | null } {
  return { host: peekPluginHostCache(), executor: sharedExecutor };
}

/** 测试或 shutdown 后清空；下次调用会重建。 */
export function resetSharedRuntime(): void {
  sharedExecutor = null;
  resetPluginHostCache();
}
