export type Platform = "web" | "android" | "ios" | "harmony";

/** Desktop web automation backend (routed by plugin-host when platform=web). */
export type WebEngine = "playwright";

export type CommandType =
  | "click"
  | "type"
  | "swipe"
  | "pinch"
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
  /** @deprecated 使用 pressHome（系统 Home 键） */
  | "home"
  | "pressHome"
  | "launchApp"
  | "exitApp"
  /** 移动 UI 配方：fill_search / dump_ui / tap_search */
  | "recipe"
  | "custom"
  | "invoke"
  /** 设备管理：listApps / install / push / shell 等（payload.action） */
  | "deviceAdmin";

export type InvokeMode = "method" | "http";

export interface InvokeHttpPayload {
  method: string;
  path: string;
  body?: unknown;
}

/** Unified driver RPC payload (Playwright method mode or adapter HTTP mode). */
export interface InvokePayload {
  mode?: InvokeMode;
  target?: string;
  method?: string;
  args?: unknown[];
  http?: InvokeHttpPayload;
  locator?: Record<string, unknown>;
  options?: Record<string, unknown>;
  /** Legacy custom HTTP block; normalized by @ada/driver-rpc */
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

export type {
  LocatorScope,
  LocatorV2,
  ViewBounds,
  ViewControlConfig,
  ViewControlMode,
  ViewDriverCapabilities,
  ViewNode,
  ViewRef,
  ViewSnapshot
} from "./view-control.js";

export interface PluginManifest {
  id: string;
  version: string;
  platforms: Platform[];
  capabilities: string[];
  engine: "playwright" | "android" | "ios" | "harmony";
  /** L1 semantic commands exposed by this driver */
  semanticCommands?: string[];
  /** L2 native RPC passthrough */
  invoke?: PluginInvokeManifest;
  /** Optional view-control capabilities (observeSnapshot, resolveLocator, actOnView) */
  viewCapabilities?: string[];
}
