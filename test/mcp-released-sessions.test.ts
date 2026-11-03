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
