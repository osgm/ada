import { spawn } from "node:child_process";
import type { AgentConfig, BootstrapInput } from "./types.js";

interface NativeSetupResult {
  payload: BootstrapInput;
}

function normalizeOutput(raw: string): BootstrapInput {
  const parsed = JSON.parse(raw) as Partial<BootstrapInput>;
  if (!parsed.serverUrl || !parsed.tenant || !parsed.environment) {
    throw new Error("native setup output missing required fields");
  }
  const authType = parsed.authType === "device_code" ? "device_code" : "token";
  const transportMode = parsed.transportMode === "http" || parsed.transportMode === "auto" ? parsed.transportMode : "stream";
  const streamProtocol = parsed.streamProtocol === "grpc" ? "grpc" : "websocket";
  return {
    serverUrl: parsed.serverUrl,
    tenant: parsed.tenant,
    environment: parsed.environment,
    authType,
    token: parsed.token,
    transportMode,
    streamProtocol,
    deviceTags: Array.isArray(parsed.deviceTags) ? parsed.deviceTags.filter((x): x is string => typeof x === "string") : []
  };
}

export async function runSetupNative(config: AgentConfig): Promise<NativeSetupResult> {
  const native = config.bootstrapUI.native;
  if (!native.enabled || !native.command) {
    throw new Error("native setup is disabled or command is empty");
  }

  return new Promise<NativeSetupResult>((resolve, reject) => {
    const child = spawn(native.command, native.args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`native setup timeout after ${native.timeoutMs}ms`));
    }, native.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`native setup exited with ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      try {
        const payload = normalizeOutput(stdout.trim());
        resolve({ payload });
      } catch (error) {
        reject(new Error(`native setup invalid output: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });
}
