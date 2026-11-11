import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAdaptiveWaitHint,
  clearAdaptiveWait,
  DEFAULT_INTERACTION_WAIT_MS,
  DEFAULT_RETRY_DELAY_MS,
  getAdaptiveWaitBoostMs,
  getAttemptWaitBoostMs,
  recordAdaptiveWaitOutcome,
  resolveRetryDelayMs
} from "../apps/ada-mcp-server/src/mcp-adaptive-wait.ts";
import { parseActionRunOptions } from "../apps/ada-mcp-server/src/mcp-action-runner.ts";

describe("mcp-adaptive-wait", () => {
  it("raises wait after recent failures and on retry attempts", () => {
    clearAdaptiveWait();
    const prev = process.env.ADA_ADAPTIVE_WAIT;
    delete process.env.ADA_ADAPTIVE_WAIT;

    for (let i = 0; i < 4; i += 1) {
      recordAdaptiveWaitOutcome("web", "s-adapt", false);
    }
    assert.ok(getAdaptiveWaitBoostMs("web", "s-adapt") >= 8_000);
    assert.equal(getAttemptWaitBoostMs(2), 8_000);

    const boosted = applyAdaptiveWaitHint(
      {
        requestId: "r1",
        sessionId: "s-adapt",
        platform: "web",
        command: "click",
        payload: { locatorWarm: true, locatorTimeoutMs: 1_200 }
      },
      { attempt: 2 }
    );
    assert.ok((boosted.payload?.waitTimeoutMs as number) >= DEFAULT_INTERACTION_WAIT_MS + 8_000);
    assert.ok((boosted.payload?.locatorTimeoutMs as number) > 1_200);
    assert.equal(boosted.payload?.locatorWarm, false);

    clearAdaptiveWait("s-adapt");
    if (prev === undefined) delete process.env.ADA_ADAPTIVE_WAIT;
    else process.env.ADA_ADAPTIVE_WAIT = prev;
  });

  it("backs off retry delay with attempt and boost", () => {
    assert.equal(resolveRetryDelayMs(1_500, 1, 0), 1_500);
    assert.equal(resolveRetryDelayMs(1_500, 2, 0), 3_000);
    assert.equal(resolveRetryDelayMs(1_500, 2, 15_000), 8_000);
    assert.equal(parseActionRunOptions({}).retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  });

  it("can disable adaptive wait via env", () => {
    clearAdaptiveWait();
    const prev = process.env.ADA_ADAPTIVE_WAIT;
    process.env.ADA_ADAPTIVE_WAIT = "0";
    recordAdaptiveWaitOutcome("web", "s-off", false);
    recordAdaptiveWaitOutcome("web", "s-off", false);
    assert.equal(getAdaptiveWaitBoostMs("web", "s-off"), 0);
    const same = applyAdaptiveWaitHint(
      {
        requestId: "r1",
        sessionId: "s-off",
        platform: "web",
        command: "click",
        payload: {}
      },
      { attempt: 3 }
    );
    assert.equal(same.payload?.waitTimeoutMs, undefined);
    if (prev === undefined) delete process.env.ADA_ADAPTIVE_WAIT;
    else process.env.ADA_ADAPTIVE_WAIT = prev;
    clearAdaptiveWait();
  });
});
