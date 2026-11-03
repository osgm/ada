import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSessionNotReleased,
  clearReleasedSession,
  getReleasedSession,
  isSessionReleasedError,
  markSessionReleased,
  sessionReleasedErrorToCommandResult,
  suggestNextSessionId
} from "../apps/ada-mcp-server/src/mcp-released-sessions.ts";
import { buildRecoveryHint } from "../apps/ada-mcp-server/src/mcp-recovery.ts";
import { handleSessions } from "../apps/ada-mcp-server/src/mcp-admin.ts";

test("suggestNextSessionId appends release suffix", () => {
  const next = suggestNextSessionId("web-jd");
  assert.match(next, /^web-jd-r\d+$/);
  const again = suggestNextSessionId(next);
  assert.match(again, /^web-jd-r\d+$/);
});

test("assertSessionNotReleased blocks reuse after mark", () => {
  clearReleasedSession();
  markSessionReleased("web", "s-login", "NAVIGATION_TIMEOUT");
  const hit = getReleasedSession("web", "s-login");
  assert.ok(hit);
  assert.equal(hit!.sessionId, "s-login");
  assert.ok(hit!.suggestedSessionId.startsWith("s-login-r"));

  assert.throws(
    () => assertSessionNotReleased("web", "s-login", "click"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /SESSION_RELEASED/);
      assert.match(err.message, /Use a new sessionId="s-login-r/);
      assert.equal(isSessionReleasedError(err), true);
      return true;
    }
  );

  assert.doesNotThrow(() =>
    assertSessionNotReleased("web", "s-login", "navigate", {
      allowForceReuse: true,
      forceReuse: true
    })
  );
  assert.equal(getReleasedSession("web", "s-login"), undefined);
  clearReleasedSession();
});

test("sessionReleasedErrorToCommandResult keeps suggestedSessionId", () => {
  clearReleasedSession();
  markSessionReleased("web", "gone", "timeout");
  try {
    assertSessionNotReleased("web", "gone", "click");
    assert.fail("expected throw");
  } catch (err) {
    assert.equal(isSessionReleasedError(err), true);
    const result = sessionReleasedErrorToCommandResult(err as Error & { data?: Record<string, unknown> }, "req-1");
    assert.equal(result.errorCode, "SESSION_RELEASED");
    assert.equal(result.data.sessionReleased, true);
    assert.equal(result.data.requireNewSessionId, true);
    assert.match(String(result.data.suggestedSessionId), /^gone-r/);
  } finally {
    clearReleasedSession();
  }
});

test("placeholder sessionId warns by default instead of hard block", () => {
  clearReleasedSession();
  const prev = process.env.ADA_RELEASED_PLACEHOLDER_MODE;
  delete process.env.ADA_RELEASED_PLACEHOLDER_MODE;
  try {
    const record = markSessionReleased("web", "mcp-session", "timeout");
    assert.ok(record);
    assert.equal(record!.placeholder, true);
    const warn = assertSessionNotReleased("web", "mcp-session", "click");
    assert.ok(warn);
    assert.match(warn!.suggestedSessionId, /^mcp-session-r/);

    process.env.ADA_RELEASED_PLACEHOLDER_MODE = "block";
    assert.throws(() => assertSessionNotReleased("web", "mcp-session", "click"), /SESSION_RELEASED/);
  } finally {
    if (prev === undefined) delete process.env.ADA_RELEASED_PLACEHOLDER_MODE;
    else process.env.ADA_RELEASED_PLACEHOLDER_MODE = prev;
    clearReleasedSession();
  }
});

test("released session registry respects TTL prune", () => {
  clearReleasedSession();
  const prev = process.env.ADA_RELEASED_SESSION_TTL_MS;
  process.env.ADA_RELEASED_SESSION_TTL_MS = "1";
  try {
    markSessionReleased("web", "ttl-sess", "timeout");
    assert.ok(getReleasedSession("web", "ttl-sess"));
    const start = Date.now();
    while (Date.now() - start < 5) {
      // wait >1ms
    }
    assert.equal(getReleasedSession("web", "ttl-sess"), undefined);
  } finally {
    if (prev === undefined) delete process.env.ADA_RELEASED_SESSION_TTL_MS;
    else process.env.ADA_RELEASED_SESSION_TTL_MS = prev;
    clearReleasedSession();
  }
});

test("handleSessions prefers playwright-runtime count over kernel list", () => {
  const out = handleSessions({
    listActiveSessions: () => [
      { platform: "web", engine: "playwright", sessionId: "a" },
      { platform: "web", engine: "playwright", sessionId: "stale" },
      { platform: "android", sessionId: "b" }
    ],
    countPlaywrightBrowsers: () => 1,
    mcpTextResult: (data) => data
  }) as Record<string, unknown>;
  assert.equal(out.count, 3);
  assert.equal(out.kernelWebSessions, 2);
  assert.equal(out.playwrightBrowsers, 1);
  assert.equal(out.playwrightBrowsersSource, "playwright-runtime");
  assert.equal(out.playwrightMaxBrowsers, 20);
  assert.equal(out.playwrightBrowserSlotsRemaining, 19);
  assert.equal(typeof out.releasedSessionCount, "number");
});

test("handleSessions falls back to kernel web count when runtime unavailable", () => {
  const out = handleSessions({
    listActiveSessions: () => [{ platform: "web", engine: "playwright", sessionId: "a" }],
    countPlaywrightBrowsers: () => undefined,
    mcpTextResult: (data) => data
  }) as Record<string, unknown>;
  assert.equal(out.playwrightBrowsers, 1);
  assert.equal(out.playwrightBrowsersSource, "kernel-fallback");
  assert.equal(out.kernelWebSessions, 1);
});

test("buildRecoveryHint forces new sessionId when sessionReleased", () => {
  const hint = buildRecoveryHint({
    tool: "ada_web_action",
    sessionId: "old-sess",
    platform: "web",
    result: {
      requestId: "1",
      success: false,
      errorCode: "NAVIGATION_TIMEOUT",
      errorMessage: "timeout",
      data: {
        sessionReleased: true,
        requireNewSessionId: true,
        suggestedSessionId: "old-sess-r1"
      }
    }
  });
  assert.match(hint, /SESSION_RELEASED/);
  assert.match(hint, /old-sess-r1/);
  assert.match(hint, /do not reuse sessionId="old-sess"/);
  assert.match(hint, /Switch to sessionId="old-sess-r1"/);
});
