import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, RequestHandler, Response } from "express";
import { listActiveSessions } from "./executor.js";
import { createAdaMcpProtocolServer } from "./main.js";
import { callLegacyTool } from "./mcp-legacy-remote.js";

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
