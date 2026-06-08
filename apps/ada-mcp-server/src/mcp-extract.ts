import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  WEB_VIEW_SCRIPT,
  applyControlFilters,
  parseWebViewSnapshot,
  shapeViewTreeExtract,
  type ViewTreeDetail
} from "@ada/driver-rpc";
import type { AdaPlatform } from "./mcp-normalize.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export async function handleWebExtract(
  args: Record<string, unknown>,
  deps: {
    runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
    allowMock: (args: Record<string, unknown>) => boolean;
    ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
    assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
    toExtractResponse: (input: {
      source: "web" | "mobile";
      mode: string;
      platform: AdaPlatform;
      result: CommandResult;
      maxItems: number;
    }) => Record<string, unknown>;
    mcpTextResult: (data: Record<string, unknown>, options?: any) => any;
    buildRecoveryHint: (input: any) => string;
    ensureSessionActive?: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
    ensureWebPageReady?: (sessionId: string, command: string) => Promise<void>;
  }
): Promise<any> {
  const sessionId = String(args.sessionId ?? "mcp-extract");
  const mode = typeof args.mode === "string" ? args.mode : "text";
  if (deps.ensureSessionActive) {
    await deps.ensureSessionActive("web", sessionId, "getText");
  }
  if (deps.ensureWebPageReady) {
    await deps.ensureWebPageReady(sessionId, "getText");
  }
  let script = "";
  if (mode === "list") {
    script = `(() => Array.from(document.querySelectorAll('li,a')).map(el => (el.textContent||'').trim()).filter(Boolean).slice(0,50))()`;
  } else if (mode === "viewTree") {
    script = WEB_VIEW_SCRIPT;
  } else if (mode === "table") {
    script =
      `(() => Array.from(document.querySelectorAll('table')).map(t => Array.from(t.querySelectorAll('tr')).map(r => Array.from(r.querySelectorAll('th,td')).map(c => (c.textContent||'').trim()))).slice(0,5))()`;
  } else {
    script = `(() => (document.body?.innerText || '').slice(0, 5000))()`;
  }
  deps.ensureRiskAllowed("custom", { ...args, riskApproved: true });
  const result = await deps.runCommand(
    deps.toCommandEnvelope(
      {
        requestId: `extract-${Date.now()}`,
        sessionId,
        platform: "web",
        command: "custom",
        riskApproved: true,
        payload: { action: "evaluate", script, ...(asRecord(args.payload) || {}) }
      },
      deps.allowMock(args)
    )
  );
  deps.assertRealResult(result, "ada_extract", deps.allowMock(args));
  let shapedResult = result;
  if (mode === "viewTree" && result.success) {
    const payload = asRecord(args.payload);
    const rawValue = (result.data as Record<string, unknown> | undefined)?.value;
    const snapshot = applyControlFilters(parseWebViewSnapshot(rawValue), {
      href: typeof payload.href === "string" ? payload.href : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined
    });
    const detail = (typeof payload.detail === "string" ? payload.detail : "full") as ViewTreeDetail;
    shapedResult = {
      ...result,
      data: {
        ...(result.data as Record<string, unknown>),
        value: shapeViewTreeExtract(snapshot, detail)
      }
    };
  }
  const extractPayload = deps.toExtractResponse({
    source: "web",
    mode,
    platform: "web",
    result: shapedResult,
    maxItems: Number((asRecord(args.payload).maxItems as number | undefined) ?? 50)
  });
  return deps.mcpTextResult(extractPayload, {
    isError: !result.success,
    errorKind: result.success ? undefined : "command_failed",
    recoveryHint: result.success
      ? undefined
      : deps.buildRecoveryHint({ tool: "ada_extract", sessionId, platform: "web", result, errorKind: "command_failed" })
  });
}

export async function handleMobileExtract(
  args: Record<string, unknown>,
  deps: {
    requireMobilePlatform: (value: unknown) => AdaPlatform;
    mobilePreflight: (platform: AdaPlatform) => Promise<void>;
    runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
    toCommandEnvelope: (input: Record<string, unknown>, allowMock?: boolean) => CommandEnvelope;
    allowMock: (args: Record<string, unknown>) => boolean;
    ensureRiskAllowed: (command: string, args: Record<string, unknown>) => void;
    assertRealResult: (result: CommandResult, context: string, allowMockMode: boolean) => void;
    toExtractResponse: (input: {
      source: "web" | "mobile";
      mode: string;
      platform: AdaPlatform;
      result: CommandResult;
      maxItems: number;
    }) => Record<string, unknown>;
    mcpTextResult: (data: Record<string, unknown>, options?: any) => any;
    buildRecoveryHint: (input: any) => string;
  }
): Promise<any> {
  const platform = deps.requireMobilePlatform(args.platform);
  await deps.mobilePreflight(platform);
  const sessionId = String(args.sessionId ?? "mcp-mobile-extract");
  const type = typeof args.type === "string" ? args.type : "text";
  const payload = asRecord(args.payload);
  if (type === "pageSource") {
    deps.ensureRiskAllowed("custom", args);
    const result = await deps.runCommand(
      deps.toCommandEnvelope(
        {
          requestId: `mobile-page-source-${Date.now()}`,
          sessionId,
          platform,
          command: "custom",
          payload: { custom: { method: "GET", path: "/source" } }
        },
        deps.allowMock(args)
      )
    );
    deps.assertRealResult(result, "ada_mobile_extract", deps.allowMock(args));
    const extractPayload = deps.toExtractResponse({
      source: "mobile",
      mode: type,
      platform,
      result,
      maxItems: Number((payload.maxItems as number | undefined) ?? 50)
    });
    return deps.mcpTextResult(extractPayload, {
      isError: !result.success,
      errorKind: result.success ? undefined : "command_failed",
      recoveryHint: result.success
        ? undefined
        : deps.buildRecoveryHint({ tool: "ada_mobile_extract", sessionId, platform, result, errorKind: "command_failed" })
    });
  }
  const result = await deps.runCommand(
    deps.toCommandEnvelope(
      {
        requestId: `mobile-extract-${Date.now()}`,
        sessionId,
        platform,
        command: "getText",
        payload
      },
      deps.allowMock(args)
    )
  );
  deps.assertRealResult(result, "ada_mobile_extract", deps.allowMock(args));
  const extractPayload = deps.toExtractResponse({
    source: "mobile",
    mode: "text",
    platform,
    result,
    maxItems: Number((payload.maxItems as number | undefined) ?? 50)
  });
  return deps.mcpTextResult(extractPayload, {
    isError: !result.success,
    errorKind: result.success ? undefined : "command_failed",
    recoveryHint: result.success
      ? undefined
      : deps.buildRecoveryHint({ tool: "ada_mobile_extract", sessionId, platform, result, errorKind: "command_failed" })
  });
}
