import type { CommandEnvelope, CommandResult, WebEngine } from "@ada/contracts";
import {
  buildExecutionGateKey,
  buildKernelSessionKey,
  CommandTimeoutError,
  isSessionReadOnlyCommand,
  isTransientMobileErrorCode,
  MOBILE_TRANSIENT_ERROR_CODES,
  parseKernelSessionKey,
  parseWebEngineFromPayload,
  raceCommandTimeout,
  resolveCommandTimeoutMs,
  shouldReleaseSessionOnTimeout,
  shouldSerializeMobileDevice,
  suggestNextSessionId
} from "@ada/driver-rpc";
import { PluginHost } from "@ada/plugin-host";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import { SessionGate } from "./session-gate.js";

export interface TaskExecutorOptions {
  maxAttempts?: number;
  retryableErrorCodes?: string[];
}

interface ExecuteContext {
  plugin: DriverPlugin;
  session: DriverSession;
}

export class DriverSessionManager {
  private readonly sessions = new Map<string, DriverSession>();

  private sessionKey(command: Pick<CommandEnvelope, "platform" | "sessionId" | "payload">): string {
    return buildKernelSessionKey(command.platform, command.sessionId, command.payload);
  }

  async getOrCreate(plugin: DriverPlugin, command: CommandEnvelope): Promise<DriverSession> {
    const key = this.sessionKey(command);
    const existed = this.sessions.get(key);
    if (existed) {
      return existed;
    }
    const created = await plugin.createSession(command.platform);
    this.sessions.set(key, created);
    return created;
  }

  get(command: Pick<CommandEnvelope, "platform" | "sessionId" | "payload">): DriverSession | undefined {
    const key = this.sessionKey(command);
    return this.sessions.get(key);
  }

  list(): Array<{
    platform: string;
    sessionId: string;
    engine?: WebEngine;
    deviceId?: string;
    driverSessionId: string;
  }> {
    const items: Array<{
      platform: string;
      sessionId: string;
      engine?: WebEngine;
      deviceId?: string;
      driverSessionId: string;
    }> = [];
    for (const [key, session] of this.sessions.entries()) {
      const parsed = parseKernelSessionKey(key);
      if (!parsed) continue;
      if (parsed.platform === "web") {
        items.push({
          platform: "web",
          engine: parsed.engine as WebEngine | undefined,
          sessionId: parsed.sessionId,
          driverSessionId: session.id
        });
        continue;
      }
      items.push({
        platform: parsed.platform,
        sessionId: parsed.sessionId,
        deviceId: parsed.deviceId,
        driverSessionId: session.id
      });
    }
    return items;
  }

  clear(command: CommandEnvelope): DriverSession | undefined {
    const key = this.sessionKey(command);
    const existed = this.sessions.get(key);
    this.sessions.delete(key);
    return existed;
  }

  clearByPlatformSession(
    platform: string,
    sessionId: string,
    options?: { engine?: WebEngine; payload?: Record<string, unknown> }
  ): DriverSession | undefined {
    const key = buildKernelSessionKey(platform, sessionId, options?.payload);
    const direct = this.sessions.get(key);
    if (direct) {
      this.sessions.delete(key);
      return direct;
    }
    let closed: DriverSession | undefined;
    for (const k of Array.from(this.sessions.keys())) {
      const parsed = parseKernelSessionKey(k);
      if (parsed?.platform === platform && parsed.sessionId === sessionId) {
        closed = this.sessions.get(k);
        this.sessions.delete(k);
      }
    }
    return closed;
  }

  clearWebSession(sessionId: string, engine: WebEngine): DriverSession | undefined {
    const key = buildKernelSessionKey("web", sessionId, { engine });
    const existed = this.sessions.get(key);
    this.sessions.delete(key);
    return existed;
  }

  clearAll(): DriverSession[] {
    const all = Array.from(this.sessions.values());
    this.sessions.clear();
    return all;
  }
}

export class RetryPolicyEngine {
  constructor(
    private readonly maxAttempts: number,
    private readonly retryableErrorCodes: Set<string>
  ) {}

  shouldRetry(result: CommandResult, attempt: number): boolean {
    if (attempt >= this.maxAttempts) {
      return false;
    }
    if (result.success) {
      return false;
    }
    if (!result.errorCode) {
      return true;
    }
    return this.retryableErrorCodes.has(result.errorCode);
  }
}

export class ResultAssembler {
  success(requestId: string, data?: Record<string, unknown>): CommandResult {
    return {
      requestId,
      success: true,
      data
    };
  }

  failure(requestId: string, errorCode: string, errorMessage: string): CommandResult {
    return {
      requestId,
      success: false,
      errorCode,
      errorMessage
    };
  }

  normalize(requestId: string, result: CommandResult): CommandResult {
    return {
      requestId,
      success: Boolean(result.success),
      data: result.data,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage
    };
  }
}

export class FeatureNegotiator {
  normalize(command: string): string {
    if (command === "click") {
      return "tap";
    }
    return command;
  }

  check(plugin: DriverPlugin, command: CommandEnvelope): { ok: true } | { ok: false; code: string; message: string } {
    const expected = this.normalize(command.command);
    const declared = new Set(plugin.manifest.capabilities.map((item) => this.normalize(item)));
    if (declared.has(expected)) {
      return { ok: true };
    }
    return {
      ok: false,
      code: "DRIVER_CAPABILITY_UNSUPPORTED",
      message: `Plugin ${plugin.manifest.id} does not support command ${command.command} on platform ${command.platform}`
    };
  }
}

export class TaskExecutor {
  private readonly retry: RetryPolicyEngine;
  private readonly maxAttempts: number;

  private readonly sessions = new DriverSessionManager();

  private readonly resultAssembler = new ResultAssembler();
  private readonly featureNegotiator = new FeatureNegotiator();
  /**
   * 同 session：只读可并行，写操作互斥（避免串单）。
   * 设 ADA_SESSION_SERIALIZE_ALL=1 时退回全串行。
   */
  private readonly sessionGates = new Map<string, SessionGate>();

  constructor(
    private readonly pluginHost: PluginHost,
    options: TaskExecutorOptions = {}
  ) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    this.retry = new RetryPolicyEngine(
      this.maxAttempts,
      new Set(options.retryableErrorCodes ?? MOBILE_TRANSIENT_ERROR_CODES)
    );
  }

  /** 执行互斥闸门：移动同设备跨 sessionId 共用一把锁；会话存储仍用 buildKernelSessionKey */
  private sessionQueueKey(command: CommandEnvelope): string {
    return buildExecutionGateKey(command.platform, command.sessionId, command.payload);
  }

  private forceSerializeAll(): boolean {
    const v = process.env.ADA_SESSION_SERIALIZE_ALL?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  }

  /** 移动端同设备：默认全部命令互斥（含 extract），避免并行串台 */
  private forceMobileDeviceExclusive(command: CommandEnvelope): boolean {
    return shouldSerializeMobileDevice(command.platform);
  }

  private gateFor(key: string): SessionGate {
    let gate = this.sessionGates.get(key);
    if (!gate) {
      gate = new SessionGate();
      this.sessionGates.set(key, gate);
    }
    return gate;
  }

  private forgetIdleGate(key: string): void {
    const gate = this.sessionGates.get(key);
    if (gate?.isIdle()) {
      this.sessionGates.delete(key);
    }
  }

  private shouldRetryCommand(result: CommandResult, attempt: number, platform: CommandEnvelope["platform"]): boolean {
    if (result.errorCode === "COMMAND_TIMEOUT") {
      return false;
    }
    if (!this.retry.shouldRetry(result, attempt)) {
      return false;
    }
    if (platform === "web") {
      return true;
    }
    return isTransientMobileErrorCode(result.errorCode) || !result.errorCode;
  }

  private async runPluginExecute(context: ExecuteContext, command: CommandEnvelope): Promise<CommandResult> {
    const timeoutMs = resolveCommandTimeoutMs(command.payload, command.command);
    const work = context.plugin.execute(context.session, command);
    try {
      return await raceCommandTimeout(work, timeoutMs, `${command.platform}:${command.command}`);
    } catch (error) {
      if (error instanceof CommandTimeoutError) {
        await this.teardownSession(command, context.plugin, context.session);
        throw error;
      }
      throw error;
    }
  }

  /** 打开页 / 前置条件 / 长时间无正确响应超时：释放驱动会话，避免连接泄漏 */
  private shouldReleaseOnFailedResult(command: CommandEnvelope, result: CommandResult): boolean {
    if (result.success) {
      return false;
    }
    return shouldReleaseSessionOnTimeout({
      command: command.command,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage
    });
  }

  private static readonly DESTROY_SESSION_MS = 20_000;

  private async resolveContext(command: CommandEnvelope): Promise<ExecuteContext> {
    const plugin = this.pluginHost.resolve(command);
    await this.pluginHost.ensureInitialized(plugin.manifest.id);
    const session = await this.sessions.getOrCreate(plugin, command);
    return { plugin, session };
  }

  /** 从内核注销并销毁驱动会话，避免超时/失败后浏览器进程泄漏 */
  private async teardownSession(command: CommandEnvelope, plugin: DriverPlugin, session: DriverSession): Promise<void> {
    this.sessions.clear(command);
    if (!plugin.destroySession) {
      return;
    }
    await Promise.race([
      plugin.destroySession(session),
      new Promise<void>((resolve) => setTimeout(resolve, TaskExecutor.DESTROY_SESSION_MS))
    ]).catch(() => undefined);
    this.forgetIdleGate(this.sessionQueueKey(command));
  }

  private withSessionReleasedMeta(
    command: CommandEnvelope,
    result: CommandResult,
    extra?: Record<string, unknown>
  ): CommandResult {
    const suggestedSessionId = suggestNextSessionId(command.sessionId);
    return {
      ...result,
      data: {
        ...(result.data ?? {}),
        sessionReleased: true,
        requireNewSessionId: true,
        previousSessionId: command.sessionId,
        suggestedSessionId,
        ...(extra ?? {})
      }
    };
  }

  /**
   * Web 同 session 写冲突时是否返回 SESSION_BUSY（避免静默排队）。
   * 白名单模式（默认 heavy）：开页 + recipe/invoke/custom；
   * `ADA_WEB_SESSION_BUSY_WRITES=all` 扩到全部写；`=open` 仅开页；总开关仍可用 `ADA_WEB_SESSION_BUSY_ON_PARALLEL_START=0`。
   */
  private shouldRejectBusyWebWrite(command: CommandEnvelope): boolean {
    if (command.platform !== "web") return false;
    const raw = process.env.ADA_WEB_SESSION_BUSY_ON_PARALLEL_START?.trim().toLowerCase();
    if (raw === "0" || raw === "false" || raw === "off") return false;
    if (command.payload?.allowQueuedStart === true) return false;

    const cmd = command.command;
    const openPage = cmd === "navigate" || cmd === "newTab" || cmd === "reload";
    const heavyWrite = cmd === "recipe" || cmd === "invoke" || cmd === "custom";
    const mode = (process.env.ADA_WEB_SESSION_BUSY_WRITES?.trim().toLowerCase() || "heavy") as string;
    if (mode === "open" || mode === "navigate") {
      return openPage;
    }
    if (mode === "all" || mode === "1" || mode === "true") {
      return true;
    }
    // default heavy：开页 + 重写操作；click/type 等仍可排队（同任务连点更安全）
    return openPage || heavyWrite;
  }

  async execute(command: CommandEnvelope): Promise<CommandResult> {
    const key = this.sessionQueueKey(command);
    const readOnly =
      !this.forceSerializeAll() &&
      !this.forceMobileDeviceExclusive(command) &&
      isSessionReadOnlyCommand(command);
    const gate = this.gateFor(key);
    if (!readOnly && this.shouldRejectBusyWebWrite(command) && gate.isWriteContended()) {
      const suggestedSessionId = suggestNextSessionId(command.sessionId);
      const failed = this.resultAssembler.failure(
        command.requestId,
        "SESSION_BUSY",
        `Session "${command.sessionId}" is busy with another write (${command.command}). ` +
          `For a parallel web task use new sessionId="${suggestedSessionId}" then navigate. ` +
          `For the same task: wait for the in-flight command, then retry this sessionId ` +
          `(or payload.allowQueuedStart=true to queue). ` +
          `(ADA_WEB_SESSION_BUSY_WRITES=open|heavy|all; ADA_WEB_SESSION_BUSY_ON_PARALLEL_START=0 disables.)`
      );
      return {
        ...failed,
        data: {
          ...(failed.data ?? {}),
          sessionBusy: true,
          requireNewSessionId: true,
          previousSessionId: command.sessionId,
          suggestedSessionId,
          busyCommand: command.command
        }
      };
    }
    const release = await gate.acquire(readOnly);
    try {
      return await this.executeExclusive(command);
    } finally {
      release();
    }
  }

  private async executeExclusive(command: CommandEnvelope): Promise<CommandResult> {
    let attempt = 0;
    let lastFailure = this.resultAssembler.failure(command.requestId, "KERNEL_EXECUTION_FAILED", "unknown error");
    while (attempt < this.maxAttempts) {
      attempt += 1;
      const t0 = Date.now();
      let context: ExecuteContext | undefined;
      try {
        context = await this.resolveContext(command);
        const feature = this.featureNegotiator.check(context.plugin, command);
        if (!feature.ok) {
          return this.resultAssembler.failure(command.requestId, feature.code, feature.message);
        }
        const result = await this.runPluginExecute(context, command);
        const normalized = this.resultAssembler.normalize(command.requestId, {
          ...result,
          data: {
            ...(result.data ?? {}),
            timingMs: Date.now() - t0,
            attempt
          }
        });
        if (this.shouldReleaseOnFailedResult(command, normalized)) {
          await this.teardownSession(command, context.plugin, context.session);
          return this.withSessionReleasedMeta(command, {
            ...normalized,
            errorCode: normalized.errorCode || "PRECONDITION_TIMEOUT"
          });
        }
        if (this.shouldRetryCommand(normalized, attempt, command.platform)) {
          await this.teardownSession(command, context.plugin, context.session);
          lastFailure = normalized;
          continue;
        }
        return normalized;
      } catch (error) {
        if (error instanceof CommandTimeoutError) {
          // teardown 已在 runPluginExecute 完成；标记必须换 sessionId
          const timedOut = this.resultAssembler.failure(
            command.requestId,
            "COMMAND_TIMEOUT",
            error.message
          );
          return this.withSessionReleasedMeta(command, timedOut);
        }
        const message = error instanceof Error ? error.message : String(error);
        const failed = this.resultAssembler.failure(command.requestId, "KERNEL_EXECUTION_FAILED", message);
        if (context) {
          await this.teardownSession(command, context.plugin, context.session);
        } else {
          const plugin = this.pluginHost.resolve(command);
          const orphaned = this.sessions.clear(command);
          if (orphaned && plugin.destroySession) {
            await Promise.race([
              plugin.destroySession(orphaned),
              new Promise<void>((resolve) => setTimeout(resolve, TaskExecutor.DESTROY_SESSION_MS))
            ]).catch(() => undefined);
          }
        }
        if (this.shouldRetryCommand(failed, attempt, command.platform)) {
          lastFailure = failed;
          continue;
        }
        // 已 teardown 清理驱动，但仅超时/前置类失败才强制换 sessionId（避免业务错误杀）
        if (
          this.shouldReleaseOnFailedResult(command, failed) ||
          shouldReleaseSessionOnTimeout({
            command: command.command,
            errorCode: failed.errorCode,
            errorMessage: failed.errorMessage
          })
        ) {
          return this.withSessionReleasedMeta(command, failed);
        }
        return {
          ...failed,
          data: {
            ...(failed.data ?? {}),
            driverSessionCleared: true
          }
        };
      }
    }
    return lastFailure;
  }

  listSessions(): Array<{
    platform: string;
    sessionId: string;
    deviceId?: string;
    driverSessionId: string;
  }> {
    return this.sessions.list();
  }

  /** Playwright 真实浏览器数（闸门同源）；不可用时 undefined */
  countPlaywrightBrowsers(): number | undefined {
    return this.pluginHost.getActiveBrowserCount("playwright");
  }

  async closeSession(
    platform: string,
    sessionId: string,
    options?: { engine?: WebEngine; payload?: Record<string, unknown> }
  ): Promise<boolean> {
    const plat = platform as CommandEnvelope["platform"];
    const engine =
      plat === "web" ? (options?.engine ?? parseWebEngineFromPayload(options?.payload)) : undefined;
    const plugin =
      plat === "web"
        ? this.pluginHost.resolve({
            requestId: "",
            sessionId,
            platform: "web",
            command: "navigate",
            payload: { engine, ...options?.payload }
          })
        : this.pluginHost.resolve({
            requestId: "",
            sessionId,
            platform: plat,
            command: "navigate",
            payload: options?.payload
          });
    const session = this.sessions.clearByPlatformSession(platform, sessionId, {
      engine,
      payload: options?.payload
    });
    if (!session) {
      return false;
    }
    if (plugin.destroySession) {
      await Promise.race([
        plugin.destroySession(session),
        new Promise<void>((resolve) => setTimeout(resolve, TaskExecutor.DESTROY_SESSION_MS))
      ]).catch(() => undefined);
    }
    this.forgetIdleGate(buildExecutionGateKey(platform, sessionId, options?.payload));
    return true;
  }

  async closeAllSessions(shouldAbort?: () => boolean): Promise<number> {
    const all = this.sessions.list();
    let closed = 0;
    for (const item of all) {
      if (shouldAbort?.()) {
        break;
      }
      const ok = await this.closeSession(item.platform, item.sessionId, {
        engine: item.engine,
        payload: item.engine ? { engine: item.engine } : item.deviceId ? { capabilities: { udid: item.deviceId } } : undefined
      });
      if (ok) {
        closed += 1;
      }
    }
    return closed;
  }
}
