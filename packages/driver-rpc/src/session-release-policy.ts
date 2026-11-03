/**
 * 长时间无正确响应 / 前置条件等待超时 → 应释放驱动连接，避免挂死会话占住浏览器/设备。
 */

/** 等待多久算「长时间」前置超时（可用 ADA_RELEASE_ON_WAIT_TIMEOUT_MS 覆盖） */
export const DEFAULT_RELEASE_ON_WAIT_TIMEOUT_MS = 60_000;

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
  return (
    code.includes("TIMEOUT") ||
    code === "NAVIGATION_TIMEOUT" ||
    code === "PRECONDITION_TIMEOUT" ||
    code === "COMMAND_TIMEOUT" ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("前置条件") ||
    message.includes("无正确响应")
  );
}

/**
 * 是否应因等待/超时释放会话。
 * - navigate/reload/newTab/wait：一律释放
 * - 任意命令：错误信息含长时间等待（≥阈值）或 COMMAND_TIMEOUT / 前置条件语义：释放
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
  if (
    command === "navigate" ||
    command === "reload" ||
    command === "newTab" ||
    command === "wait"
  ) {
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
  if (waited !== undefined && waited >= threshold) {
    return true;
  }
  // 未解析到等待时长但已是 timeout：短 locator 等待仍可能保留会话；仅当文案像 waitFor/goto 长等待时释放
  if (/waitfor|page\.goto|navigation|waiting for (load|url|function|selector|locator)/i.test(message)) {
    return true;
  }
  return false;
}
