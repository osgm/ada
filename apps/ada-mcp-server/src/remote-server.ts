import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { getBuiltInPlugins, getDoctorSnapshot, getHealthSnapshot } from "@ada/agent-core";
import type { CommandEnvelope } from "@ada/contracts";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, RequestHandler, Response } from "express";
import { closeAllSessions, closeSession, listActiveSessions, runCommand } from "./executor.js";
import { createAdaMcpProtocolServer } from "./main.js";

export interface RemoteServerOptions {
  host: string;
  port: number;
  apiKey: string;
  allowRisky: boolean;
  riskyMode: "whitelist" | "blacklist";
  riskyCommands: string[];
  /** 绑定 0.0.0.0 / :: 时建议配置，用于 MCP Host 校验（与 createMcpExpressApp 一致） */
  allowedHosts?: string[];
}

interface RemoteRuntimeStats {
  startedAt: number;
  totalRequests: number;
  toolCalls: number;
  authFailures: number;
  lastRequestAt: number | null;
  lastToolName: string | null;
}

const REMOTE_REQUEST_TIMEOUT_MS = 15000;

function isAuthorizedHeaders(headers: IncomingHttpHeaders, apiKey: string): boolean {
  const key = String(headers["x-api-key"] ?? "");
  if (key && key === apiKey) return true;
  const auth = String(headers.authorization ?? "");
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

async function callLegacyTool(name: string, args: Record<string, unknown>, options: RemoteServerOptions): Promise<unknown> {
  if (name === "ada_health") return getHealthSnapshot();
  if (name === "ada_diagnostics") return getDoctorSnapshot();
  if (name === "ada_plugins") return getBuiltInPlugins();
  if (name === "ada_sessions") return { sessions: listActiveSessions() };
  if (name === "ada_close_all_sessions") return { closed: await closeAllSessions() };
  if (name === "ada_close_session") {
    const platform = normalizePlatform(args.platform);
    const sessionId = String(args.sessionId ?? "");
    const payload = (args.payload as Record<string, unknown> | undefined) ?? {};
    if (args.engine !== undefined && payload.engine === undefined) {
      payload.engine = args.engine;
    }
    const engine =
      platform === "web" && typeof payload.engine === "string"
        ? (payload.engine as "playwright" | "selenium")
        : undefined;
    return { closed: await closeSession(platform, sessionId, { engine, payload }) };
  }
  if (name === "ada_execute" || name === "ada_web_action" || name === "ada_mobile_action") {
    const platform = name === "ada_web_action" ? "web" : normalizePlatform(args.platform);
    const command = normalizeCommand(args.command);
    if (!canRunRiskyCommand(command, options)) {
      throw new Error(
        `risky command blocked: ${command} (allowRisky=${options.allowRisky}, riskyMode=${options.riskyMode})`
      );
    }
    const payload = (args.payload as Record<string, unknown> | undefined) ?? {};
    if (platform === "web" && args.engine !== undefined && payload.engine === undefined) {
      payload.engine = args.engine;
    }
    const envelope: CommandEnvelope = {
      requestId: String(args.requestId ?? `remote-${Date.now()}`),
      sessionId: String(args.sessionId ?? "remote-session"),
      platform,
      command,
      payload
    };
    return runCommand(envelope);
  }
  throw new Error(`unsupported tool: ${name}`);
}

function requireApiKey(apiKey: string, stats: RemoteRuntimeStats): RequestHandler {
  return (req, res, next) => {
    if (isAuthorizedHeaders(req.headers, apiKey)) {
      next();
      return;
    }
    stats.authFailures += 1;
    res.status(401).json({ error: "unauthorized" });
  };
}

function headerSessionId(req: Request): string | undefined {
  const raw = req.headers["mcp-session-id"];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0];
  return undefined;
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

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const app = createMcpExpressApp({
    host: options.host,
    allowedHosts: options.allowedHosts?.length ? options.allowedHosts : undefined
  });

  app.use((req, res, next) => {
    req.setTimeout(REMOTE_REQUEST_TIMEOUT_MS);
    stats.totalRequests += 1;
    stats.lastRequestAt = Date.now();
    next();
  });

  const auth = requireApiKey(options.apiKey, stats);

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", mode: "remote", pid: process.pid });
  });

  app.get("/status", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      host: options.host,
      port: options.port,
      pid: process.pid,
      onlineSessions: listActiveSessions().length,
      allowRisky: options.allowRisky,
      riskyMode: options.riskyMode,
      riskyCommands: options.riskyCommands,
      streamableHttpPath: "/mcp",
      mcpStreamableSessions: Object.keys(transports).length,
      uptimeMs: Date.now() - stats.startedAt,
      totalRequests: stats.totalRequests,
      toolCalls: stats.toolCalls,
      authFailures: stats.authFailures,
      lastRequestAt: stats.lastRequestAt,
      lastToolName: stats.lastToolName
    });
  });

  app.get("/sessions", auth, (_req: Request, res: Response) => {
    const sessions = listActiveSessions();
    res.json({ count: sessions.length, sessions });
  });

  app.post("/tool/call", auth, async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = String(body.name ?? "");
      stats.toolCalls += 1;
      stats.lastToolName = name || null;
      const args = (body.arguments as Record<string, unknown> | undefined) ?? {};
      const data = await callLegacyTool(name, args, options);
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  const mcpPostHandler: RequestHandler = async (req, res) => {
    try {
      const sessionId = headerSessionId(req);
      const existing = sessionId ? transports[sessionId] : undefined;

      if (sessionId && existing) {
        await existing.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const streamTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = streamTransport;
          }
        });
        streamTransport.onclose = () => {
          const sid = streamTransport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
          }
        };
        const sessionServer = createAdaMcpProtocolServer();
        await sessionServer.connect(streamTransport);
        await streamTransport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided"
        },
        id: null
      });
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error)
          },
          id: null
        });
      }
    }
  };

  const mcpGetHandler: RequestHandler = async (req, res) => {
    const sessionId = headerSessionId(req);
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  const mcpDeleteHandler: RequestHandler = async (req, res) => {
    const sessionId = headerSessionId(req);
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  app.post("/mcp", auth, mcpPostHandler);
  app.get("/mcp", auth, mcpGetHandler);
  app.delete("/mcp", auth, mcpDeleteHandler);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not found" });
  });

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(options.port, options.host, () => resolve());
    httpServer.once("error", reject);
  });

  console.error(`[ADA-MCP-REMOTE] listening on http://${options.host}:${options.port}`);
  console.error(`[ADA-MCP-REMOTE] MCP Streamable HTTP: POST|GET|DELETE http://${options.host}:${options.port}/mcp (with API key)`);
}
