import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { BootstrapInput } from "./types.js";

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ensureServerUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Server URL must start with http:// or https://");
  }
  return url;
}

export async function runSetupCli(): Promise<{ payload: BootstrapInput }> {
  const rl = readline.createInterface({ input, output });
  try {
    console.log("[ADA-AGENT] setup wizard (CLI mode)");
    const serverUrl = ensureServerUrl(
      (await rl.question("Server URL (e.g. https://ada-control.example.com): ")).trim()
    );
    const tenant = (await rl.question("Tenant [default]: ")).trim() || "default";
    const environment = (await rl.question("Environment [prod]: ")).trim() || "prod";
    const authTypeInput = (await rl.question("Auth type [token/device_code] (default token): ")).trim();
    const authType: "token" | "device_code" = authTypeInput === "device_code" ? "device_code" : "token";
    const token = authType === "token" ? (await rl.question("Token: ")).trim() : undefined;
    const transportModeInput = (await rl.question("Transport mode [stream/http/auto] (default stream): ")).trim();
    const transportMode: "stream" | "http" | "auto" =
      transportModeInput === "http" || transportModeInput === "auto" ? transportModeInput : "stream";
    const streamProtocolInput = (await rl.question("Stream protocol [websocket/grpc] (default websocket): ")).trim();
    const streamProtocol: "websocket" | "grpc" = streamProtocolInput === "grpc" ? "grpc" : "websocket";
    const deviceTags = parseTags((await rl.question("Device tags (comma separated, optional): ")).trim());

    return {
      payload: {
        serverUrl,
        tenant,
        environment,
        authType,
        token,
        transportMode,
        streamProtocol,
        deviceTags
      }
    };
  } finally {
    rl.close();
  }
}
