import assert from "node:assert/strict";
import test from "node:test";
import {
  fastStartFromEnv,
  hideAdvancedToolsFromEnv,
  mcpVerboseResultFromEnv,
  uiDumpCacheTtlMsFromEnv
} from "@ada/core-runtime";

function withEnv(updates: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(updates)) {
    prev[key] = process.env[key];
    const v = updates[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("hideAdvancedToolsFromEnv: canonical and TOOL_VISIBILITY alias", () => {
  withEnv({ ADA_MCP_HIDE_ADVANCED: "1", ADA_MCP_TOOL_VISIBILITY: undefined }, () => {
    assert.equal(hideAdvancedToolsFromEnv(), true);
  });
  withEnv({ ADA_MCP_HIDE_ADVANCED: undefined, ADA_MCP_TOOL_VISIBILITY: "hide" }, () => {
    assert.equal(hideAdvancedToolsFromEnv(), true);
  });
  withEnv({ ADA_MCP_HIDE_ADVANCED: undefined, ADA_MCP_TOOL_VISIBILITY: undefined }, () => {
    assert.equal(hideAdvancedToolsFromEnv(), false);
  });
});

test("fastStartFromEnv: FAST_START and QUICK_START alias", () => {
  withEnv({ ADA_MCP_SLOW_START: undefined, ADA_MCP_FAST_START: "0", ADA_MCP_QUICK_START: undefined }, () => {
    assert.equal(fastStartFromEnv(), false);
  });
  withEnv({ ADA_MCP_SLOW_START: "1", ADA_MCP_FAST_START: "1", ADA_MCP_QUICK_START: "1" }, () => {
    assert.equal(fastStartFromEnv(), false);
  });
  withEnv({ ADA_MCP_SLOW_START: undefined, ADA_MCP_FAST_START: undefined, ADA_MCP_QUICK_START: "1" }, () => {
    assert.equal(fastStartFromEnv(), true);
  });
});

test("mcpVerboseResultFromEnv: VERBOSE_RESULT and SLIM_RESULT=0", () => {
  withEnv({ ADA_MCP_VERBOSE_RESULT: "1", ADA_MCP_SLIM_RESULT: undefined }, () => {
    assert.equal(mcpVerboseResultFromEnv(), true);
  });
  withEnv({ ADA_MCP_VERBOSE_RESULT: undefined, ADA_MCP_SLIM_RESULT: "0" }, () => {
    assert.equal(mcpVerboseResultFromEnv(), true);
  });
});

test("uiDumpCacheTtlMsFromEnv prefers ADA_UI_DUMP_CACHE_MS", () => {
  withEnv({ ADA_UI_DUMP_CACHE_MS: "5000", ADA_ANDROID_HIERARCHY_CACHE_MS: "1000" }, () => {
    assert.equal(uiDumpCacheTtlMsFromEnv(), 5000);
  });
  withEnv({ ADA_UI_DUMP_CACHE_MS: undefined, ADA_ANDROID_HIERARCHY_CACHE_MS: "3000" }, () => {
    assert.equal(uiDumpCacheTtlMsFromEnv(), 3000);
  });
});

