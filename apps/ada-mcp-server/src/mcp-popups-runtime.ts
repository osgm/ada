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

export type PopupsModule = {
  dismissWebPopups: (
    sessionId: string,
    options?: Record<string, unknown>,
    dismissArg?: { timeoutMs?: number; attempts?: number },
    attemptsArg?: number
  ) => Promise<DismissPopupsOutcome>;
  dismissMobilePopups: (
    platform: string,
    sessionId: string,
    base: Record<string, unknown>,
    screen: { width: number; height: number },
    dismissArg?: { timeoutMs?: number; attempts?: number },
    attemptsArg?: number
  ) => Promise<DismissPopupsOutcome>;
};

export async function loadPopupsModule(): Promise<PopupsModule> {
  // @ts-expect-error scripts/lib/popups.mjs is JS; runtime types are declared in PopupsModule above
  const mod = await import("../../../scripts/lib/popups.mjs");
  return mod as PopupsModule;
}
