import type { CommandEnvelope, CommandResult } from "@ada/contracts";

const lastUrlBySession = new Map<string, string>();

const PAGE_PROBE_SCRIPT = `(() => ({
  url: location.href,
  title: document.title,
  blank: location.href === "about:blank" || location.href === "about:srcdoc"
}))()`;

export function trackWebLastUrl(sessionId: string, url: string): void {
  const trimmed = url.trim();
  if (!sessionId || !trimmed || trimmed === "about:blank" || trimmed === "about:srcdoc") {
    return;
  }
  lastUrlBySession.set(sessionId, trimmed);
}

export function getWebLastUrl(sessionId: string): string | undefined {
  return lastUrlBySession.get(sessionId);
}

export function clearWebSessionTrack(sessionId: string): void {
  lastUrlBySession.delete(sessionId);
}

export function clearAllWebSessionTracks(): void {
  lastUrlBySession.clear();
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readProbeValue(result: CommandResult): Record<string, unknown> {
  const value = asRecord(asRecord(result.data).value);
  return value;
}

function isPlaceholderSessionId(sessionId: string): boolean {
  return sessionId === "mcp-session" || sessionId === "mcp-batch" || sessionId === "mcp-invoke" || sessionId === "mcp-extract";
}

export function shouldProbeWebPage(command: string): boolean {
  return command !== "navigate" && command !== "newTab";
}

export async function ensureWebPageReady(
  sessionId: string,
  command: string,
  deps: {
    runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
    allowMock?: boolean;
  }
): Promise<void> {
  if (!shouldProbeWebPage(command) || isPlaceholderSessionId(sessionId)) {
    return;
  }

  const probe = await deps.runCommand(
    deps.toCommandEnvelope(
      {
        requestId: `page-probe-${Date.now()}`,
        sessionId,
        platform: "web",
        command: "custom",
        riskApproved: true,
        payload: { action: "evaluate", script: PAGE_PROBE_SCRIPT }
      },
      deps.allowMock ?? false
    )
  );

  if (!probe.success) {
    throw new Error(
      `Web session "${sessionId}" page probe failed for ${command}: ${probe.errorMessage ?? probe.errorCode ?? "unknown"}`
    );
  }

  const probeValue = readProbeValue(probe);
  const url = typeof probeValue.url === "string" ? probeValue.url : "";
  const blank = probeValue.blank === true || url === "about:blank" || url === "about:srcdoc";

  if (!blank && url) {
    trackWebLastUrl(sessionId, url);
    return;
  }

  const lastUrl = getWebLastUrl(sessionId);
  if (blank && lastUrl) {
    const recovered = await deps.runCommand(
      deps.toCommandEnvelope(
        {
          requestId: `page-recover-${Date.now()}`,
          sessionId,
          platform: "web",
          command: "navigate",
          payload: { url: lastUrl }
        },
        deps.allowMock ?? false
      )
    );
    if (recovered.success) {
      trackWebLastUrl(sessionId, lastUrl);
      return;
    }
  }

  if (blank) {
    throw new Error(
      `Web page is blank (about:blank) for session "${sessionId}" during ${command}. ` +
        `Run ada_web_action navigate first${lastUrl ? `; auto-recover to ${lastUrl} failed` : ""}.`
    );
  }
}
