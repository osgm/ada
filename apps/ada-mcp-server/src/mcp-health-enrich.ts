import type { AgentConfig } from "@ada/agent/types";
import { getCachedMobileProbes } from "./mcp-runtime-preflight.js";

export interface HealthBlocker {
  id: string;
  severity: "error" | "warning";
  message: string;
  fixTool: string;
  fixArgs?: Record<string, unknown>;
}

export interface SessionPolicy {
  defaultTier: "T1" | "T2" | "T3";
  maxAutoRetry: number;
  escalation: "suggest";
  allowInvoke: boolean;
  recommendMonitorOnFailure: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function buildSessionPolicy(): SessionPolicy {
  return {
    defaultTier: "T1",
    maxAutoRetry: 2,
    escalation: "suggest",
    allowInvoke: false,
    recommendMonitorOnFailure: true
  };
}

export async function buildHealthBlockers(
  snapshot: Record<string, unknown>,
  scope: "web" | "mobile" | "all",
  _config?: AgentConfig
): Promise<HealthBlocker[]> {
  const blockers: HealthBlocker[] = [];
  const deps = asRecord(snapshot.dependencies);
  const registry = asRecord(snapshot.deviceRegistry);

  if (scope === "web" || scope === "all") {
    if (deps.playwrightInstalled === false) {
      blockers.push({
        id: "playwright-missing",
        severity: "error",
        message: "Playwright package is not installed",
        fixTool: "ada_install_deps",
        fixArgs: { only: "playwright" }
      });
    } else if (deps.playwrightLaunchOk === false) {
      blockers.push({
        id: "playwright-launch-failed",
        severity: "error",
        message: "Playwright browser failed to launch",
        fixTool: "ada_install_deps",
        fixArgs: { only: "playwright", force: true }
      });
    }
  }

  if (scope === "mobile" || scope === "all") {
    const deviceCount = Number(registry.deviceCount ?? 0);
    const authorizedCount = Number(registry.authorizedCount ?? 0);
    if (deviceCount === 0) {
      blockers.push({
        id: "mobile-no-devices",
        severity: "warning",
        message: "No mobile devices in registry; USB device may be missing or unauthorized",
        fixTool: "ada_devices",
        fixArgs: { action: "scan" }
      });
    } else if (authorizedCount === 0) {
      blockers.push({
        id: "mobile-unauthorized",
        severity: "error",
        message: "Devices found but none authorized for automation",
        fixTool: "ada_devices",
        fixArgs: { action: "scan" }
      });
    }

    const { android, ios } = await getCachedMobileProbes();
    if (!android.adbOnPath) {
      blockers.push({
        id: "android-adb-missing",
        severity: "warning",
        message: "adb not found in PATH (required for Android)",
        fixTool: "ada_install_deps",
        fixArgs: { only: "android" }
      });
    } else if (!android.deviceConnected) {
      blockers.push({
        id: "android-no-device",
        severity: "warning",
        message: String(android.detail || "No Android device connected"),
        fixTool: "ada_devices",
        fixArgs: { action: "scan" }
      });
    }

    if (ios.hostSupported && !ios.wdaReachable) {
      blockers.push({
        id: "ios-wda-unreachable",
        severity: "warning",
        message: String(ios.detail || "WebDriverAgent not reachable"),
        fixTool: "ada_diagnostics",
        fixArgs: { scope: "mobile" }
      });
    }

    if (deps.hypiumDriverInstalled === false) {
      blockers.push({
        id: "harmony-hypium-missing",
        severity: "warning",
        message: "hypium-driver not installed (required for Harmony)",
        fixTool: "ada_install_deps",
        fixArgs: { only: "harmony" }
      });
    } else if (deps.harmonyToolsDir && deps.hdcReachable === false) {
      blockers.push({
        id: "harmony-not-ready",
        severity: "warning",
        message: String(deps.hdcTargetsSummary || "Harmony hdc probe failed"),
        fixTool: "ada_install_deps",
        fixArgs: { only: "harmony" }
      });
    } else if (deps.hypiumDriverInstalled === true && !deps.harmonyToolsDir) {
      blockers.push({
        id: "harmony-tools-missing",
        severity: "warning",
        message: "Harmony tools directory not configured",
        fixTool: "ada_install_deps",
        fixArgs: { only: "harmony" }
      });
    }
  }

  return blockers;
}

export function healthStatusFromBlockers(blockers: HealthBlocker[]): "ok" | "degraded" {
  if (blockers.some((item) => item.severity === "error")) {
    return "degraded";
  }
  return "ok";
}
