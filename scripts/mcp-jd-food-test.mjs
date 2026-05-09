import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const LONG_REQ = { timeout: 360000 };

function parseToolPayload(toolResult) {
  const text = toolResult?.content?.[0]?.text;
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function callTool(client, name, args) {
  return client.callTool({ name, arguments: args }, CallToolResultSchema, LONG_REQ);
}

async function callWebAction(client, sessionId, command, payload) {
  const raw = await callTool(client, "ada_web_action", {
    command,
    sessionId,
    allowMock: false,
    payload: {
      headless: false,
      ...payload
    }
  });
  const parsed = parseToolPayload(raw);
  if (!parsed?.success) {
    throw new Error(`ada_web_action(${command}) failed: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function main() {
  const transport = new StdioClientTransport({
    command: "npm",
    args: ["run", "mcp:dev"],
    cwd: process.cwd()
  });
  const client = new Client({ name: "ada-mcp-jd-food-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  const sessionId = `mcp-jd-${Date.now()}`;
  const report = [];

  try {
    report.push({
      step: 1,
      action: "打开浏览器访问京东",
      result: await callWebAction(client, sessionId, "navigate", { url: "https://www.jd.com/" })
    });
    report.push({
      step: "1.1",
      action: "短暂停留",
      result: await callWebAction(client, sessionId, "wait", { timeoutMs: 1500 })
    });

    let clickResult;
    try {
      clickResult = await callWebAction(client, sessionId, "click", {
        locator: { text: "食品饮料" }
      });
    } catch {
      clickResult = await callWebAction(client, sessionId, "custom", {
        action: "evaluate",
        script: `(() => {
          const all = Array.from(document.querySelectorAll('a,li,span,div'));
          const hit = all.find(el => (el.textContent || '').trim().includes('食品'));
          if (!hit) return { clicked: false, reason: 'no-food-menu' };
          hit.click();
          return { clicked: true, text: (hit.textContent || '').trim().slice(0, 30) };
        })()`
      });
    }
    report.push({
      step: 2,
      action: "点击左侧菜单食品分类",
      result: clickResult
    });

    report.push({
      step: "2.1",
      action: "短暂停留",
      result: await callWebAction(client, sessionId, "wait", { timeoutMs: 1200 })
    });

    const screenshotResult = await callWebAction(client, sessionId, "screenshot", {});
    report.push({
      step: 3,
      action: "截图",
      result: screenshotResult
    });

    const closeResultRaw = await callTool(client, "ada_close_session", {
      platform: "web",
      sessionId
    });
    report.push({
      step: 4,
      action: "关闭当前tab（关闭当前web会话）",
      result: parseToolPayload(closeResultRaw)
    });

    const sessionsRaw = await callTool(client, "ada_sessions", {});
    report.push({
      step: 5,
      action: "结束测试（检查剩余会话）",
      result: parseToolPayload(sessionsRaw)
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          sessionId,
          report
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
