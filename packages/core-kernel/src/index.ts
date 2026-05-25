import type { CommandEnvelope, CommandResult, WebEngine } from "@ada/contracts";
import { parseWebEngineFromPayload } from "@ada/driver-rpc";
import { PluginHost } from "@ada/plugin-host";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";

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
    if (command.platform === "web") {
      const engine = parseWebEngineFromPayload(command.payload);
      return `web:${engine}:${command.sessionId}`;
    }
    return `${command.platform}:${command.sessionId}`;
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

  list(): Array<{ platform: string; sessionId: string; engine?: WebEngine; driverSessionId: string }> {
    const items: Array<{ platform: string; sessionId: string; engine?: WebEngine; driverSessionId: string }> = [];
    for (const [key, session] of this.sessions.entries()) {
      const parts = key.split(":");
      if (parts[0] === "web" && parts.length >= 3) {
        items.push({
          platform: "web",
          engine: parts[1] as WebEngine,
          sessionId: parts.slice(2).join(":"),
          driverSessionId: session.id
        });
        continue;
      }
      const idx = key.indexOf(":");
      if (idx <= 0) {
        continue;
      }
      items.push({
        platform: key.slice(0, idx),
        sessionId: key.slice(idx + 1),
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
    if (platform === "web") {
      const engine = options?.engine ?? parseWebEngineFromPayload(options?.payload);
      const key = `web:${engine}:${sessionId}`;
      const existed = this.sessions.get(key);
      this.sessions.delete(key);
      return existed;
    }
    const key = `${platform}:${sessionId}`;
    const existed = this.sessions.get(key);
    this.sessions.delete(key);
    return existed;
  }

  clearWebSession(sessionId: string, engine: WebEngine): DriverSession | undefined {
    const key = `web:${engine}:${sessionId}`;
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

  constructor(
    private readonly pluginHost: PluginHost,
    options: TaskExecutorOptions = {}
  ) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    this.retry = new RetryPolicyEngine(
      this.maxAttempts,
      new Set(options.retryableErrorCodes ?? ["TRANSIENT_DRIVER_ERROR", "NETWORK_TIMEOUT"])
    );
  }

  private async resolveContext(command: CommandEnvelope): Promise<ExecuteContext> {
    const plugin = this.pluginHost.resolve(command);
    await this.pluginHost.ensureInitialized(plugin.manifest.id);
    const session = await this.sessions.getOrCreate(plugin, command);
    return { plugin, session };
  }

  async execute(command: CommandEnvelope): Promise<CommandResult> {
    let attempt = 0;
    let lastFailure = this.resultAssembler.failure(command.requestId, "KERNEL_EXECUTION_FAILED", "unknown error");
    while (attempt < this.maxAttempts) {
      attempt += 1;
      try {
        const context = await this.resolveContext(command);
        const feature = this.featureNegotiator.check(context.plugin, command);
        if (!feature.ok) {
          return this.resultAssembler.failure(command.requestId, feature.code, feature.message);
        }
        const result = await context.plugin.execute(context.session, command);
        const normalized = this.resultAssembler.normalize(command.requestId, result);
        if (this.retry.shouldRetry(normalized, attempt)) {
          this.sessions.clear(command);
          lastFailure = normalized;
          continue;
        }
        return normalized;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = this.resultAssembler.failure(command.requestId, "KERNEL_EXECUTION_FAILED", message);
        if (this.retry.shouldRetry(failed, attempt)) {
          this.sessions.clear(command);
          lastFailure = failed;
          continue;
        }
        return failed;
      }
    }
    return lastFailure;
  }

  listSessions(): Array<{ platform: string; sessionId: string; driverSessionId: string }> {
    return this.sessions.list();
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
            command: "navigate"
          });
    const session = this.sessions.clearByPlatformSession(platform, sessionId, {
      engine,
      payload: options?.payload
    });
    if (!session) {
      return false;
    }
    if (plugin.destroySession) {
      await plugin.destroySession(session);
    }
    return true;
  }

  async closeAllSessions(): Promise<number> {
    const all = this.sessions.list();
    let closed = 0;
    for (const item of all) {
      const ok = await this.closeSession(item.platform, item.sessionId, {
        engine: item.engine,
        payload: item.engine ? { engine: item.engine } : undefined
      });
      if (ok) {
        closed += 1;
      }
    }
    return closed;
  }
}
