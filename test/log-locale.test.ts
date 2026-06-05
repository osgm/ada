import assert from "node:assert/strict";
import { depsLogLine, localizeAdaLogLine } from "../packages/install-deps/src/log-locale.js";

const prevPlatform = process.platform;
const prevLocale = process.env.ADA_MCP_LOG_LOCALE;

function restore() {
  Object.defineProperty(process, "platform", { value: prevPlatform });
  if (prevLocale === undefined) {
    delete process.env.ADA_MCP_LOG_LOCALE;
  } else {
    process.env.ADA_MCP_LOG_LOCALE = prevLocale;
  }
}

try {
  Object.defineProperty(process, "platform", { value: "win32" });
  delete process.env.ADA_MCP_LOG_LOCALE;
  assert.equal(depsLogLine("中文", "English"), "English");

  process.env.ADA_MCP_LOG_LOCALE = "zh";
  assert.equal(depsLogLine("中文", "English"), "中文");

  delete process.env.ADA_MCP_LOG_LOCALE;
  assert.equal(
    localizeAdaLogLine("[selenium] 原生驱动目录: C:\\dirver"),
    "[selenium] native drivers dir: C:\\dirver"
  );
  assert.equal(
    localizeAdaLogLine("[selenium] 复用已有 chromedriver: C:\\dirver\\chromedriver148.exe (主版本 148)"),
    "[selenium] reuse chromedriver: C:\\dirver\\chromedriver148.exe (major 148)"
  );

  console.log("log-locale.test.ts ok");
} finally {
  restore();
}
