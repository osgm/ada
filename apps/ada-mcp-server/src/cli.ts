import { fileURLToPath } from "node:url";
import { runBootstrapInstallDeps } from "./bootstrap-deps.js";

if (!process.env.ADA_MCP_SERVER_ENTRY?.trim()) {
  try {
    process.env.ADA_MCP_SERVER_ENTRY = fileURLToPath(import.meta.url);
  } catch {
    // 打包 cli.cjs 由 build banner 写入 __filename
  }
}

function argValue(name: string, fallback = ""): string {
  const argv = process.argv.slice(2);
  const hit = argv.find((x) => x.startsWith(`${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 1).trim();
}

const argv = process.argv.slice(2);
const isServerMode = argv.includes("server");

function parseRiskyMode(value: string): "whitelist" | "blacklist" {
  return value === "blacklist" ? "blacklist" : "whitelist";
}

function parseRiskyCommands(value: string): string[] {
  return String(value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

if (isServerMode) {
  const host = argValue("--host", process.env.ADA_MCP_REMOTE_HOST ?? "127.0.0.1");
  const port = Number(argValue("--port", process.env.ADA_MCP_REMOTE_PORT ?? "8787"));
  const apiKey = argValue("--api-key", process.env.ADA_MCP_REMOTE_API_KEY ?? "");
  const allowRisky = argValue("--allow-risky", process.env.ADA_MCP_REMOTE_ALLOW_RISKY ?? "false") === "true";
  const riskyMode = parseRiskyMode(argValue("--risky-mode", process.env.ADA_MCP_REMOTE_RISKY_MODE ?? "whitelist"));
  const riskyCommands = parseRiskyCommands(
    argValue("--risky-commands", process.env.ADA_MCP_REMOTE_RISKY_COMMANDS ?? "custom")
  );
  const allowedHostsRaw = argValue("--allowed-hosts", process.env.ADA_MCP_REMOTE_ALLOWED_HOSTS ?? "");
  const allowedHosts = allowedHostsRaw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (!apiKey) {
    console.error("missing api key, set --api-key=xxx or ADA_MCP_REMOTE_API_KEY");
    process.exit(1);
  }
  void (async () => {
    await runBootstrapInstallDeps(argv);
    const { startRemoteServer } = await import("./remote-server.js");
    await startRemoteServer({ host, port, apiKey, allowRisky, riskyMode, riskyCommands, allowedHosts });
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  void (async () => {
    await runBootstrapInstallDeps(argv);
    const { startMcpServer } = await import("./main.js");
    await startMcpServer();
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
