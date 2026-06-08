import assert from "node:assert/strict";
import {
  emitInstallProgress,
  getLatestInstallProgress,
  registerInstallProgressSink,
  tryEmitProgressFromLogLine
} from "@ada/install-deps";

const prev = process.env.ADA_MCP_STRUCTURED_PROGRESS;
const collected: unknown[] = [];

function restore() {
  if (prev === undefined) {
    delete process.env.ADA_MCP_STRUCTURED_PROGRESS;
  } else {
    process.env.ADA_MCP_STRUCTURED_PROGRESS = prev;
  }
  registerInstallProgressSink(null);
}

try {
  process.env.ADA_MCP_STRUCTURED_PROGRESS = "1";
  registerInstallProgressSink((event) => collected.push(event));

  emitInstallProgress({
    status: "running",
    phase: "scope",
    scope: "playwright",
    message: "install scope: playwright",
    percent: 25
  });

  const latest = getLatestInstallProgress();
  assert.equal(latest?.kind, "ada.install.progress");
  assert.equal(latest?.scope, "playwright");
  assert.equal(latest?.percent, 25);
  assert.equal(collected.length, 1);

  tryEmitProgressFromLogLine("[deps] run npm install playwright@1.59.1", "playwright");
  assert.ok(collected.length >= 2);
  const last = collected[collected.length - 1] as { phase?: string };
  assert.equal(last.phase, "npm-package");

  console.log("install-progress.test.ts ok");
} finally {
  restore();
}
