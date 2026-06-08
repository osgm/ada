import { normalizeControlPath, WEB_INTERACTION_ERROR_CODES } from "@ada/driver-rpc";

interface LedgerEntry {
  key: string;
  at: number;
  url?: string;
}

const NAV_BREAK_KEY = "__nav_break__";

const ledgers = new Map<string, LedgerEntry[]>();

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function readActionLedgerConfig(): {
  maxConsecutiveRepeat: number;
  maxWindowCount: number;
  windowMs: number;
} {
  return {
    maxConsecutiveRepeat: readPositiveIntEnv("ADA_WEB_ACTION_LEDGER_MAX_CONSECUTIVE", 3),
    maxWindowCount: readPositiveIntEnv("ADA_WEB_ACTION_LEDGER_MAX_WINDOW", 5),
    windowMs: readPositiveIntEnv("ADA_WEB_ACTION_LEDGER_WINDOW_MS", 60_000)
  };
}

export const GUARDED_WEB_COMMANDS = new Set(["click", "hover", "clickPath"]);
export const GUARDED_MOBILE_COMMANDS = new Set(["click", "swipe"]);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function buildPathActionKey(path: string[], command = "click"): string {
  return `${command}:path:${path.join(">")}`;
}

export function buildLocatorActionKey(command: string, locator: unknown): string {
  const raw = typeof locator === "string" ? locator : JSON.stringify(locator ?? {});
  return `${command}:locator:${raw}`;
}

export function buildWebActionLedgerKey(command: string, payload: Record<string, unknown>): string {
  const path = normalizeControlPath(payload.path);
  if (path.length > 0) {
    const pathCommand = command === "clickPath" ? "click" : command;
    return buildPathActionKey(path, pathCommand);
  }
  return buildLocatorActionKey(command, payload.locator ?? payload.selector);
}

export function buildMobileActionLedgerKey(command: string, payload: Record<string, unknown>): string {
  const path = normalizeControlPath(payload.path);
  if (path.length > 0) {
    return buildPathActionKey(path, command === "recipe" ? "tap_path" : command);
  }
  const locator = payload.locator ?? payload.selector;
  if (locator !== undefined) {
    return buildLocatorActionKey(command, locator);
  }
  const x = payload.x ?? payload.fromX;
  const y = payload.y ?? payload.fromY;
  if (typeof x === "number" && typeof y === "number") {
    return `${command}:point:${x},${y}`;
  }
  return buildLocatorActionKey(command, payload);
}

function getLedger(sessionId: string): LedgerEntry[] {
  const existing = ledgers.get(sessionId);
  if (existing) return existing;
  const created: LedgerEntry[] = [];
  ledgers.set(sessionId, created);
  return created;
}

function countConsecutiveRepeats(ledger: LedgerEntry[], key: string): number {
  let consecutive = 0;
  for (let i = ledger.length - 1; i >= 0; i -= 1) {
    const item = ledger[i];
    if (!item) break;
    if (item.key === NAV_BREAK_KEY) break;
    if (item.key === key) consecutive += 1;
    else break;
  }
  return consecutive;
}

export function assertActionAllowed(sessionId: string, key: string): void {
  if (!sessionId || sessionId.startsWith("mcp-")) return;
  const { maxConsecutiveRepeat, maxWindowCount, windowMs } = readActionLedgerConfig();
  const now = Date.now();
  const ledger = getLedger(sessionId).filter((item) => now - item.at <= windowMs);
  ledgers.set(sessionId, ledger);

  const same = ledger.filter((item) => item.key === key);
  if (same.length >= maxWindowCount) {
    throw new Error(
      `${WEB_INTERACTION_ERROR_CODES.ACTION_CIRCUIT_OPEN}: action circuit open for "${key}" (${same.length} attempts in ${windowMs}ms)`
    );
  }

  const consecutive = countConsecutiveRepeats(ledger, key);
  if (consecutive >= maxConsecutiveRepeat) {
    throw new Error(
      `${WEB_INTERACTION_ERROR_CODES.ACTION_TOGGLE_LOOP}: repeated action "${key}" may toggle UI state (${consecutive} consecutive)`
    );
  }
}

export function recordAction(sessionId: string, key: string, url?: string): void {
  if (!sessionId || sessionId.startsWith("mcp-")) return;
  const ledger = getLedger(sessionId);
  const last = ledger[ledger.length - 1];
  if (last?.key === key && url && last.url && url !== last.url) {
    ledger.push({ key: NAV_BREAK_KEY, at: Date.now(), url });
  }
  ledger.push({ key, at: Date.now(), url });
  if (ledger.length > 50) {
    ledger.splice(0, ledger.length - 50);
  }
}

export function guardWebAction(sessionId: string, command: string, payload: Record<string, unknown>): void {
  if (!GUARDED_WEB_COMMANDS.has(command)) return;
  assertActionAllowed(sessionId, buildWebActionLedgerKey(command, payload));
}

export function recordWebAction(
  sessionId: string,
  command: string,
  payload: Record<string, unknown>,
  url?: string
): void {
  if (!GUARDED_WEB_COMMANDS.has(command)) return;
  recordAction(sessionId, buildWebActionLedgerKey(command, payload), url);
}

export function clearActionLedger(sessionId: string): void {
  ledgers.delete(sessionId);
}

export function clearAllActionLedgers(): void {
  ledgers.clear();
}

function resolveWebLedgerCommand(command: string, payload: Record<string, unknown>): string | null {
  if (GUARDED_WEB_COMMANDS.has(command)) return command;
  if (command === "recipe" && String(payload.action ?? "").toLowerCase() === "clickpath") {
    return "clickPath";
  }
  return null;
}

function resolveMobileLedgerCommand(command: string, payload: Record<string, unknown>): string | null {
  if (GUARDED_MOBILE_COMMANDS.has(command)) return command;
  if (command === "recipe") {
    const action = String(payload.action ?? "").toLowerCase();
    if (action === "tap_path" || action === "tappath") return "tap_path";
  }
  return null;
}

export function guardWebCommandIfNeeded(
  platform: string,
  sessionId: string,
  command: string,
  payload: Record<string, unknown>
): void {
  if (platform !== "web") return;
  const ledgerCommand = resolveWebLedgerCommand(command, payload);
  if (!ledgerCommand) return;
  guardWebAction(sessionId, ledgerCommand, payload);
}

export function recordWebCommandIfNeeded(
  platform: string,
  sessionId: string,
  command: string,
  payload: Record<string, unknown>,
  result: { success: boolean; data?: unknown }
): void {
  if (platform !== "web" || !result.success) return;
  const ledgerCommand = resolveWebLedgerCommand(command, payload);
  if (!ledgerCommand) return;
  const data = asRecord(result.data);
  recordWebAction(sessionId, ledgerCommand, payload, typeof data.url === "string" ? data.url : undefined);
}

export function guardMobileAction(sessionId: string, command: string, payload: Record<string, unknown>): void {
  if (!GUARDED_MOBILE_COMMANDS.has(command) && command !== "recipe") return;
  const ledgerCommand = resolveMobileLedgerCommand(command, payload);
  if (!ledgerCommand) return;
  assertActionAllowed(sessionId, buildMobileActionLedgerKey(ledgerCommand, payload));
}

export function recordMobileAction(
  sessionId: string,
  command: string,
  payload: Record<string, unknown>
): void {
  const ledgerCommand = resolveMobileLedgerCommand(command, payload);
  if (!ledgerCommand) return;
  recordAction(sessionId, buildMobileActionLedgerKey(ledgerCommand, payload));
}

export function guardMobileCommandIfNeeded(
  platform: string,
  sessionId: string,
  command: string,
  payload: Record<string, unknown>
): void {
  if (platform === "web") return;
  if (platform !== "android" && platform !== "ios" && platform !== "harmony") return;
  guardMobileAction(sessionId, command, payload);
}

export function recordMobileCommandIfNeeded(
  platform: string,
  sessionId: string,
  command: string,
  payload: Record<string, unknown>,
  result: { success: boolean }
): void {
  if (!result.success) return;
  if (platform !== "android" && platform !== "ios" && platform !== "harmony") return;
  const ledgerCommand = resolveMobileLedgerCommand(command, payload);
  if (!ledgerCommand) return;
  recordAction(sessionId, buildMobileActionLedgerKey(ledgerCommand, payload));
}

