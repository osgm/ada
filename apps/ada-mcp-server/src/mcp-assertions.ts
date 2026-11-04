import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { AdaPlatform, SupportedCommand } from "./mcp-normalize.js";
import { asRecord } from "./mcp-utils.js";

function summarizeLocatorFromPayload(payload: Record<string, unknown>): string | undefined {
  const locator = payload.locator;
  if (typeof locator === "string" && locator.trim().length > 0) return locator.trim();
  if (locator && typeof locator === "object") {
    const l = locator as Record<string, unknown>;
    if (typeof l.kind === "string" && typeof l.value === "string") return `${l.kind}:${l.value}`;
    if (typeof l.role === "string") {
      return `role:${l.role}${typeof l.name === "string" && l.name.length > 0 ? `(${l.name})` : ""}`;
    }
    if (typeof l.testId === "string") return `testId:${l.testId}`;
    if (typeof l.css === "string") return `css:${l.css}`;
    if (typeof l.xpath === "string") return `xpath:${l.xpath}`;
    if (typeof l.text === "string") return `text:${l.text}`;
    if (typeof l.accessibilityId === "string") return `a11y:${l.accessibilityId}`;
    if (typeof l.id === "string") return `id:${l.id}`;
  }
  if (typeof payload.selector === "string" && payload.selector.trim().length > 0) return payload.selector.trim();
  if (typeof payload.css === "string" && payload.css.trim().length > 0) return `css:${payload.css.trim()}`;
  return undefined;
}

function resolveCssSelector(payload: Record<string, unknown>): string {
  if (typeof payload.css === "string" && payload.css.trim()) return payload.css.trim();
  if (typeof payload.selector === "string" && payload.selector.trim()) return payload.selector.trim();
  const locator = asRecord(payload.locator);
  if (typeof locator.css === "string" && locator.css.trim()) return locator.css.trim();
  if (typeof locator.value === "string" && locator.kind === "css" && locator.value.trim()) {
    return locator.value.trim();
  }
  return "";
}

function escapeJsString(value: string): string {
  return JSON.stringify(value);
}

type AssertDeps = {
  runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
  toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
  allowMock: (args: Record<string, unknown>) => boolean;
  ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
  assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
  wrapAssertionResult: (input: {
    tool: string;
    sessionId: string;
    platform?: AdaPlatform;
    type: string;
    pass: boolean;
    details: Record<string, unknown>;
    result?: CommandResult;
  }) => any;
};

async function runEvaluate(
  deps: AssertDeps,
  args: Record<string, unknown>,
  sessionId: string,
  script: string
): Promise<CommandResult> {
  deps.ensureRiskAllowed("custom", args);
  const result = await deps.runCommand(
    deps.toCommandEnvelope(
      {
        requestId: `assert-eval-${Date.now()}`,
        sessionId,
        platform: "web",
        command: "custom",
        payload: { action: "evaluate", script }
      },
      deps.allowMock(args)
    )
  );
  deps.assertRealResult(result, "ada_assertions", deps.allowMock(args));
  return result;
}

export async function handleWebAssertions(
  args: Record<string, unknown>,
  deps: AssertDeps
): Promise<any> {
  const sessionId = String(args.sessionId ?? "mcp-assert");
  const type = typeof args.type === "string" ? args.type : "visible";
  const payload = asRecord(args.payload);

  if (type === "url") {
    const result = await runEvaluate(deps, args, sessionId, `(() => location.href)()`);
    const actual = String((result.data as Record<string, unknown> | undefined)?.value ?? "");
    const expected = String(payload.expectedUrl ?? "");
    const pass = expected.length === 0 ? actual.length > 0 : actual.includes(expected);
    return deps.wrapAssertionResult({
      tool: "ada_assertions",
      sessionId,
      type: "url",
      pass,
      details: { expectedUrl: expected, actualUrl: actual, assertionType: "url" },
      result
    });
  }

  if (type === "title") {
    const result = await runEvaluate(deps, args, sessionId, `(() => document.title)()`);
    const actual = String((result.data as Record<string, unknown> | undefined)?.value ?? "");
    const expected = String(payload.expectedTitle ?? payload.expected ?? "");
    const mode = String(payload.match ?? "includes").toLowerCase();
    const pass =
      expected.length === 0
        ? actual.length > 0
        : mode === "equals" || mode === "exact"
          ? actual === expected
          : actual.includes(expected);
    return deps.wrapAssertionResult({
      tool: "ada_assertions",
      sessionId,
      type: "title",
      pass,
      details: { expectedTitle: expected, actualTitle: actual, match: mode, assertionType: "title" },
      result
    });
  }

  if (type === "count") {
    const css = resolveCssSelector(payload);
    if (!css) {
      return deps.wrapAssertionResult({
        tool: "ada_assertions",
        sessionId,
        type: "count",
        pass: false,
        details: {
          assertionType: "count",
          error: "count requires payload.css or payload.locator.css"
        }
      });
    }
    const result = await runEvaluate(
      deps,
      args,
      sessionId,
      `(() => document.querySelectorAll(${escapeJsString(css)}).length)()`
    );
    const actual = Number((result.data as Record<string, unknown> | undefined)?.value ?? NaN);
    const expected =
      typeof payload.expectedCount === "number"
        ? payload.expectedCount
        : typeof payload.expected === "number"
          ? payload.expected
          : Number(payload.expectedCount ?? payload.expected);
    const op = String(payload.op ?? "eq").toLowerCase();
    let pass = false;
    if (Number.isFinite(actual) && Number.isFinite(expected)) {
      if (op === "gte" || op === ">=") pass = actual >= expected;
      else if (op === "lte" || op === "<=") pass = actual <= expected;
      else if (op === "gt" || op === ">") pass = actual > expected;
      else if (op === "lt" || op === "<") pass = actual < expected;
      else pass = actual === expected;
    }
    return deps.wrapAssertionResult({
      tool: "ada_assertions",
      sessionId,
      type: "count",
      pass,
      details: {
        assertionType: "count",
        css,
        expectedCount: expected,
        actualCount: actual,
        op,
        locatorUsed: `css:${css}`
      },
      result
    });
  }

  if (type === "attribute") {
    const css = resolveCssSelector(payload);
    const name = String(payload.attribute ?? payload.name ?? "").trim();
    if (!css || !name) {
      return deps.wrapAssertionResult({
        tool: "ada_assertions",
        sessionId,
        type: "attribute",
        pass: false,
        details: {
          assertionType: "attribute",
          error: "attribute requires payload.css (or locator.css) and payload.attribute"
        }
      });
    }
    const result = await runEvaluate(
      deps,
      args,
      sessionId,
      `(() => document.querySelector(${escapeJsString(css)})?.getAttribute(${escapeJsString(name)}) ?? null)()`
    );
    const actualRaw = (result.data as Record<string, unknown> | undefined)?.value;
    const actual = actualRaw == null ? "" : String(actualRaw);
    const expected = String(payload.expected ?? payload.expectedValue ?? "");
    const pass =
      expected.length === 0 ? actualRaw != null : actual === expected || actual.includes(expected);
    return deps.wrapAssertionResult({
      tool: "ada_assertions",
      sessionId,
      type: "attribute",
      pass,
      details: {
        assertionType: "attribute",
        css,
        attribute: name,
        expected,
        actual,
        locatorUsed: `css:${css}`
      },
      result
    });
  }

  if (type === "notVisible") {
    const result = await deps.runCommand(
      deps.toCommandEnvelope(
        {
          requestId: `assert-not-visible-${Date.now()}`,
          sessionId,
          platform: "web",
          command: "assertVisible",
          payload
        },
        deps.allowMock(args)
      )
    );
    // assertVisible 成功 → 元素可见 → notVisible 失败；找不到则 notVisible 通过
    const pass = !result.success;
    const locatorUsed = summarizeLocatorFromPayload(payload);
    return deps.wrapAssertionResult({
      tool: "ada_assertions",
      sessionId,
      type: "notVisible",
      pass,
      details: {
        assertionType: "notVisible",
        ...(locatorUsed ? { locatorUsed } : {}),
        visibleProbeSuccess: result.success
      },
      result
    });
  }

  let command: SupportedCommand = "assertVisible";
  if (type === "text") {
    command = "assertText";
  }
  const result = await deps.runCommand(
    deps.toCommandEnvelope(
      {
        requestId: `assert-${Date.now()}`,
        sessionId,
        platform: "web",
        command,
        payload
      },
      deps.allowMock(args)
    )
  );
  deps.assertRealResult(result, "ada_assertions", deps.allowMock(args));
  const locatorUsed = summarizeLocatorFromPayload(payload);
  return deps.wrapAssertionResult({
    tool: "ada_assertions",
    sessionId,
    type,
    pass: result.success,
    details: { assertionType: type, ...(locatorUsed ? { locatorUsed } : {}) },
    result
  });
}

export async function handleMobileAssertions(
  args: Record<string, unknown>,
  deps: {
    requireMobilePlatform: (value: unknown) => AdaPlatform;
    mobilePreflight: (platform: AdaPlatform) => Promise<void>;
    runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
    allowMock: (args: Record<string, unknown>) => boolean;
    assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
    wrapAssertionResult: (input: {
      tool: string;
      sessionId: string;
      platform?: AdaPlatform;
      type: string;
      pass: boolean;
      details: Record<string, unknown>;
      result?: CommandResult;
    }) => any;
  }
): Promise<any> {
  const platform = deps.requireMobilePlatform(args.platform);
  await deps.mobilePreflight(platform);
  const sessionId = String(args.sessionId ?? "mcp-mobile-assert");
  const type = typeof args.type === "string" ? args.type : "visible";
  const payload = asRecord(args.payload);

  if (type === "notVisible") {
    const result = await deps.runCommand(
      deps.toCommandEnvelope(
        {
          requestId: `mobile-assert-not-visible-${Date.now()}`,
          sessionId,
          platform,
          command: "assertVisible",
          payload
        },
        deps.allowMock(args)
      )
    );
    const pass = !result.success;
    const locatorUsed = summarizeLocatorFromPayload(payload);
    return deps.wrapAssertionResult({
      tool: "ada_mobile_assertions",
      sessionId,
      platform,
      type: "notVisible",
      pass,
      details: {
        assertionType: "notVisible",
        ...(locatorUsed ? { locatorUsed } : {}),
        visibleProbeSuccess: result.success
      },
      result
    });
  }

  const command: SupportedCommand = type === "text" ? "assertText" : "assertVisible";
  const result = await deps.runCommand(
    deps.toCommandEnvelope(
      {
        requestId: `mobile-assert-${Date.now()}`,
        sessionId,
        platform,
        command,
        payload
      },
      deps.allowMock(args)
    )
  );
  deps.assertRealResult(result, "ada_mobile_assertions", deps.allowMock(args));
  const locatorUsed = summarizeLocatorFromPayload(payload);
  return deps.wrapAssertionResult({
    tool: "ada_mobile_assertions",
    sessionId,
    platform,
    type,
    pass: result.success,
    details: { assertionType: type, ...(locatorUsed ? { locatorUsed } : {}) },
    result
  });
}
