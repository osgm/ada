import { HttpTransport, type ITransport, type TransportResponse } from "@ada/transport-http";
import { StreamTransport } from "@ada/transport-stream";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { AgentConfig, SecretRecord, TransportMode } from "./types.js";
import { log } from "./logger.js";
import {
  registerAndSyncControlPlane,
  startControlPlaneHeartbeat,
  stopControlPlaneHeartbeat
} from "./control-plane-sync.js";
import { createInboundHandler } from "./inbound-executor.js";

function joinUrl(base: string, suffix: string): string {
  const normalizedBase = base.replace(/\/$/, "");
  if (!suffix.startsWith("/")) {
    return `${normalizedBase}/${suffix}`;
  }
  return `${normalizedBase}${suffix}`;
}

async function registerAgentOnControlPlane(
  transport: Pick<ITransport, "sendRequest">,
  secret: SecretRecord
): Promise<void> {
  try {
    await registerAndSyncControlPlane(transport, secret);
    startControlPlaneHeartbeat(transport);
  } catch (error) {
    log("warn", {
      event: "control_plane.register.failed",
      details: { reason: error instanceof Error ? error.message : String(error) }
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toCommandResult(command: CommandEnvelope, response: TransportResponse): CommandResult {
  if (!response.success) {
    return {
      requestId: command.requestId,
      success: false,
      errorCode: "TRANSPORT_REMOTE_EXECUTION_FAILED",
      errorMessage: response.error ?? "remote execution failed"
    };
  }

  const payload = asRecord(response.payload);
  const remoteResult = payload.result;
  if (remoteResult && typeof remoteResult === "object") {
    const result = remoteResult as CommandResult;
    return {
      requestId: result.requestId ?? command.requestId,
      success: Boolean(result.success),
      data: result.data,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage
    };
  }

  return {
    requestId: command.requestId,
    success: true,
    data: payload
  };
}

export interface RuntimeTransport {
  execute(command: CommandEnvelope): Promise<CommandResult>;
  close(): Promise<void>;
  /** 长连接可以接收控制端下发的指令；HTTP 降级只能主动上报。 */
  acceptsInbound: boolean;
}

function remoteToolAction(command: CommandEnvelope): string {
  if (command.platform === "web") return "ada_web_action";
  if (command.command === "recipe") return "ada_mobile_recipe";
  if (command.platform === "android" || command.platform === "ios" || command.platform === "harmony") {
    return "ada_mobile_action";
  }
  throw new Error(`unsupported remote platform for transport: ${command.platform}`);
}

function remoteToolPayload(command: CommandEnvelope): Record<string, unknown> {
  const payload = command.payload ?? {};
  if (command.command === "recipe") {
    const action = String(payload.action ?? "");
    const text = payload.text;
    return {
      requestId: command.requestId,
      sessionId: command.sessionId,
      platform: command.platform,
      action,
      text,
      payload
    };
  }
  if (command.platform === "web") {
    return {
      requestId: command.requestId,
      sessionId: command.sessionId,
      command: command.command,
      payload
    };
  }
  return {
    requestId: command.requestId,
    sessionId: command.sessionId,
    platform: command.platform,
    command: command.command,
    payload
  };
}

class TransportExecutor implements RuntimeTransport {
  constructor(
    private readonly transport: ITransport,
    private readonly mode: TransportMode,
    readonly acceptsInbound: boolean
  ) {}

  async execute(command: CommandEnvelope): Promise<CommandResult> {
    const action = remoteToolAction(command);
    const response = await this.transport.sendRequest({
      requestId: command.requestId,
      sessionId: command.sessionId,
      action,
      payload: remoteToolPayload(command)
    });
    const result = toCommandResult(command, response);
    log("info", {
      event: "transport.command.executed",
      details: {
        mode: this.mode,
        action,
        platform: command.platform,
        command: command.command,
        requestId: command.requestId,
        success: result.success,
        errorCode: result.errorCode
      }
    });
    return result;
  }

  async close(): Promise<void> {
    stopControlPlaneHeartbeat();
    await this.transport.close();
  }
}

async function tryCreateHttpTransport(config: AgentConfig, secret: SecretRecord): Promise<RuntimeTransport> {
  const transport = new HttpTransport({
    baseUrl: secret.serverUrl,
    requestPath: config.transport.requestPath,
    healthPath: config.transport.healthPath,
    defaultTimeoutMs: config.transport.requestTimeoutMs,
    apiToken: secret.token
  });
  await transport.connect();
  const health = await transport.health();
  if (!health.ok) {
    await transport.close();
    throw new Error(`http transport unavailable: ${health.detail}`);
  }
  log("info", { event: "transport.selected", details: { mode: "http", detail: health.detail } });
  await registerAgentOnControlPlane(transport, secret);
  return new TransportExecutor(transport, "http", false);
}

async function tryCreateStreamTransport(config: AgentConfig, secret: SecretRecord): Promise<RuntimeTransport> {
  if (config.transport.streamProtocol !== "websocket") {
    throw new Error(`unsupported stream protocol: ${config.transport.streamProtocol}`);
  }

  const streamUrl =
    secret.serverUrl.startsWith("https://")
      ? joinUrl(secret.serverUrl.replace(/^https:\/\//, "wss://"), config.transport.streamPath ?? "/ws")
      : joinUrl(secret.serverUrl.replace(/^http:\/\//, "ws://"), config.transport.streamPath ?? "/ws");
  const transport = new StreamTransport({
    url: streamUrl,
    defaultTimeoutMs: config.transport.requestTimeoutMs,
    apiToken: secret.token,
    onInbound: createInboundHandler()
  });
  await transport.connect();
  const health = await transport.health();
  if (!health.ok) {
    await transport.close();
    throw new Error(`stream transport unavailable: ${health.detail}`);
  }
  log("info", { event: "transport.selected", details: { mode: "stream", detail: health.detail, streamUrl } });
  await registerAgentOnControlPlane(transport as unknown as ITransport, secret);
  return new TransportExecutor(transport as unknown as ITransport, "stream", true);
}

export async function createRuntimeTransport(
  config: AgentConfig,
  secret: SecretRecord | null
): Promise<RuntimeTransport | null> {
  if (!secret) {
    return null;
  }

  if (config.transport.mode === "http") {
    return tryCreateHttpTransport(config, secret);
  }
  if (config.transport.mode === "stream") {
    return tryCreateStreamTransport(config, secret);
  }

  try {
    return await tryCreateStreamTransport(config, secret);
  } catch (streamError) {
    log("warn", {
      event: "transport.auto.fallback",
      details: {
        from: "stream",
        to: "http",
        reason: streamError instanceof Error ? streamError.message : String(streamError)
      }
    });
    return tryCreateHttpTransport(config, secret);
  }
}
