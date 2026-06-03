/** 供 Python 调用：stdin 一行 JSON → stdout 一行 JSON Result */
import { ada, adaClose, init } from "./ada.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
await init(root);

const line = await new Promise((r) => {
  let s = "";
  process.stdin.on("data", (c) => (s += c));
  process.stdin.on("end", () => r(s.trim()));
});
const { op, platform, sessionId, command, payload, base } = JSON.parse(line);

let result;
if (op === "run") {
  result = await ada(platform, sessionId, command, payload ?? {});
} else if (op === "recipe") {
  result = await ada(platform, sessionId, "recipe", {
    ...(base ?? {}),
    action: command,
    ...(payload?.text != null && payload.text !== "" ? { text: payload.text } : {})
  });
} else if (op === "close") {
  await adaClose(platform, sessionId, base ?? {});
  result = { success: true };
} else {
  result = { success: false, errorMessage: `unknown op: ${op}` };
}

console.log(JSON.stringify(result));
