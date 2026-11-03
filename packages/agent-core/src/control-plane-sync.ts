import os from "node:os";
import type { ITransport } from "@ada/transport-http";
import { registryToDeviceListRows } from "@ada/runtime-probe";
import type { SecretRecord } from "./types.js";
import { loadDeviceRegistry, scanAndPersistDevices } from "./device-store.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function hostName(): string {
  return os.hostname();
}

async function buildSyncPayload(secret: SecretRecord): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  try {
    await scanAndPersistDevices(config, { applyEnv: false });
  } catch (error) {
    log("warn", {
      event: "control_plane.device_scan.failed",
      details: { reason: error instanceof Error ? error.message : String(error) }
    });
  }
  const registry = await loadDeviceRegistry();
  const rows = registryToDeviceListRows(registry);
  return {
    deviceName: secret.deviceName,
    agentId: secret.deviceName ?? config.agent.id,
    hostName: hostName(),
    hostIp: undefined,
    agentVersion: process.env.ADA_AGENT_VERSION ?? "ada-agent",
    lastScanAt: registry?.lastScanAt,
    devices: rows.map((row) => ({
      platform: row.platform,
      deviceId: row.deviceId,
      label: row.deviceName,
      model: row.systemCategory,
      resolution: row.resolution,
      state: row.connectionState,
      authorized: row.authorized,
      sdkInfo: row.sdkInfo
    }))
  };
}

async function sendControlPlaneRequest(
  transport: Pick<ITransport, "sendRequest">,
  action: string,
  payload: Record<string, unknown>
): Promise<void> {
  await transport.sendRequest({
    requestId: `${action}-${Date.now()}`,
    action,
    payload
  });
}

export async function registerAndSyncControlPlane(
  transport: Pick<ITransport, "sendRequest">,
  secret: SecretRecord
): Promise<void> {
  const payload = await buildSyncPayload(secret);
  await sendControlPlaneRequest(transport, "ada_register", payload);
  await sendControlPlaneRequest(transport, "ada_device_sync", payload);
  log("info", {
    event: "control_plane.sync.completed",
    details: {
      deviceCount: Array.isArray(payload.devices) ? payload.devices.length : 0
    }
  });
}

export function startControlPlaneHeartbeat(transport: Pick<ITransport, "sendRequest">): void {
  stopControlPlaneHeartbeat();
  heartbeatTimer = setInterval(() => {
    void sendControlPlaneRequest(transport, "ada_heartbeat", {
      hostName: hostName(),
      agentVersion: process.env.ADA_AGENT_VERSION ?? "ada-agent"
    }).catch((error) => {
      log("warn", {
        event: "control_plane.heartbeat.failed",
        details: { reason: error instanceof Error ? error.message : String(error) }
      });
    });
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopControlPlaneHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
