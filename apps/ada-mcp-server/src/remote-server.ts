import http from "node:http";
import { getBuiltInPlugins, getDoctorSnapshot, getHealthSnapshot } from "@ada/agent-core";
import type { CommandEnvelope } from "@ada/contracts";
import { closeAllSessions, closeSession, listActiveSessions, runCommand } from "./executor.js";

export interface RemoteServerOptions {
  host: string;
  port: number;
  apiKey: string;
  allowRisky: boolean;
  riskyMode: "whitelist" | "blacklist";
  riskyCommands: string[];
}

interface RemoteRuntimeStats {
  startedAt: number;
  totalRequests: number;
  toolCalls: number;
  authFailures: number;
  lastRequestAt: number | null;
  lastToolName: string | null;
}

const REMOTE_BODY_MAX_BYTES = 1024 * 1024;
const REMOTE_REQUEST_TIMEOUT_MS = 15000;

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      const buf = Buffer.from(chunk);
      total += buf.length;
      if (total > REMOTE_BODY_MAX_BYTES) {
        reject(new Error(`request body too large (max=${REMOTE_BODY_MAX_BYTES})`));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, code: number, data: unknown): void {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function isAuthorized(req: http.IncomingMessage, apiKey: string): boolean {
  const key = String(req.headers["x-api-key"] ?? "");
  if (key && key === apiKey) return true;
  const auth = String(req.headers.authorization ?? "");
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() === apiKey;
  }
  return false;
}

function normalizePlatform(v: unknown): "web" | "android" | "ios" | "harmony" {
  return v === "android" || v === "ios" || v === "harmony" ? v : "web";
}

function normalizeCommand(v: unknown): CommandEnvelope["command"] {
  const all: CommandEnvelope["command"][] = [
    "click",
    "type",
    "swipe",
    "assertVisible",
    "screenshot",
    "navigate",
    "hover",
    "press",
    "select",
    "scroll",
    "forward",
    "newTab",
    "switchTab",
    "uploadFile",
    "dragDrop",
    "wait",
    "assertText",
    "getText",
    "back",
    "reload",
    "closeTab",
    "home",
    "launchApp",
    "terminateApp",
    "custom"
  ];
  if (!all.includes(v as CommandEnvelope["command"])) {
    throw new Error(`unsupported command: ${String(v ?? "")}`);
  }
  return v as CommandEnvelope["command"];
}

function isRisky(command: string): boolean {
  return ["custom", "launchApp", "terminateApp"].includes(command);
}

function normalizeRiskyCommandName(command: string): string {
  return String(command ?? "").trim();
}

function canRunRiskyCommand(command: string, options: RemoteServerOptions): boolean {
  if (!isRisky(command)) return true;
  if (!options.allowRisky) return false;
  const riskySet = new Set(options.riskyCommands.map(normalizeRiskyCommandName).filter((x) => x.length > 0));
  if (options.riskyMode === "blacklist") {
    return !riskySet.has(command);
  }
  return riskySet.has(command);
}

async function callTool(name: string, args: Record<string, unknown>, options: RemoteServerOptions): Promise<unknown> {
  if (name === "ada_health") return getHealthSnapshot();
  if (name === "ada_diagnostics") return getDoctorSnapshot();
  if (name === "ada_plugins") return getBuiltInPlugins();
  if (name === "ada_sessions") return { sessions: listActiveSessions() };
  if (name === "ada_close_all_sessions") return { closed: await closeAllSessions() };
  if (name === "ada_close_session") {
    const platform = normalizePlatform(args.platform);
    const sessionId = String(args.sessionId ?? "");
    return { closed: await closeSession(platform, sessionId) };
  }
  if (name === "ada_execute" || name === "ada_web_action" || name === "ada_mobile_action") {
    const platform = name === "ada_web_action" ? "web" : normalizePlatform(args.platform);
    const command = normalizeCommand(args.command);
    if (!canRunRiskyCommand(command, options)) {
      throw new Error(
        `risky command blocked: ${command} (allowRisky=${options.allowRisky}, riskyMode=${options.riskyMode})`
      );
    }
    const envelope: CommandEnvelope = {
      requestId: String(args.requestId ?? `remote-${Date.now()}`),
      sessionId: String(args.sessionId ?? "remote-session"),
      platform,
      command,
      payload: (args.payload as Record<string, unknown> | undefined) ?? {}
    };
    return runCommand(envelope);
  }
  throw new Error(`unsupported tool: ${name}`);
}

export async function startRemoteServer(options: RemoteServerOptions): Promise<void> {
  const stats: RemoteRuntimeStats = {
    startedAt: Date.now(),
    totalRequests: 0,
    toolCalls: 0,
    authFailures: 0,
    lastRequestAt: null,
    lastToolName: null
  };

  const server = http.createServer(async (req, res) => {
    try {
      stats.totalRequests += 1;
      stats.lastRequestAt = Date.now();
      const url = new URL(req.url ?? "/", `http://${options.host}:${options.port}`);
      req.setTimeout(REMOTE_REQUEST_TIMEOUT_MS, () => {
        sendJson(res, 408, { error: "request timeout" });
      });
      if (url.pathname === "/health" && req.method === "GET") {
        sendJson(res, 200, { status: "ok", mode: "remote", pid: process.pid });
        return;
      }
      if (url.pathname === "/status" && req.method === "GET") {
        sendJson(res, 200, {
          status: "ok",
          host: options.host,
          port: options.port,
          pid: process.pid,
          onlineSessions: listActiveSessions().length,
          allowRisky: options.allowRisky,
          riskyMode: options.riskyMode,
          riskyCommands: options.riskyCommands,
          uptimeMs: Date.now() - stats.startedAt,
          totalRequests: stats.totalRequests,
          toolCalls: stats.toolCalls,
          authFailures: stats.authFailures,
          lastRequestAt: stats.lastRequestAt,
          lastToolName: stats.lastToolName
        });
        return;
      }
      if (url.pathname === "/sessions" && req.method === "GET") {
        if (!isAuthorized(req, options.apiKey)) {
          stats.authFailures += 1;
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        const sessions = listActiveSessions();
        sendJson(res, 200, { count: sessions.length, sessions });
        return;
      }
      if (url.pathname === "/tool/call" && req.method === "POST") {
        if (!isAuthorized(req, options.apiKey)) {
          stats.authFailures += 1;
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        const body = await readJsonBody(req);
        const name = String(body.name ?? "");
        stats.toolCalls += 1;
        stats.lastToolName = name || null;
        const args = (body.arguments as Record<string, unknown> | undefined) ?? {};
        const data = await callTool(name, args, options);
        sendJson(res, 200, { ok: true, data });
        return;
      }
      sendJson(res, 404, { error: "not found" });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => resolve());
  });
  console.error(`[ADA-MCP-REMOTE] listening on http://${options.host}:${options.port}`);
}

