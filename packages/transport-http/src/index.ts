export interface TransportRequest {
  requestId: string;
  sessionId?: string;
  action: string;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface TransportResponse {
  requestId: string;
  success: boolean;
  payload?: Record<string, unknown>;
  error?: string;
}

export interface TransportHealth {
  ok: boolean;
  detail: string;
}

export interface ITransport {
  connect(): Promise<void>;
  close(): Promise<void>;
  sendRequest(request: TransportRequest): Promise<TransportResponse>;
  health(): Promise<TransportHealth>;
}

export interface HttpTransportOptions {
  baseUrl: string;
  requestPath?: string;
  healthPath?: string;
  defaultTimeoutMs?: number;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function withTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer)
  };
}

export class HttpTransport implements ITransport {
  private readonly baseUrl: string;
  private readonly requestPath: string;
  private readonly healthPath: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.requestPath = options.requestPath ?? "/api/v1/execute";
    this.healthPath = options.healthPath ?? "/health";
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 8000;
  }

  async connect(): Promise<void> {
    // HTTP is stateless; no persistent setup needed.
  }

  async close(): Promise<void> {
    // HTTP is stateless; no persistent teardown needed.
  }

  async sendRequest(request: TransportRequest): Promise<TransportResponse> {
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const timeout = withTimeoutSignal(timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${this.requestPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: timeout.signal
      });
      const data = (await res.json().catch(() => ({}))) as Partial<TransportResponse>;
      if (!res.ok) {
        return {
          requestId: request.requestId,
          success: false,
          error: data.error ?? `http status ${res.status}`
        };
      }
      return {
        requestId: data.requestId ?? request.requestId,
        success: Boolean(data.success ?? true),
        payload: data.payload,
        error: data.error
      };
    } catch (error) {
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      timeout.cancel();
    }
  }

  async health(): Promise<TransportHealth> {
    const timeout = withTimeoutSignal(this.defaultTimeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${this.healthPath}`, {
        method: "GET",
        signal: timeout.signal
      });
      return {
        ok: res.ok,
        detail: res.ok ? "http health endpoint reachable" : `http status ${res.status}`
      };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error)
      };
    } finally {
      timeout.cancel();
    }
  }
}
