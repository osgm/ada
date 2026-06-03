/**
 * 持久 MCP 桥：stdin 每行 JSON 请求 → stdout 一行 JSON 响应（供 Python ada_mcp.py 使用）
 *
 * 请求: { "id": 1, "op": "callTool"|"harmonyKillAllApps"|"androidKillAllApps"|"shutdown", ... }
 */
import readline from "node:readline";
import { connectMcp, parseMcpToolResult } from "./ada-mcp.mjs";
import { androidKillAllAppsViaRun, createMcpActionRun, harmonyKillAllApps } from "./mobile-kill-all-apps.mjs";
import { repoRoot } from "./repo-root.mjs";

function reply(id, body) {
  process.stdout.write(`${JSON.stringify({ id, ...body })}\n`);
}

function basePayload(cfg = {}) {
  const p = { ...cfg };
  delete p._openKind;
  delete p.platform;
  delete p.probeDevice;
  if (p.real === undefined) p.real = true;
  if (p.mock === undefined) p.mock = false;
  return p;
}

const mcp = await connectMcp({ root: process.env.ADA_REPO_ROOT ?? repoRoot });

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch (e) {
    reply(null, { ok: false, error: `invalid json: ${e}` });
    return;
  }
  const { id, op } = req;
  try {
    if (op === "callTool") {
      const res = await mcp.client.callTool({ name: req.name, arguments: req.arguments ?? {} });
      reply(id, { ok: true, data: parseMcpToolResult(res) });
      return;
    }
    if (op === "harmonyKillAllApps") {
      const payload = basePayload(req.payload ?? {});
      const platform = "harmony";
      const sessionId = req.sessionId;
      const run = async (command, extra = {}) => {
        const res = await mcp.client.callTool({
          name: "ada_mobile_action",
          arguments: {
            command,
            platform,
            sessionId,
            payload: { ...payload, ...extra },
            riskApproved: true
          }
        });
        return parseMcpToolResult(res);
      };
      const result = await harmonyKillAllApps(createMcpActionRun(run), payload, req.opts ?? {});
      reply(id, { ok: true, data: result });
      return;
    }
    if (op === "androidKillAllApps") {
      const payload = basePayload(req.payload ?? {});
      const platform = "android";
      const sessionId = req.sessionId;
      const run = async (command, extra = {}) => {
        const res = await mcp.client.callTool({
          name: "ada_mobile_action",
          arguments: {
            command,
            platform,
            sessionId,
            payload: { ...payload, ...extra },
            riskApproved: true
          }
        });
        return parseMcpToolResult(res);
      };
      const result = await androidKillAllAppsViaRun(createMcpActionRun(run), payload, req.opts ?? {});
      reply(id, { ok: true, data: result });
      return;
    }
    if (op === "shutdown") {
      await mcp.close();
      reply(id, { ok: true });
      rl.close();
      process.exit(0);
      return;
    }
    reply(id, { ok: false, error: `unknown op: ${op}` });
  } catch (e) {
    reply(id, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

rl.on("close", () => {
  mcp.close().catch(() => undefined);
});
