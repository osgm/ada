import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { AdaPlatform } from "./mcp-normalize.js";

const probeCache = new Map<string, { at: number; ok: boolean }>();

function probeTtlMs(): number {
  const raw = process.env.ADA_MOBILE_SESSION_PROBE_TTL_MS?.trim() ?? process.env.ADA_WEB_PAGE_PROBE_TTL_MS?.trim();
  const n = raw ? Number(raw) : 3000;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3000;
}

function isPlaceholderSessionId(sessionId: string): boolean {
  return (
    sessionId === "mcp-session" ||
    sessionId === "mcp-batch" ||
    sessionId === "mcp-invoke" ||
    sessionId === "mcp-extract" ||
    sessionId === "mcp-mobile-extract"
  );
}

export function shouldProbeMobileSession(command: string): boolean {
  return command !== "launchApp";
}

export function clearMobileSessionProbeCache(platform?: AdaPlatform, sessionId?: string): void {
  if (!platform && !sessionId) {
    probeCache.clear();
    return;
  }
  for (const key of probeCache.keys()) {
    const [p, s] = key.split(":", 2);
    if (platform && p !== platform) continue;
    if (sessionId && s !== sessionId) continue;
    probeCache.delete(key);
  }
}

export async function ensureMobileSessionReady(
  platform: AdaPlatform,
  sessionId: string,
  command: string,
  deps: {
    runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
    allowMock?: boolean;
  }
): Promise<void> {
  if (platform === "web" || !shouldProbeMobileSession(command) || isPlaceholderSessionId(sessionId)) {
    return;
  }

  const ttlMs = probeTtlMs();
  const cacheKey = `${platform}:${sessionId}`;
  const cached = probeCache.get(cacheKey);
  if (cached && ttlMs > 0 && Date.now() - cached.at < ttlMs && cached.ok) {
    return;
  }

  const probe = await deps.runCommand(
    deps.toCommandEnvelope(
      {
        requestId: `mobile-probe-${Date.now()}`,
        sessionId,
        platform,
        command: "custom",
        riskApproved: true,
        payload: { http: { method: "GET", path: "/status" } }
      },
      deps.allowMock ?? false
    )
  );

  if (probe.success) {
    probeCache.set(cacheKey, { at: Date.now(), ok: true });
    return;
  }

  probeCache.set(cacheKey, { at: Date.now(), ok: false });
  throw new Error(
    `Mobile session "${sessionId}" (${platform}) probe failed for ${command}: ` +
      `${probe.errorMessage ?? probe.errorCode ?? "unknown"}. ` +
      `Run ada_devices action=scan or relaunch with launchApp before retrying.`
  );
}
