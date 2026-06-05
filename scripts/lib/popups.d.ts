export interface DismissPopupsOutcome {
  success: boolean;
  dismissed: boolean;
  businessCode: string;
  reason: string;
  dismissActions: number;
  rounds: number;
  timedOut: boolean;
  elapsedMs: number;
  hits: string[];
  timeoutMs?: number;
}

export function dismissWebPopups(
  sessionId: string,
  options?: Record<string, unknown>,
  dismissArg?: { timeoutMs?: number; attempts?: number },
  attemptsArg?: number
): Promise<DismissPopupsOutcome>;

export function dismissMobilePopups(
  platform: string,
  sessionId: string,
  base: Record<string, unknown>,
  screen: { width: number; height: number },
  dismissArg?: { timeoutMs?: number; attempts?: number },
  attemptsArg?: number
): Promise<DismissPopupsOutcome>;
