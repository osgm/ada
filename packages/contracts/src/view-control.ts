export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ViewControlMode = "semantic" | "visual" | "auto";

export type LocatorV2 =
  | { kind: "role"; role: string; name?: string }
  | { kind: "testId"; value: string }
  | { kind: "css" | "xpath" | "text"; value: string }
  | { kind: "accessibilityId"; value: string }
  | { kind: "resourceId"; value: string }
  | { kind: "visual"; query: string; minConfidence?: number }
  | string
  | Record<string, unknown>;

export interface ViewRef {
  viewId: string;
  platform: "web" | "android" | "ios" | "harmony";
  sessionId: string;
  source?: "semantic" | "visual" | "hybrid";
}

export interface ViewNode {
  ref?: string;
  role?: string;
  name?: string;
  text?: string;
  bounds?: ViewBounds;
  visible?: boolean;
  enabled?: boolean;
  children?: ViewNode[];
  platformMeta?: Record<string, unknown>;
}

export interface ViewSnapshot {
  snapshotId: string;
  capturedAt: string;
  root: ViewNode;
  screenshot?: string;
  truncated?: boolean;
}

export interface ViewControlConfig {
  enabled: boolean;
  defaultControlMode: ViewControlMode;
  snapshot: {
    maxNodes: number;
    includeScreenshot: boolean;
    cacheTtlMs: number;
  };
  visual: {
    adapter: "noop" | "ocr" | "template" | "vlm";
    requireRiskApproved: boolean;
  };
  registry: {
    maxViewsPerSession: number;
  };
}

export interface ViewDriverCapabilities {
  observeSnapshot?: boolean;
  resolveLocator?: boolean;
  actOnView?: boolean;
}
