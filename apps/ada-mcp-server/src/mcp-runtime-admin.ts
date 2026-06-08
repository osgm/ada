import type { InstallScope } from "@ada/install-deps";
import { slimInstallDepsLogs } from "./mcp-payload-slim.js";

export async function handleDevices(
  args: Record<string, unknown>,
  deps: {
    invalidateRuntimeCaches: () => void;
    scanMobileDevicesAndPersist: (options: { deviceTags: string[] }) => Promise<Record<string, unknown>>;
    scanDevicesAndListForDisplay: () => Promise<Record<string, unknown>>;
    getDeviceRegistrySnapshot: () => Promise<Record<string, unknown>>;
    mcpTextResult: (data: Record<string, unknown>) => any;
  }
): Promise<any> {
  const action = typeof args.action === "string" ? args.action : "scan";
  if (action === "scan") {
    deps.invalidateRuntimeCaches();
    const tags = Array.isArray(args.deviceTags) ? args.deviceTags.filter((x): x is string => typeof x === "string") : undefined;
    if (tags?.length) {
      return deps.mcpTextResult(await deps.scanMobileDevicesAndPersist({ deviceTags: tags }));
    }
    return deps.mcpTextResult(await deps.scanDevicesAndListForDisplay());
  }
  return deps.mcpTextResult(await deps.getDeviceRegistrySnapshot());
}

export async function handleInstallDeps(
  args: Record<string, unknown>,
  deps: {
    parseInstallScope: (value: unknown) => InstallScope;
    installDependencies: (only: InstallScope, force: boolean, log: (line: string) => void) => Promise<unknown>;
    invalidateRuntimeCaches: () => void;
    mcpTextResult: (data: Record<string, unknown>) => any;
  }
): Promise<any> {
  const only = deps.parseInstallScope(args.only);
  const force = args.force === true;
  const logs: string[] = [];
  const summary = await deps.installDependencies(only, force, (line: string) => logs.push(line));
  deps.invalidateRuntimeCaches();
  const logPayload = slimInstallDepsLogs(logs);
  return deps.mcpTextResult({
    status: "ok",
    only,
    force,
    summary,
    ...logPayload
  });
}

export async function handleStartOnce(
  args: Record<string, unknown>,
  deps: {
    runStartFlow: (options: { runOnce: boolean; localDev: boolean; skipDeps: boolean; runWatch: boolean }) => Promise<void>;
    mcpTextResult: (data: Record<string, unknown>) => any;
  }
): Promise<any> {
  const localDev = args.localDev === true;
  const skipDeps = args.skipDeps !== false;
  await deps.runStartFlow({ runOnce: true, localDev, skipDeps, runWatch: false });
  return deps.mcpTextResult({
    status: "ok",
    mode: "once",
    localDev,
    skipDeps
  });
}
