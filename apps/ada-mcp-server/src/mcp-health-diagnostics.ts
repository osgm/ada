import { buildMcpReadinessHints } from "./mcp-health-enrich.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeHealthScope(v: unknown): "web" | "mobile" | "all" {
  if (v === "web" || v === "mobile" || v === "all") {
    return v;
  }
  return "web";
}

function scopedHealthSnapshot(snapshot: Record<string, unknown>, scope: "web" | "mobile" | "all"): Record<string, unknown> {
  const recommendedWorkflow =
    scope === "mobile"
      ? "ada_health → ada_devices(scan) → ada_mobile_action → ada_close_session"
      : scope === "all"
        ? "ada_health → ada_web_action / ada_mobile_action → ada_close_session"
        : "ada_health → ada_web_action(navigate) → ada_extract/ada_assertions → ada_close_session";
  if (scope === "all") {
    return { ...snapshot, dependencyScope: scope, recommendedWorkflow };
  }
  const out: Record<string, unknown> = { ...snapshot, dependencyScope: scope, recommendedWorkflow };
  const deps = asRecord(snapshot.dependencies);
  const packagesReady = deps.packagesReady;
  const runtimeReady = deps.runtimeReady;
  if (scope === "web") {
    out.dependencies = {
      playwrightInstalled: deps.playwrightInstalled,
      playwrightLaunchOk: deps.playwrightLaunchOk,
      packagesReady,
      runtimeReady
    };
    return out;
  }
  out.dependencies = {
    hypiumDriverInstalled: deps.hypiumDriverInstalled,
    harmonyToolsDir: deps.harmonyToolsDir,
    hdcReachable: deps.hdcReachable,
    packagesReady,
    runtimeReady
  };
  return out;
}

export async function handleHealthTool(
  args: Record<string, unknown>,
  deps: {
    loadAgentConfig: () => Promise<Record<string, unknown>>;
    getHealthSnapshot: (options: {
      config: Record<string, unknown>;
      includeHarmony: boolean;
    }) => Promise<Record<string, unknown>>;
    buildHealthBlockers: (
      snapshot: Record<string, unknown>,
      scope: "web" | "mobile" | "all",
      config?: Record<string, unknown>
    ) => Promise<any[]>;
    buildSessionPolicy: () => unknown;
    healthStatusFromBlockers: (blockers: any[]) => "ok" | "degraded";
    mcpTextResult: (data: unknown) => any;
  }
): Promise<any> {
  const scope = normalizeHealthScope(args.scope);
  const config = await deps.loadAgentConfig();
  const includeHarmony = scope === "mobile" || scope === "all";
  const snapshot = await deps.getHealthSnapshot({ config, includeHarmony });
  const scoped = scopedHealthSnapshot(snapshot, scope);
  const blockers = await deps.buildHealthBlockers(snapshot, scope, config);
  const sessionPolicy = deps.buildSessionPolicy();
  const bootstrap = asRecord(snapshot.mcpBootstrap);
  const bootstrapActive = bootstrap.active === true;
  let status = deps.healthStatusFromBlockers(blockers);
  if (bootstrapActive && status === "ok") {
    status = "degraded";
  }
  const readiness = buildMcpReadinessHints(snapshot, scope);
  const bootstrapNote = bootstrapActive
    ? `dependency bootstrap in progress (phase=${String(bootstrap.phase ?? "unknown")}, scopes=${JSON.stringify(bootstrap.scopes ?? [])})`
    : bootstrap.lastError
      ? `last bootstrap error: ${String(bootstrap.lastError)}`
      : undefined;
  const installProgress =
    snapshot.installProgress ?? asRecord(snapshot.mcpBootstrap).installProgress ?? null;
  return deps.mcpTextResult({
    ...scoped,
    status,
    readiness,
    installProgress,
    bootstrapNote,
    blockers,
    sessionPolicy,
    routingGuide: "ada://guide/routing"
  });
}

export async function handleDiagnosticsTool(
  args: Record<string, unknown>,
  deps: {
    getDoctorSnapshot: (scope: "web" | "mobile" | "all") => Promise<Record<string, unknown>>;
    mcpTextResult: (data: unknown) => any;
  }
): Promise<any> {
  const scope = normalizeHealthScope(args.scope);
  const report = await deps.getDoctorSnapshot(scope);
  const checks = asRecord(report.checks);
  if (scope === "web") {
    return deps.mcpTextResult({
      ...report,
      dependencyScope: "web",
      checks: {
        playwrightBrowser: checks.playwrightBrowser,
        playwrightPackage: checks.playwrightPackage,
        nodeRuntime: checks.nodeRuntime
      }
    });
  }
  if (scope === "mobile") {
    return deps.mcpTextResult({
      ...report,
      dependencyScope: "mobile",
      checks: {
        androidRuntime: checks.androidRuntime,
        iosRuntime: checks.iosRuntime,
        javaRuntime: checks.javaRuntime,
        harmonyHdc: checks.harmonyHdc
      }
    });
  }
  return deps.mcpTextResult(report);
}
