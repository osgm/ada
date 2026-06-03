import http from "node:http";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { AgentConfig } from "./types.js";
import {
  applyRemoteCredentials,
  getHealthSnapshot,
  installDependencies,
  type InstallDependencyExtras,
  runSetupFlow
} from "@ada/agent-core";
import { getConsoleHtml } from "./web-console.js";
import { mergeInstallSummaries } from "@ada/install-deps";

type InstallSummaryResult = Awaited<ReturnType<typeof installDependencies>>;

interface ParsedInstallDeps {
  full: boolean;
  force: boolean;
  playwright?: { enabled: boolean; targets: string[] };
  mobile?: { enabled: boolean; platforms: string[] };
}

function parseInstallDepsRequest(body: Record<string, unknown>): ParsedInstallDeps {
  const full = Boolean(body.full);
  const force = Boolean(body.force);
  const pw = body.playwright;
  const mob = body.mobile;
  const out: ParsedInstallDeps = { full, force };
  if (pw && typeof pw === "object" && pw !== null) {
    const o = pw as Record<string, unknown>;
    out.playwright = {
      enabled: Boolean(o.enabled),
      targets: Array.isArray(o.targets) ? o.targets.map((x) => String(x)) : []
    };
  }
  if (mob && typeof mob === "object" && mob !== null) {
    const o = mob as Record<string, unknown>;
    out.mobile = {
      enabled: Boolean(o.enabled),
      platforms: Array.isArray(o.platforms) ? o.platforms.map((x) => String(x)) : []
    };
  }
  return out;
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        if (!raw) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export async function runWeb(config: AgentConfig): Promise<void> {
  const host = config.bootstrapUI.host;
  const port = (config.bootstrapUI.port ?? 17650) + 10;
  const exePath = process.execPath;
  let running: ChildProcess | null = null;
  let mcpRunning: ChildProcess | null = null;
  let mcpRemoteRunning: ChildProcess | null = null;
  const clients = new Set<http.ServerResponse>();
  let shuttingDown = false;

  function push(line: string): void {
    for (const res of clients) {
      res.write(`data: ${line.replace(/\n/g, " ")}\n\n`);
    }
  }

  function stopChildTree(child: ChildProcess | null, name: string): void {
    if (!child) {
      return;
    }
    const pid = child.pid;
    if (!pid) {
      return;
    }
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      } else {
        child.kill("SIGTERM");
      }
      push(`${name} stopped (pid=${pid})`);
    } catch (e) {
      push(`${name} stop failed (pid=${pid}): ${String(e)}`);
    }
  }

  function resolveMcpLaunch() {
    const dir = path.dirname(process.execPath);
    const customBin = (process.env.ADA_MCP_REMOTE_BIN ?? "").trim();
    if (customBin) {
      return { command: customBin, preArgs: [] as string[] };
    }
    if (process.platform === "win32") {
      const bin = path.join(dir, "ada-mcp-win.exe");
      if (fs.existsSync(bin)) return { command: bin, preArgs: [] as string[] };
      return { command: "npx", preArgs: ["tsx", path.join(process.cwd(), "apps", "ada-mcp-server", "src", "cli.ts")] };
    }
    if (process.platform === "darwin") {
      const bin = path.join(dir, "ada-mcp-macos");
      if (fs.existsSync(bin)) return { command: bin, preArgs: [] as string[] };
      return { command: "npx", preArgs: ["tsx", path.join(process.cwd(), "apps", "ada-mcp-server", "src", "cli.ts")] };
    }
    const bin = path.join(dir, "ada-mcp-linux");
    if (fs.existsSync(bin)) return { command: bin, preArgs: [] as string[] };
    return { command: "npx", preArgs: ["tsx", path.join(process.cwd(), "apps", "ada-mcp-server", "src", "cli.ts")] };
  }

  function canBind(hostname: string, p: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(p, hostname);
    });
  }

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getConsoleHtml(port));
      return;
    }
    if (req.method === "GET" && req.url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      clients.add(res);
      res.on("close", () => clients.delete(res));
      res.write("data: 控制台已就绪\n\n");
      return;
    }

    const jsonPost = (
      path: string,
      handler: (body: Record<string, unknown>) => Promise<{ status?: number; body: string } | void>
    ): boolean => {
      if (req.method === "POST" && req.url === path) {
        void (async () => {
          try {
            const body = await readJsonBody(req);
            const out = await handler(body);
            const status = out?.status ?? 200;
            const text = out?.body ?? "";
            res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(text);
          } catch (e) {
            res.writeHead(500);
            res.end(String(e));
          }
        })();
        return true;
      }
      return false;
    };

    if (
      jsonPost("/api/health", async () => ({
        body: JSON.stringify(await getHealthSnapshot(), null, 2)
      }))
    ) {
      return;
    }
    if (
      jsonPost("/api/setup", async () => {
        await runSetupFlow("gui");
        return { body: "setup completed" };
      })
    ) {
      return;
    }
    if (
      jsonPost("/api/patch-remote", async (body) => {
        const serverUrl = String(body.serverUrl ?? "").trim();
        const apiKey = body.apiKey !== undefined ? String(body.apiKey) : undefined;
        if (!serverUrl) {
          return { status: 400, body: "missing serverUrl" };
        }
        await applyRemoteCredentials(serverUrl, apiKey && apiKey.trim() ? apiKey : undefined);
        return { body: JSON.stringify({ ok: true, event: "remote.patched" }, null, 2) };
      })
    ) {
      return;
    }
    if (
      jsonPost("/api/install-deps", async (body) => {
        const req = parseInstallDepsRequest(body);
        const force = req.force;
        const parts: Array<{ step: string; summary: InstallSummaryResult }> = [];
        if (req.full) {
          const summary = await installDependencies("all", force, (line) => push(`[deps:all] ${line}`));
          parts.push({ step: "all", summary });
          const merged = mergeInstallSummaries(parts.map((p) => p.summary));
          return { body: JSON.stringify({ installDeps: parts, merged }, null, 2) };
        }
        if (req.playwright?.enabled) {
          const targets = req.playwright.targets.map((x) => x.trim()).filter(Boolean);
          const extras: InstallDependencyExtras =
            targets.length > 0 ? { playwrightInstallTargetsOverride: targets } : {};
          const summary = await installDependencies(
            "playwright",
            force,
            (line) => push(`[deps:playwright] ${line}`),
            extras
          );
          parts.push({ step: "playwright", summary });
        }
        if (req.mobile?.enabled) {
          const platforms = req.mobile.platforms.map((x) => x.trim().toLowerCase()).filter(Boolean);
          if (platforms.length === 0) {
            const summary = await installDependencies("mobile", force, (line) => push(`[deps:mobile] ${line}`));
            parts.push({ step: "mobile", summary });
          } else {
            for (const platform of platforms) {
              if (platform !== "android" && platform !== "ios" && platform !== "harmony") {
                continue;
              }
              const summary = await installDependencies(
                platform as "android" | "ios" | "harmony",
                force,
                (line) => push(`[deps:${platform}] ${line}`)
              );
              parts.push({ step: platform, summary });
            }
          }
        }
        if (parts.length === 0) {
          return { status: 400, body: "请勾选「完整安装」或至少一类组件（Playwright / 移动驱动）" };
        }
        const merged = mergeInstallSummaries(parts.map((p) => p.summary));
        return { body: JSON.stringify({ installDeps: parts, merged }, null, 2) };
      })
    ) {
      return;
    }
    if (
      jsonPost("/api/mcp-remote/start", async (body) => {
        const host = String(body.host ?? "127.0.0.1").trim();
        const port = Number(body.port ?? 8787);
        const apiKey = String(body.apiKey ?? "").trim();
        const allowRisky = Boolean(body.allowRisky);
        const riskyMode = String(body.riskyMode ?? "whitelist").trim() === "blacklist" ? "blacklist" : "whitelist";
        const riskyCommands = String(body.riskyCommands ?? "custom").trim();
        if (!host) {
          return { status: 400, body: "监听地址不能为空" };
        }
        if (!Number.isFinite(port) || port < 1 || port > 65535) {
          return { status: 400, body: "端口不合法" };
        }
        if (!apiKey) {
          return { status: 400, body: "鉴权 Token 不能为空" };
        }
        if (mcpRemoteRunning) {
          return { status: 409, body: "MCP 远程服务已在运行" };
        }
        const bindable = await canBind(host, port);
        if (!bindable) {
          return { status: 409, body: "端口占用或不可监听" };
        }
        const launch = resolveMcpLaunch();
        const startArgs = [
          ...launch.preArgs,
          "server",
          `--host=${host}`,
          `--port=${port}`,
          `--allow-risky=${allowRisky ? "true" : "false"}`,
          `--risky-mode=${riskyMode}`,
          `--risky-commands=${riskyCommands}`
        ];
        mcpRemoteRunning = spawn(
          launch.command,
          startArgs,
          {
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
            env: {
              ...process.env,
              ADA_MCP_REMOTE_API_KEY: apiKey
            }
          }
        );
        mcpRemoteRunning.stdout?.on("data", (d: Buffer) => push(`[mcp-remote] ${d.toString("utf8").trim()}`));
        mcpRemoteRunning.stderr?.on("data", (d: Buffer) => push(`[mcp-remote-stderr] ${d.toString("utf8").trim()}`));
        mcpRemoteRunning.on("exit", (code) => {
          push(`MCP-REMOTE exited: ${code}`);
          mcpRemoteRunning = null;
        });
        return {
          body: JSON.stringify({ ok: true, host, port, pid: mcpRemoteRunning.pid ?? null }, null, 2)
        };
      })
    ) {
      return;
    }
    if (
      jsonPost("/api/mcp-remote/stop", async () => {
        if (!mcpRemoteRunning) {
          return { body: JSON.stringify({ ok: true, running: false }, null, 2) };
        }
        stopChildTree(mcpRemoteRunning, "MCP远程服务");
        mcpRemoteRunning = null;
        return { body: JSON.stringify({ ok: true, running: false }, null, 2) };
      })
    ) {
      return;
    }
    if (
      jsonPost("/api/mcp-remote/status", async (body) => {
        const host = String(body.host ?? "127.0.0.1").trim() || "127.0.0.1";
        const port = Number(body.port ?? 8787);
        return {
          body: JSON.stringify(
            {
              running: Boolean(mcpRemoteRunning),
              pid: mcpRemoteRunning?.pid ?? null,
              host,
              port
            },
            null,
            2
          )
        };
      })
    ) {
      return;
    }
    if (
      jsonPost("/api/start", async (body) => {
        const runAgent =
          body.runAgent === undefined ? true : Boolean(body.runAgent);
        const runMcp = body.runMcp === undefined ? true : Boolean(body.runMcp);
        if (!runAgent && !runMcp) {
          return { status: 400, body: "请至少勾选 Agent 或 MCP" };
        }
        const parts: string[] = [];
        if (runAgent) {
          if (running) {
            return { status: 409, body: "Agent already running" };
          }
          running = spawn(exePath, ["core", "--action=start", "--watch"], { stdio: ["ignore", "pipe", "pipe"] });
          running.stdout?.on("data", (d: Buffer) => push(d.toString("utf8").trim()));
          running.stderr?.on("data", (d: Buffer) => push(`[stderr] ${d.toString("utf8").trim()}`));
          running.on("exit", (code) => {
            push(`Agent exited: ${code}`);
            running = null;
          });
          parts.push("Agent started");
        }
        if (runMcp) {
          if (!mcpRunning) {
            mcpRunning = spawn(exePath, ["mcp"], { stdio: ["ignore", "pipe", "pipe"] });
            mcpRunning.stdout?.on("data", (d: Buffer) => push(`[mcp] ${d.toString("utf8").trim()}`));
            mcpRunning.stderr?.on("data", (d: Buffer) => push(`[mcp-stderr] ${d.toString("utf8").trim()}`));
            mcpRunning.on("exit", (code) => {
              push(`MCP exited: ${code}`);
              mcpRunning = null;
            });
            parts.push("MCP started");
          } else {
            parts.push("MCP already running");
          }
        }
        return { body: parts.join("; ") };
      })
    ) {
      return;
    }
    if (
      jsonPost("/api/stop", async (body) => {
        const stopAgent =
          body.stopAgent === undefined ? true : Boolean(body.stopAgent);
        const stopMcp = body.stopMcp === undefined ? true : Boolean(body.stopMcp);
        if (!stopAgent && !stopMcp) {
          return { status: 400, body: "请至少勾选 Agent 或 MCP" };
        }
        if (stopAgent && running) {
          running.kill();
          running = null;
        }
        if (stopMcp && mcpRunning) {
          mcpRunning.kill();
          mcpRunning = null;
        }
        return { body: "Stopped" };
      })
    ) {
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  function setupShutdownHooks(): void {
    const shutdown = (reason: string): void => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      push(`[ADA-WEB] shutting down: ${reason}`);
      stopChildTree(running, "Agent");
      stopChildTree(mcpRunning, "MCP");
      stopChildTree(mcpRemoteRunning, "MCP远程服务");
      running = null;
      mcpRunning = null;
      mcpRemoteRunning = null;
      server.close(() => {
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 2000).unref();
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("disconnect", () => shutdown("disconnect"));
  }
  setupShutdownHooks();

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      const url = `http://${host}:${port}`;
      console.log(`[ADA-WEB] ready at ${url}`);
      void import("node:child_process").then(({ spawn: sp }) => {
        if (process.platform === "win32") {
          sp("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
          return;
        }
        if (process.platform === "darwin") {
          sp("open", [url], { detached: true, stdio: "ignore" }).unref();
          return;
        }
        sp("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
      }).catch(() => undefined);
      resolve();
    });
  });
}
