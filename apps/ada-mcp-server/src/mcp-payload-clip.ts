/**
 * 正确性优先的返回裁剪：超长时先丢臃肿字段，永远保留模型恢复所需的关键字段。
 * 默认上限偏宽松（省 token 次之）；可用 ADA_MCP_MAX_PAYLOAD_CHARS 收紧。
 */

const DEFAULT_MAX_PAYLOAD_CHARS = 12_000;

/** 模型策略依赖的字段：裁剪时不得丢弃。 */
const CRITICAL_KEYS = new Set([
  "ok",
  "status",
  "summary",
  "recoveryHint",
  "recoveryPlan",
  "errorKind",
  "errorCode",
  "errorMessage",
  "sessionId",
  "platform",
  "command",
  "requestId",
  "suggestedNextTool",
  "recoverable",
  "executed",
  "stepOutcomes",
  "failedStep",
  "outcome",
  "businessCode",
  "tool",
  "budgetMs",
  "budgetExhausted",
  "payloadClipped",
  "message"
]);

/** 可优先丢弃的大体积字段（从前往后尝试）。 */
const BULKY_DROP_ORDER = [
  "uiCandidates",
  "logs",
  "logTail",
  "logErrorLines",
  "results",
  "steps",
  "validationErrors",
  "resultHint",
  "pageTextPreview",
  "result"
] as const;

function payloadChars(payload: Record<string, unknown>): number {
  return JSON.stringify(payload).length;
}

function resolveMaxPayloadChars(): number {
  const raw = process.env.ADA_MCP_MAX_PAYLOAD_CHARS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 2_000) {
      return Math.floor(n);
    }
  }
  return DEFAULT_MAX_PAYLOAD_CHARS;
}

function slimFailedResultStub(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result = value as Record<string, unknown>;
  const stub: Record<string, unknown> = {
    requestId: result.requestId,
    success: result.success
  };
  if (result.errorCode !== undefined) stub.errorCode = result.errorCode;
  if (result.errorMessage !== undefined) {
    stub.errorMessage = String(result.errorMessage).slice(0, 400);
  }
  return stub;
}

/**
 * 超长时按正确性优先级裁剪；未超限原样返回。
 */
export function clipMcpPayloadForCorrectness(
  payload: Record<string, unknown>,
  maxChars = resolveMaxPayloadChars()
): Record<string, unknown> {
  if (payloadChars(payload) <= maxChars) {
    return payload;
  }

  const out: Record<string, unknown> = { ...payload, payloadClipped: true };

  for (const key of BULKY_DROP_ORDER) {
    if (!(key in out)) continue;
    if (key === "result") {
      const stub = slimFailedResultStub(out.result);
      if (stub) out.result = stub;
      else delete out.result;
    } else {
      delete out[key];
    }
    if (payloadChars(out) <= maxChars) {
      return out;
    }
  }
  if (out.failedStep && typeof out.failedStep === "object" && payloadChars(out) > maxChars) {
    const step = out.failedStep as Record<string, unknown>;
    out.failedStep = {
      index: step.index,
      command: step.command,
      attempts: step.attempts,
      result: slimFailedResultStub(step.result) ?? { success: false }
    };
  }

  const critical: Record<string, unknown> = { payloadClipped: true };
  for (const key of CRITICAL_KEYS) {
    if (key in out && out[key] !== undefined) {
      critical[key] = out[key];
    }
  }
  if (!critical.summary && typeof payload.summary === "string") {
    critical.summary = payload.summary;
  }
  if (!critical.recoveryHint && typeof payload.recoveryHint === "string") {
    critical.recoveryHint = payload.recoveryHint;
  }
  return critical;
}

export function mcpMaxPayloadChars(): number {
  return resolveMaxPayloadChars();
}
