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

/** Platform-specific session probe — must match driver command / custom.action whitelist. */
export function buildMobileSessionProbeCommand(platform: AdaPlatform): {
  command: CommandEnvelope["command"];
  riskApproved: true;
  payload: Record<string, unknown>;
} {
  if (platform === "ios") {
    return {
      command: "invoke",
      riskApproved: true,
      payload: { mode: "http", http: { method: "GET", path: "/status" } }
    };
  }
  return {
    command: "custom",
    riskApproved: true,
    payload: { custom: { action: "shell", command: "echo ada-probe" } }
  };
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

async function runMobileSessionProbe(
  platform: AdaPlatform,
  sessionId: string,
  deps: {
    runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
    allowMock?: boolean;
  }
): Promise<CommandResult> {
  const spec = buildMobileSessionProbeCommand(platform);
  const primary = await deps.runCommand(
    deps.toCommandEnvelope(
      {
        requestId: `mobile-probe-${Date.now()}`,
        sessionId,
        platform,
        command: spec.command,
        riskApproved: spec.riskApproved,
        payload: spec.payload
      },
      deps.allowMock ?? false
    )
  );
  if (primary.success) {
    return primary;
  }

  if (platform === "android" && primary.errorCode === "ANDROID_INVOKE_HTTP_REQUIRES_UIA2") {
    return primary;
  }

  if (platform === "android" && spec.command === "custom") {
    return deps.runCommand(
      deps.toCommandEnvelope(
        {
          requestId: `mobile-probe-http-${Date.now()}`,
          sessionId,
          platform,
          command: "invoke",
          riskApproved: true,
          payload: { mode: "http", http: { method: "GET", path: "/status" } }
        },
        deps.allowMock ?? false
      )
    );
  }

  return primary;
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

  const probe = await runMobileSessionProbe(platform, sessionId, deps);

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
