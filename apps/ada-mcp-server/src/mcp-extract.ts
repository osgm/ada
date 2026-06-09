import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  WEB_VIEW_SCRIPT,
  applyControlFilters,
  extractMobilePageSourceText,
  parseMobileHierarchy,
  parseWebViewSnapshot,
  shapeMobileViewTreeFlat,
  shapeViewTreeExtract,
  truncateViewTreeValue,
  type ViewTreeDetail
} from "@ada/driver-rpc";
import { getCachedMobilePageSource } from "./mcp-mobile-dump-cache.js";
import type { AdaPlatform } from "./mcp-normalize.js";
import { getCachedWebViewTreeRaw, setCachedWebViewTreeRaw } from "./mcp-view-tree-cache.js";
import { resolveRecoveryFields } from "./mcp-payload-slim.js";
import { asRecord } from "./mcp-utils.js";

const DEFAULT_VIEW_TREE_MAX_ITEMS = 80;

function shapeViewTreeFromRaw(
  rawValue: unknown,
  args: Record<string, unknown>
): { shapedResult: CommandResult; extractPayload: Record<string, unknown> } {
  const payload = asRecord(args.payload);
  const snapshot = applyControlFilters(parseWebViewSnapshot(rawValue), {
    href: typeof payload.href === "string" ? payload.href : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined
  });
  const maxItems = Number((payload.maxItems as number | undefined) ?? DEFAULT_VIEW_TREE_MAX_ITEMS);
  const detail = (typeof payload.detail === "string" ? payload.detail : "controls") as ViewTreeDetail;
  const shaped = shapeViewTreeExtract(snapshot, detail);
  const { value: trimmed, truncated: viewTreeTruncated } = truncateViewTreeValue(shaped, maxItems);
  const result: CommandResult = {
    requestId: `extract-viewTree-${Date.now()}`,
    success: true,
    data: {
      value: trimmed,
      ...(viewTreeTruncated ? { viewTreeTruncated: true } : {})
    }
  };
  return {
    shapedResult: result,
    extractPayload: {
      mode: "viewTree",
      platform: "web",
      value: trimmed,
      ...(viewTreeTruncated ? { viewTreeTruncated: true } : {})
    }
  };
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

  if (mode === "viewTree") {
    const cachedRaw = getCachedWebViewTreeRaw(sessionId);
    if (cachedRaw !== undefined) {
      const { shapedResult } = shapeViewTreeFromRaw(cachedRaw, args);
      return deps.mcpTextResult({
        ...deps.toExtractResponse({
          source: "web",
          mode,
          platform: "web",
          result: shapedResult,
          maxItems: Number((asRecord(args.payload).maxItems as number | undefined) ?? DEFAULT_VIEW_TREE_MAX_ITEMS)
        }),
        viewTreeCacheHit: true
      });
    }
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
    const rawValue = (result.data as Record<string, unknown> | undefined)?.value;
    setCachedWebViewTreeRaw(sessionId, rawValue);
    shapedResult = shapeViewTreeFromRaw(rawValue, args).shapedResult;
  }
  const extractPayload = deps.toExtractResponse({
    source: "web",
    mode,
    platform: "web",
    result: shapedResult,
    maxItems: Number((asRecord(args.payload).maxItems as number | undefined) ?? DEFAULT_VIEW_TREE_MAX_ITEMS)
  });
  const recoveryInput = {
    tool: "ada_extract",
    sessionId,
    platform: "web" as const,
    result,
    errorKind: "command_failed" as const
  };
  return deps.mcpTextResult(extractPayload, {
    isError: !result.success,
    errorKind: result.success ? undefined : "command_failed",
    ...(result.success ? {} : resolveRecoveryFields(recoveryInput))
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
    ensureSessionActive?: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
    ensureMobileSessionReady?: (platform: AdaPlatform, sessionId: string, command: string) => Promise<void>;
  }
): Promise<any> {
  const platform = deps.requireMobilePlatform(args.platform);
  await deps.mobilePreflight(platform);
  const sessionId = String(args.sessionId ?? "mcp-mobile-extract");
  const type = typeof args.type === "string" ? args.type : "text";
  const payload = asRecord(args.payload);
  const observeCommand = type === "pageSource" || type === "viewTree" ? "custom" : "getText";
  if (deps.ensureSessionActive) {
    await deps.ensureSessionActive(platform, sessionId, observeCommand);
  }
  if (deps.ensureMobileSessionReady) {
    await deps.ensureMobileSessionReady(platform, sessionId, observeCommand);
  }
  if (type === "pageSource" || type === "viewTree") {
    deps.ensureRiskAllowed("custom", args);
    const maxItems = Number((payload.maxItems as number | undefined) ?? DEFAULT_VIEW_TREE_MAX_ITEMS);
    const { result: loaded, cacheHit } = await getCachedMobilePageSource(platform, sessionId, async () => {
      const loaded = await deps.runCommand(
        deps.toCommandEnvelope(
          {
            requestId: `mobile-page-source-${Date.now()}`,
            sessionId,
            platform,
            command: "custom",
            payload: { http: { method: "GET", path: "/source" } }
          },
          deps.allowMock(args)
        )
      );
      deps.assertRealResult(loaded, "ada_mobile_extract", deps.allowMock(args));
      return loaded;
    });
    if (type === "viewTree") {
      const raw = extractMobilePageSourceText(loaded.data as Record<string, unknown> | undefined);
      const nodes = parseMobileHierarchy(platform, raw ?? "");
      const { flat, truncated } = shapeMobileViewTreeFlat(nodes, maxItems);
      const shapedResult: CommandResult = {
        ...loaded,
        data: {
          value: { flat, platform },
          ...(truncated ? { viewTreeTruncated: true } : {})
        }
      };
      const extractPayload = deps.toExtractResponse({
        source: "mobile",
        mode: "viewTree",
        platform,
        result: shapedResult,
        maxItems
      });
      return deps.mcpTextResult({
        ...extractPayload,
        pageSourceCacheHit: cacheHit
      });
    }
    const extractPayload = deps.toExtractResponse({
      source: "mobile",
      mode: type,
      platform,
      result: loaded,
      maxItems: Number((payload.maxItems as number | undefined) ?? 50)
    });
    return deps.mcpTextResult({
      ...extractPayload,
      pageSourceCacheHit: cacheHit
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
  const recoveryInput = {
    tool: "ada_mobile_extract",
    sessionId,
    platform,
    result,
    errorKind: "command_failed" as const
  };
  return deps.mcpTextResult(extractPayload, {
    isError: !result.success,
    errorKind: result.success ? undefined : "command_failed",
    ...(result.success ? {} : resolveRecoveryFields(recoveryInput))
  });
}
