import type { OpenMcpOptions } from "./ada-fluent.js";

export interface McpConnectOptions {
  root?: string;
  name?: string;
  env?: Record<string, string>;
}

export interface McpHealthResult {
  status?: string;
  [key: string]: unknown;
}

export interface McpConnection {
  client: unknown;
  root: string;
  health(): Promise<McpHealthResult>;
  close(): Promise<void>;
}

export function parseMcpToolResult(res: {
  content?: Array<{ text?: string }>;
}): Record<string, unknown>;

export function assertMcpOk(
  label: string,
  data: Record<string, unknown>,
  opts?: { allowBusinessCodes?: string[] }
): Record<string, unknown>;

export function mcpNeedsRisk(
  platform: string,
  command: string,
  extra?: Record<string, unknown>
): boolean;

export function connectMcp(options?: McpConnectOptions): Promise<McpConnection>;

export type { OpenMcpOptions };
