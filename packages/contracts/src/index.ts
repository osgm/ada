export type Platform = "web" | "android" | "ios" | "harmony";

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
  | "custom";

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
  engine: "playwright" | "appium";
}
