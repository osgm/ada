/** Python 本地调用桥：长连接 stdio（每行 JSON 请求/响应）。 */
import { ada, adaClose, init, quit, exit } from "./ada.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
await init(root);

// hypium/executor 日志走 stderr，避免污染 stdout 上的 JSON 行协议
console.log = (...args) => console.error(...args);

async function handle(body) {
  const { op, platform, sessionId, command, payload, base } = body ?? {};
  if (op === "run") {
    return await ada(platform, sessionId, command, payload ?? {});
  }
  if (op === "recipe") {
    return await ada(platform, sessionId, "recipe", {
      ...(base ?? {}),
      action: command,
      ...(payload?.text != null && payload.text !== "" ? { text: payload.text } : {})
    });
  }
  if (op === "close") {
    await adaClose(platform, sessionId, base ?? {});
    return { success: true };
  }
  if (op === "shutdown") {
    await quit({ force: true });
    return { success: true, closing: true };
  }
  return { success: false, errorMessage: `unknown op: ${op}` };
}

function writeResponse(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

let chain = Promise.resolve();

function enqueue(task) {
  chain = chain.then(task, task);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx = buffer.indexOf("\n");
  while (idx >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) {
      enqueue(async () => {
        let req = {};
        try {
          req = JSON.parse(line);
          const data = await handle(req);
          writeResponse({ id: req.id ?? null, ok: true, data });
          if (req.op === "shutdown") exit();
        } catch (error) {
          writeResponse({ id: req.id ?? null, ok: false, error: String(error?.message ?? error) });
        }
      });
    }
    idx = buffer.indexOf("\n");
  }
});
