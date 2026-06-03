import type { InstallDepsConfig } from "./types.js";

export async function probeHarmonyRuntime(config: InstallDepsConfig): Promise<{
  hypiumDriverInstalled: boolean;
  toolsDir: string | null;
  hdcReachable: boolean;
  ready: boolean;
  detail: string;
}> {
  const { getDependencyHealth } = await import("./dependency-installer.js");
  const deps = await getDependencyHealth(config, { includeHarmony: true });
  const ready =
    deps.hypiumDriverInstalled && Boolean(deps.harmonyToolsDir) && deps.hdcReachable;
  const detail = !deps.hypiumDriverInstalled
    ? "hypium-driver not installed"
    : !deps.harmonyToolsDir
      ? "hdc tools dir missing"
      : deps.hdcReachable
        ? `hdc ok: ${deps.hdcTargetsSummary}`
        : `hdc probe failed: ${deps.hdcTargetsSummary}`;
  return {
    hypiumDriverInstalled: deps.hypiumDriverInstalled,
    toolsDir: deps.harmonyToolsDir,
    hdcReachable: deps.hdcReachable,
    ready,
    detail
  };
}
