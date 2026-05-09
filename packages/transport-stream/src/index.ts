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

export interface StreamTransportOptions {
  url: string;
  defaultTimeoutMs?: number;
}

export class StreamTransport implements IStreamTransport {
  private readonly url: string;
  private readonly defaultTimeoutMs: number;
  private socket: WebSocket | null = null;
  private readonly pending = new Map<
    string,
    { resolve: (value: StreamResponse) => void; reject: (reason?: unknown) => void; timer: NodeJS.Timeout }
  >();

  constructor(options: StreamTransportOptions) {
    this.url = options.url;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10000;
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
    let parsed: Partial<StreamResponse> | null = null;
    try {
      parsed = JSON.parse(String(raw)) as Partial<StreamResponse>;
    } catch {
      return;
    }
    if (!parsed?.requestId) {
      return;
    }
    const pending = this.pending.get(parsed.requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(parsed.requestId);
    pending.resolve({
      requestId: parsed.requestId,
      success: Boolean(parsed.success),
      payload: parsed.payload,
      error: parsed.error
    });
  }

  private rejectAllPending(message: string): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({ requestId, success: false, error: message });
    }
    this.pending.clear();
  }
}
