/**
 * 长时间无正确响应 / 前置条件等待超时 → 应释放驱动连接，避免挂死会话占住浏览器/设备。
 */

/** 等待多久算「长时间」前置超时（可用 ADA_RELEASE_ON_WAIT_TIMEOUT_MS 覆盖） */
export const DEFAULT_RELEASE_ON_WAIT_TIMEOUT_MS = 60_000;

/** 生成建议的新 sessionId（并发忙 / 释放后换 id） */
export function suggestNextSessionId(sessionId: string): string {
  const base = String(sessionId || "mcp-session").replace(/-r\d{6,}.*$/, "") || "mcp-session";
  return `${base}-r${Date.now()}`;
}

/** Playwright 同时打开的浏览器上限（默认 20；`0`=不限制） */
export const DEFAULT_PLAYWRIGHT_MAX_BROWSERS = 20;

export function resolvePlaywrightMaxBrowsers(): number {
  const raw = process.env.ADA_PLAYWRIGHT_MAX_BROWSERS?.trim();
  if (!raw) return DEFAULT_PLAYWRIGHT_MAX_BROWSERS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PLAYWRIGHT_MAX_BROWSERS;
  return Math.floor(n);
}

export function releaseOnWaitTimeoutMs(): number {
  const raw = process.env.ADA_RELEASE_ON_WAIT_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_RELEASE_ON_WAIT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_RELEASE_ON_WAIT_TIMEOUT_MS;
}

/** 从 Playwright/内核错误文案解析已等待毫秒数 */
export function extractWaitedMsFromMessage(message: string): number | undefined {
  const patterns = [
    /timeout\s+(\d+)\s*ms/i,
    /(\d+)\s*ms\s+exceeded/i,
    /timed out after\s+(\d+)\s*ms/i,
    /after\s+(\d+)\s*ms/i
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
  }
  return undefined;
}

export function isTimeoutFailure(input: {
  errorCode?: string | null;
  errorMessage?: string | null;
}): boolean {
  const code = String(input.errorCode ?? "").toUpperCase();
  const message = String(input.errorMessage ?? "").toLowerCase();
  // 短 locator 文案常含 "Timeout Nms"——仅靠单词 timeout 不够；优先看 errorCode / 语义短语
  if (
    code.includes("TIMEOUT") ||
    code === "NAVIGATION_TIMEOUT" ||
    code === "PRECONDITION_TIMEOUT" ||
    code === "COMMAND_TIMEOUT"
  ) {
    return true;
  }
  return (
    message.includes("timed out") ||
    /timeout\s+\d+\s*ms/i.test(message) ||
    message.includes("前置条件") ||
    message.includes("无正确响应")
  );
}

/**
 * 是否应因等待/超时释放会话。
 * - navigate/reload/newTab：一律释放
 * - wait：仅长时间等待（≥阈值）或 COMMAND_TIMEOUT 等硬超时释放；短 wait 保留会话
 * - 其它命令：长时间等待 / 前置条件语义 / 导航类文案释放；短 locator 不释放
 */
export function shouldReleaseSessionOnTimeout(input: {
  command?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}): boolean {
  if (!isTimeoutFailure(input)) {
    return false;
  }
  const command = input.command ?? "";
  if (command === "navigate" || command === "reload" || command === "newTab") {
    return true;
  }
  const code = String(input.errorCode ?? "").toUpperCase();
  if (
    code === "COMMAND_TIMEOUT" ||
    code === "NAVIGATION_TIMEOUT" ||
    code === "PRECONDITION_TIMEOUT"
  ) {
    return true;
  }
  const message = String(input.errorMessage ?? "");
  if (/前置条件|无正确响应|page probe failed|session.*probe failed|page is blank/i.test(message)) {
    return true;
  }
  const waited = extractWaitedMsFromMessage(message);
  const threshold = releaseOnWaitTimeoutMs();
  if (threshold <= 0) {
    return true;
  }
  if (command === "wait") {
    // 短 wait 超时保留会话；无法解析时长时保守不释放（避免误杀）
    return waited !== undefined && waited >= threshold;
  }
  if (waited !== undefined && waited >= threshold) {
    return true;
  }
  // 未解析到等待时长：仅导航长等待语义释放；纯 locator 短超时不释放
  if (/page\.goto|navigation timed out|waiting for (load|url|function)\b/i.test(message)) {
    return true;
  }
  if (/locator\.(waitfor|click|fill)|waiting for (selector|locator)/i.test(message)) {
    return false;
  }
  return false;
}
