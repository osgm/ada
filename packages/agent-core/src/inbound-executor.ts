import { TaskExecutor } from "@ada/core-kernel";
import type { StreamRequest, StreamResponse } from "@ada/transport-stream";
import { buildPluginHost } from "./plugin-registry.js";
import { executeInboundPlan, planInboundCommands, type InboundPlan } from "./inbound-command.js";
import { log } from "./logger.js";

/**
 * 控制端指令在本进程执行。
 * 依赖只在插件首次 ensureInitialized 时加载，之后复用同一个 TaskExecutor 和会话。
 * UI 指令串行，避免同一浏览器/设备并发；heartbeat/ping 等 meta 旁路队列，避免被长任务堵住。
 */
export function createInboundHandler(): (request: StreamRequest) => Promise<StreamResponse> {
  const executor = new TaskExecutor(buildPluginHost());
  let tail: Promise<unknown> = Promise.resolve();
  return (request) => {
    const plan = planInboundCommands(request);
    logInbound(request, plan);
    // meta / 非法请求立即返回，不占 UI 串行队列
    if (!plan.ok || plan.kind === "meta") {
      return executeInboundPlan(request, plan, (command) => executor.execute(command));
    }
    const job = tail.then(() =>
      executeInboundPlan(request, plan, (command) => executor.execute(command))
    );
    tail = job.then(
      () => undefined,
      () => undefined
    );
    return job;
  };
}

function logInbound(request: StreamRequest, plan: InboundPlan): void {
  log("info", {
    event: "control_plane.inbound",
    details: {
      requestId: request.requestId,
      action: request.action,
      commands: plan.ok && plan.kind === "commands" ? plan.commands.length : 0,
      meta: plan.ok && plan.kind === "meta"
    }
  });
}
