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
  return undefined;
}

export async function handleWebAssertions(
  args: Record<string, unknown>,
  deps: {
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
  }
): Promise<any> {
  const sessionId = String(args.sessionId ?? "mcp-assert");
  const type = typeof args.type === "string" ? args.type : "visible";
  const payload = asRecord(args.payload);
  let command: SupportedCommand = "assertVisible";
  if (type === "text") {
    command = "assertText";
  } else if (type === "url") {
    deps.ensureRiskAllowed("custom", args);
    const result = await deps.runCommand(
      deps.toCommandEnvelope(
        {
          requestId: `assert-url-${Date.now()}`,
          sessionId,
          platform: "web",
          command: "custom",
          payload: { action: "evaluate", script: `(() => location.href)()` }
        },
        deps.allowMock(args)
      )
    );
    deps.assertRealResult(result, "ada_assertions", deps.allowMock(args));
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
