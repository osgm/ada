export interface StreamRequest {
  requestId: string;
  sessionId?: string;
  action: string;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface StreamResponse {
  requestId: string;
  success: boolean;
  payload?: Record<string, unknown>;
  error?: string;
}

export interface StreamHealth {
  ok: boolean;
  detail: string;
}

export interface IStreamTransport {
  connect(): Promise<void>;
  close(): Promise<void>;
  sendRequest(request: StreamRequest): Promise<StreamResponse>;
  health(): Promise<StreamHealth>;
}

export type InboundHandler = (request: StreamRequest) => Promise<StreamResponse>;

export interface StreamTransportOptions {
  url: string;
  defaultTimeoutMs?: number;
  /** 控制端颁发的 Agent API Token（握手 ?token=） */
  apiToken?: string;
  /** 控制端下发、且不是本端 pending 响应时执行 */
  onInbound?: InboundHandler;
}

export type StreamRoute =
  | { kind: "ignore" }
  | { kind: "response"; response: StreamResponse }
  | { kind: "inbound"; request: StreamRequest };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** 同一条 WebSocket 上区分：本端在等的响应、控制端下发的指令、欢迎包等可忽略消息。 */
export function classifyStreamMessage(
  parsed: unknown,
  isPending: (requestId: string) => boolean
): StreamRoute {
  if (!parsed || typeof parsed !== "object") {
    return { kind: "ignore" };
  }
  const record = parsed as Record<string, unknown>;
  const requestId = typeof record.requestId === "string" ? record.requestId : "";
  if (!requestId) {
    return { kind: "ignore" };
  }
  if (isPending(requestId)) {
    return {
      kind: "response",
      response: {
        requestId,
        success: Boolean(record.success),
        payload: asRecord(record.payload),
        error: typeof record.error === "string" ? record.error : undefined
      }
    };
  }
  const action = typeof record.action === "string" ? record.action.trim() : "";
  if (action && record.success === undefined) {
    return {
      kind: "inbound",
      request: {
        requestId,
        sessionId: typeof record.sessionId === "string" ? record.sessionId : undefined,
        action,
        payload: asRecord(record.payload),
        timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : undefined
      }
    };
  }
  return { kind: "ignore" };
}

export function appendTokenToWsUrl(url: string, apiToken?: string): string {
  const token = apiToken?.trim();
  if (!token) {
    return url;
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

export class StreamTransport implements IStreamTransport {
  private readonly url: string;
  private readonly defaultTimeoutMs: number;
  private readonly onInbound?: InboundHandler;
  private socket: WebSocket | null = null;
  private readonly pending = new Map<
    string,
    { resolve: (value: StreamResponse) => void; reject: (reason?: unknown) => void; timer: NodeJS.Timeout }
  >();

  constructor(options: StreamTransportOptions) {
    this.url = appendTokenToWsUrl(options.url, options.apiToken);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10000;
    this.onInbound = options.onInbound;
  }

  async connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(this.url);
        ws.onopen = () => {
          this.socket = ws;
          resolve();
        };
        ws.onerror = () => reject(new Error("stream transport connect failed"));
        ws.onmessage = (event) => this.onMessage(event.data);
        ws.onclose = () => {
          this.socket = null;
          this.rejectAllPending("stream transport closed");
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async close(): Promise<void> {
    if (!this.socket) {
      return;
    }
    this.socket.close();
    this.socket = null;
    this.rejectAllPending("stream transport closed by caller");
  }

  async sendRequest(request: StreamRequest): Promise<StreamResponse> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return {
        requestId: request.requestId,
        success: false,
        error: "stream transport not connected"
      };
    }
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    return new Promise<StreamResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        resolve({
          requestId: request.requestId,
          success: false,
          error: `stream request timeout after ${timeoutMs}ms`
        });
      }, timeoutMs);

      this.pending.set(request.requestId, { resolve, reject, timer });
      this.socket?.send(JSON.stringify(request));
    });
  }

  async health(): Promise<StreamHealth> {
    const connected = Boolean(this.socket && this.socket.readyState === WebSocket.OPEN);
    return {
      ok: connected,
      detail: connected ? "stream connected" : "stream not connected"
    };
  }

  private onMessage(raw: unknown): void {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      return;
    }
    const route = classifyStreamMessage(parsed, (requestId) => this.pending.has(requestId));
    if (route.kind === "response") {
      const pending = this.pending.get(route.response.requestId);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(route.response.requestId);
      pending.resolve(route.response);
      return;
    }
    if (route.kind === "inbound" && this.onInbound) {
      void this.dispatchInbound(route.request);
    }
  }

  private async dispatchInbound(request: StreamRequest): Promise<void> {
    let response: StreamResponse;
    try {
      response = await this.onInbound!(request);
    } catch (error) {
      response = {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    if (!response.requestId) {
      response = { ...response, requestId: request.requestId };
    }
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(response));
  }

  private rejectAllPending(message: string): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({ requestId, success: false, error: message });
    }
    this.pending.clear();
  }
}
