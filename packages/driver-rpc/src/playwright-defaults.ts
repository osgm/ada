function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function pickBool(p: Record<string, unknown>, options: Record<string, unknown>, key: string): boolean | undefined {
  if (typeof p[key] === "boolean") {
    return p[key] as boolean;
  }
  if (typeof options[key] === "boolean") {
    return options[key] as boolean;
  }
  return undefined;
}

/**
 * 默认有头模式（浏览器窗口可见），便于本地/MCP 调试。
 * 仅当 payload.headless===true 或 ADA_PLAYWRIGHT_HEADLESS=true 时为无头。
 */
export function resolvePlaywrightHeadless(payload?: Record<string, unknown>): boolean {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const explicit = pickBool(p, options, "headless");
  if (explicit !== undefined) {
    return explicit;
  }
  const env = process.env.ADA_PLAYWRIGHT_HEADLESS?.trim().toLowerCase();
  if (env === "true" || env === "1") {
    return true;
  }
  if (env === "false" || env === "0") {
    return false;
  }
  return false;
}

/** 有头模式下是否将页面/浏览器窗口置前（默认 true） */
export function resolvePlaywrightBringToFront(payload?: Record<string, unknown>): boolean {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const explicit = pickBool(p, options, "bringToFront");
  if (explicit !== undefined) {
    return explicit;
  }
  const env = process.env.ADA_PLAYWRIGHT_BRING_TO_FRONT?.trim().toLowerCase();
  if (env === "false" || env === "0") {
    return false;
  }
  return true;
}
