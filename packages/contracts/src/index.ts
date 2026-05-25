export type Platform = "web" | "android" | "ios" | "harmony";

/** Desktop web automation backend (routed by plugin-host when platform=web). */
export type WebEngine = "playwright" | "selenium";

export type CommandType =
  | "click"
  | "type"
  | "swipe"
  | "assertVisible"
  | "screenshot"
  | "navigate"
  | "hover"
  | "press"
  | "select"
  | "scroll"
  | "forward"
  | "newTab"
  | "switchTab"
  | "uploadFile"
  | "dragDrop"
  | "wait"
  | "assertText"
  | "getText"
  | "back"
  | "reload"
  | "closeTab"
  | "home"
  | "launchApp"
  | "terminateApp"
  | "custom"
  | "invoke";

export type InvokeMode = "method" | "http";

export interface InvokeHttpPayload {
  method: string;
  path: string;
  body?: unknown;
}

/** Unified driver RPC payload (Playwright method mode or Appium HTTP mode). */
export interface InvokePayload {
  mode?: InvokeMode;
  target?: string;
  method?: string;
  args?: unknown[];
  http?: InvokeHttpPayload;
  locator?: Record<string, unknown>;
  options?: Record<string, unknown>;
  /** Legacy Appium custom HTTP block; normalized by @ada/driver-rpc */
  custom?: InvokeHttpPayload;
}

export interface PluginInvokeManifest {
  modes: InvokeMode[];
  targets?: string[];
}

export interface CommandEnvelope {
  requestId: string;
  sessionId: string;
  platform: Platform;
  command: CommandType;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface ResponseEnvelope {
  requestId: string;
  sessionId: string;
  success: boolean;
  timestamp?: string;
  result?: CommandResult;
  errorCode?: string;
  errorMessage?: string;
}

export interface EventEnvelope {
  eventId: string;
  requestId?: string;
  sessionId?: string;
  eventType: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface CommandResult {
  requestId: string;
  success: boolean;
  data?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface ArtifactItem {
  id: string;
  type: "screenshot" | "video" | "pageSource" | "log";
  path: string;
  mimeType?: string;
  createdAt?: string;
}

export interface ArtifactIndex {
  requestId: string;
  sessionId?: string;
  items: ArtifactItem[];
}

export interface PluginManifest {
  id: string;
  version: string;
  platforms: Platform[];
  capabilities: string[];
  engine: "playwright" | "appium" | "selenium";
  /** L1 semantic commands exposed by this driver */
  semanticCommands?: string[];
  /** L2 native RPC passthrough */
  invoke?: PluginInvokeManifest;
}
