/**
 * 最小 ADA 执行器封装（示例脚本共用，约 50 行）
 * 等价于 MCP 的 ada_web_action / ada_mobile_action / ada_mobile_recipe
 */
import path from "node:path";
import { loadExecutor } from "./load-executor.mjs";
import { repoRoot } from "./repo-root.mjs";
import { applyToolsPath } from "./resolve-tools.mjs";

let executor;
let processCleanupRegistered = false;
let quitDone = false;
/** 为 true 时脚本正常结束不自动 quit（供同进程后续步骤或其它脚本复用会话） */
let keepAlive = false;
let quitInFlight = null;

/** 软退出默认等待上限（毫秒）；超时后走 {@link shutdownExecutor} 的 force 路径（不等待） */
const SOFT_QUIT_TIMEOUT_MS = 10_000;

function envKeepAlive() {
  const v = process.env.ADA_KEEP_ALIVE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 是否保持 ADA 执行器/浏览器（不自动 quit） */
export function isKeepAlive() {
  return keepAlive || envKeepAlive();
}

/** 显式保持或恢复自动 quit：open(browser({ keepAlive: true })) 会设为 true */
export function setKeepAlive(value = true) {
  keepAlive = Boolean(value);
}

export async function init(root = repoRoot) {
  applyToolsPath();
  process.chdir(root);
  if (!executor) {
    executor = await loadExecutor(root);
    registerAdaProcessCleanup();
  }
  return executor;
}

/** 关闭全部会话并 dispose 驱动；脚本正常结束也会自动调用（除非 keepAlive） */
export async function quit(options = {}) {
  if (quitInFlight) return quitInFlight;
  quitDone = true;

  if (!executor) return 0;

  if (options.force) {
    quitInFlight = (async () => {
      try {
        const { shutdownExecutor } = executor;
        await shutdownExecutor({ force: true });
        return 0;
      } catch {
        return 0;
      } finally {
        executor = null;
        quitInFlight = null;
      }
    })();
    return quitInFlight;
  }

  const softTimeoutMs = options.timeoutMs ?? SOFT_QUIT_TIMEOUT_MS;

  quitInFlight = (async () => {
    let closed = 0;
    const current = executor;
    if (process.env.ADA_TRACE?.trim()) {
      console.error("[ada] quit start");
    }
    try {
      const { shutdownExecutor } = current;
      const softResult = await Promise.race([
        shutdownExecutor({ timeoutMs: softTimeoutMs }),
        new Promise((resolve) =>
          setTimeout(() => resolve("__SOFT_TIMEOUT__"), softTimeoutMs)
        )
      ]);
      if (softResult !== "__SOFT_TIMEOUT__") {
        return Number(softResult ?? 0);
      }

      // 软退出超时：立即强制释放（不等待，失败也不阻塞后续）
      console.error(`[ada] quit soft-timeout (${softTimeoutMs}ms), force cleanup (no wait)...`);
      try {
        await shutdownExecutor({ force: true });
      } catch {
        // ignore
      }
      return 0;
    } catch {
      // 出现异常也不阻塞后续执行
      return 0;
    } finally {
      executor = null;
      quitInFlight = null;
      if (process.env.ADA_TRACE?.trim()) {
        console.error("[ada] quit end");
      }
    }
  })();

  closed = await quitInFlight;
  return closed;
}

/**
 * E2E 脚本末尾：释放 MCP 客户端 / 本地执行器会话，再退出当前脚本进程。
 * 不结束 Host 侧 MCP Server（`page.close()` / `phone.exit()` 同理，仅关会话）。
 * keepAlive 或 ADA_NO_HARD_EXIT=1 时不 exit 进程。
 */
/** 结束脚本：释放连接并退出 Node 进程（除非 keepAlive） */
export async function exit(code) {
  if (isKeepAlive() || process.env.ADA_NO_HARD_EXIT?.trim() === "1") {
    return;
  }
  try {
    const { releaseMcpTransport } = await import("./ada-mcp.mjs");
    await releaseMcpTransport();
  } catch {
    // ignore
  }
  await quit().catch(() => undefined);
  process.exit(code ?? process.exitCode ?? 0);
}

/**
 * 进程信号 / 未捕获异常时尽力关闭浏览器，避免 E2E 失败后 Chrome 泄漏、反复重跑堆进程。
 */
export function registerAdaProcessCleanup() {
  if (processCleanupRegistered) return;
  processCleanupRegistered = true;

  let autoQuitInFlight = false;
  process.on("beforeExit", async () => {
    if (quitDone || isKeepAlive() || !executor || autoQuitInFlight) return;
    autoQuitInFlight = true;
    try {
      await quit();
    } catch {
      // ignore
    }
  });

  let shuttingDown = false;
  const emergencyShutdown = async (reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await quit();
    } catch {
      // ignore
    }
    if (reason) {
      console.error(`[ada] 紧急清理 (${reason})`);
    }
  };

  process.once("SIGINT", () => {
    void emergencyShutdown("SIGINT").finally(() => process.exit(130));
  });
  process.once("SIGTERM", () => {
    void emergencyShutdown("SIGTERM").finally(() => process.exit(143));
  });
  process.once("uncaughtException", (err) => {
    void emergencyShutdown("uncaughtException").finally(() => {
      console.error(err?.stack ?? err);
      process.exit(1);
    });
  });
  process.once("unhandledRejection", (reason) => {
    void emergencyShutdown("unhandledRejection").finally(() => {
      console.error(reason);
      process.exit(1);
    });
  });
}

function traceEnabled() {
  const v = process.env.ADA_TRACE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 执行一条命令，返回 { success, data, errorCode, errorMessage } */
export async function ada(platform, sessionId, command, payload = {}) {
  const requestId = `${sessionId}-${command}-${Date.now()}`;
  const started = traceEnabled() ? performance.now() : 0;
  const { runCommand } = await init(process.cwd());
  const result = await runCommand({
    requestId,
    sessionId,
    platform,
    command,
    payload
  });
  if (traceEnabled()) {
    const ms = Math.round(performance.now() - started);
    console.error(
      `[ada:trace] requestId=${requestId} platform=${platform} command=${command} ok=${result.success} ${ms}ms`
    );
  }
  return result;
}

/** 移动 recipe：fill_search / tap_search / dump_ui（语义命令 recipe，执行层会展开为 custom） */
export async function adaRecipe(platform, sessionId, action, base, text) {
  return ada(platform, sessionId, "recipe", {
    ...base,
    action,
    ...(text != null && text !== "" ? { text } : {})
  });
}

/** 仅关闭指定 sessionId；脚本结束请再调 {@link quit} 释放驱动与进程句柄 */
export async function adaClose(platform, sessionId, base = {}) {
  const { closeSession } = await init(process.cwd());
  const closed = await closeSession(platform, sessionId, { payload: base });
  if (!closed) {
    throw new Error(`closeSession returned false: platform=${platform} sessionId=${sessionId}`);
  }
  return closed;
}

export function mustOk(result, step) {
  if (!result.success) {
    const recipe = result.data?.recipe;
    const code = result.errorCode ?? recipe?.errorCode ?? "FAIL";
    const msg = result.errorMessage ?? recipe?.detail ?? "";
    const detail = result.data ? ` ${JSON.stringify(result.data)}` : "";
    throw new Error(`${step}: ${code} ${msg}${detail}`.trim());
  }
  return result;
}

/** 脚本级强制等待（毫秒）；操作本身已有 auto-wait，一般不必调用 */
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** @deprecated 使用 wait；保留别名 */
export const sleep = wait;
