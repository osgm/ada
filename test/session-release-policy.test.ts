import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RELEASE_ON_WAIT_TIMEOUT_MS,
  extractWaitedMsFromMessage,
  shouldReleaseSessionOnTimeout
} from "@ada/driver-rpc";
import { isRecoverableInteractionError } from "../plugins/driver-playwright/src/runtime.ts";

test("extractWaitedMsFromMessage parses playwright timeout text", () => {
  assert.equal(extractWaitedMsFromMessage("page.goto: Timeout 75000ms exceeded."), 75_000);
  assert.equal(extractWaitedMsFromMessage("locator.waitFor: Timeout 2500ms exceeded"), 2_500);
  assert.equal(extractWaitedMsFromMessage("web:navigate timed out after 80000ms"), 80_000);
});

test("shouldReleaseSessionOnTimeout: navigate always; short wait keeps session", () => {
  assert.equal(
    shouldReleaseSessionOnTimeout({
      command: "navigate",
      errorCode: "TIMEOUT",
      errorMessage: "Timeout 1000ms exceeded"
    }),
    true
  );
  assert.equal(
    shouldReleaseSessionOnTimeout({
      command: "wait",
      errorCode: "TIMEOUT",
      errorMessage: "Timeout 1000ms exceeded"
    }),
    false
  );
  assert.equal(
    shouldReleaseSessionOnTimeout({
      command: "wait",
      errorCode: "TIMEOUT",
      errorMessage: `Timeout ${DEFAULT_RELEASE_ON_WAIT_TIMEOUT_MS}ms exceeded`
    }),
    true
  );
});

test("shouldReleaseSessionOnTimeout: long precondition wait releases", () => {
  assert.equal(DEFAULT_RELEASE_ON_WAIT_TIMEOUT_MS, 60_000);
  assert.equal(
    shouldReleaseSessionOnTimeout({
      command: "click",
      errorCode: "TIMEOUT",
      errorMessage: `Timeout ${DEFAULT_RELEASE_ON_WAIT_TIMEOUT_MS}ms exceeded`
    }),
    true
  );
  assert.equal(
    shouldReleaseSessionOnTimeout({
      command: "click",
      errorCode: "TIMEOUT",
      errorMessage: "Timeout 2500ms exceeded"
    }),
    false
  );
  assert.equal(
    shouldReleaseSessionOnTimeout({
      command: "click",
      errorCode: "TIMEOUT",
      errorMessage: "locator.waitFor: Timeout 2500ms exceeded"
    }),
    false
  );
});

test("shouldReleaseSessionOnTimeout: 前置条件 / 无正确响应", () => {
  assert.equal(
    shouldReleaseSessionOnTimeout({
      command: "click",
      errorMessage: "前置条件等待超时: page probe failed"
    }),
    true
  );
  assert.equal(
    shouldReleaseSessionOnTimeout({
      command: "type",
      errorMessage: "长时间无正确响应"
    }),
    true
  );
});

test("isRecoverableInteractionError: long wait not recoverable", () => {
  assert.equal(
    isRecoverableInteractionError(new Error("Timeout 75000ms exceeded"), "click"),
    false
  );
  assert.equal(
    isRecoverableInteractionError(new Error("Timeout 2500ms exceeded"), "click"),
    true
  );
  assert.equal(
    isRecoverableInteractionError(new Error("Timeout 1000ms exceeded"), "navigate"),
    false
  );
});
