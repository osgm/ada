import type { CommandResult } from "@ada/contracts";
import { envTruthy, mcpVerboseResultFromEnv } from "@ada/core-runtime";

/** Runtime overrides (from config/default.yaml `mcp:` or applyMcpRuntimeConfigFromRecord). */
let configVerboseResult: boolean | undefined;
let configExtractRaw: boolean | undefined;
let configJsonPretty: boolean | undefined;

/**
 * Full CommandResult in MCP tool responses (default: slim).
 * - `ADA_MCP_VERBOSE_RESULT=1` → verbose
 * - `ADA_MCP_SLIM_RESULT=0` → verbose (explicit opt-out of slim)
 * - `config mcp.verboseResult: true` → verbose (after applyMcpRuntimeConfigFromRecord)
 */
export function isMcpVerboseResult(): boolean {
  if (mcpVerboseResultFromEnv()) {
    return true;
  }
  if (configVerboseResult === true) {
    return true;
  }
  if (configVerboseResult === false) {
    return false;
  }
  return false;
}

/** Include raw CommandResult on ada_extract (default: false). */
export function isMcpExtractRaw(): boolean {
  if (envTruthy("ADA_MCP_EXTRACT_RAW")) {
    return true;
  }
  if (configExtractRaw === true) {
    return true;
  }
  return false;
}

export function isMcpJsonPretty(): boolean {
  if (envTruthy("ADA_MCP_JSON_PRETTY")) {
    return true;
  }
  if (configJsonPretty === true) {
    return true;
  }
  return false;
}

export function applyMcpRuntimeConfigFromRecord(config: Record<string, unknown>): void {
  const mcp = config.mcp;
  if (!mcp || typeof mcp !== "object") {
    return;
  }
  const section = mcp as Record<string, unknown>;
  if (typeof section.verboseResult === "boolean") {
    configVerboseResult = section.verboseResult;
  }
  if (typeof section.extractRaw === "boolean") {
    configExtractRaw = section.extractRaw;
  }
  if (typeof section.jsonPretty === "boolean") {
    configJsonPretty = section.jsonPretty;
  }
}

const LARGE_PAYLOAD_KEYS = new Set([
  "pageSource",
  "source",
  "hierarchy",
  "dump",
  "xml",
  "html",
  "innerText",
  "bodyText"
]);

const MAX_PREVIEW_CHARS = 400;
const MAX_INLINE_STRING = 1200;
const MAX_STRUCTURED_STRING = 8000;
const MAX_STRUCTURED_ARRAY = 100;
const MAX_STRUCTURED_ARRAY_PREVIEW = 50;
const MAX_STRUCTURED_DEPTH = 8;

/** Keys whose values must stay machine-consumable in slim mode (evaluate/invoke/extract). */
const STRUCTURED_RESULT_KEYS = new Set(["value", "items", "nodes", "root"]);

function isStructuredResultKey(key: string): boolean {
  if (STRUCTURED_RESULT_KEYS.has(key)) return true;
  return /^value\[\d+\]$/.test(key) || /^items\[\d+\]$/.test(key) || /^nodes\[\d+\]$/.test(key);
}

function slimStructuredValue(value: unknown, depth = 0, parentKey = ""): unknown {
  if (depth >= MAX_STRUCTURED_DEPTH) {
    return { _slim: true, reason: "max_depth" };
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRUCTURED_STRING) {
      return {
        _slim: true,
        length: value.length,
        preview: value.slice(0, MAX_PREVIEW_CHARS)
      };
    }
    return value;
  }
  if (Array.isArray(value)) {
    const flatLike = parentKey === "flat" || parentKey === "matches" || parentKey === "tree";
    const maxArray = flatLike ? Math.min(MAX_STRUCTURED_ARRAY, 80) : MAX_STRUCTURED_ARRAY;
    if (value.length > maxArray) {
      return {
        _slim: true,
        length: value.length,
        preview: value.slice(0, MAX_STRUCTURED_ARRAY_PREVIEW).map((item) =>
          slimStructuredValue(item, depth + 1, parentKey)
        )
      };
    }
    return value.map((item) => slimStructuredValue(item, depth + 1, parentKey));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = slimStructuredValue(v, depth + 1, k);
    }
    return out;
  }
  return value;
}

function slimStringValue(key: string, value: string): unknown {
  const forceOmit = LARGE_PAYLOAD_KEYS.has(key) || /source|hierarchy|xml$/i.test(key);
  if (forceOmit && value.length > MAX_PREVIEW_CHARS) {
    return {
      _slim: true,
      length: value.length,
      preview: value.slice(0, MAX_PREVIEW_CHARS)
    };
  }
  if (value.length > MAX_INLINE_STRING) {
    return {
      _slim: true,
      length: value.length,
      preview: value.slice(0, MAX_PREVIEW_CHARS)
    };
  }
  return value;
}

function slimValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (isStructuredResultKey(key)) {
    return slimStructuredValue(value);
  }
  if (typeof value === "string") {
    return slimStringValue(key, value);
  }
  if (Array.isArray(value)) {
    if (value.length > 30) {
      return { _slim: true, length: value.length, preview: value.slice(0, 10) };
    }
    return value.map((item, idx) => slimValue(`${key}[${idx}]`, item));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = slimValue(k, v);
    }
    return out;
  }
  return value;
}

/** Shallow-truncate large fields in CommandResult.data; keeps errors and small metadata. */
export function slimCommandResult(result: CommandResult): CommandResult {
  const out: CommandResult = {
    requestId: result.requestId,
    success: result.success
  };
  if (result.errorCode) {
    out.errorCode = result.errorCode;
  }
  if (result.errorMessage) {
    out.errorMessage = result.errorMessage;
  }
  if (result.data && typeof result.data === "object") {
    const slimmed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(result.data as Record<string, unknown>)) {
      slimmed[k] = slimValue(k, v);
    }
    out.data = slimmed;
  }
  return out;
}

export function resolveResultForMcp(result: CommandResult): {
  result: CommandResult;
  resultMode: "verbose" | "slim";
} {
  if (isMcpVerboseResult()) {
    return { result, resultMode: "verbose" };
  }
  return { result: slimCommandResult(result), resultMode: "slim" };
}

export const MCP_VERBOSE_RESULT_HINT =
  "Set ADA_MCP_VERBOSE_RESULT=1 or mcp.verboseResult=true in config for full CommandResult payload.";
