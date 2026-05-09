export interface VisualTarget {
  platform: "web" | "android" | "ios" | "harmony";
  sessionId: string;
  locatorHint?: string;
}

export interface VisualCandidate {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface VisualResolutionResult {
  ok: boolean;
  candidate?: VisualCandidate;
  reason?: string;
}

export interface VisionAdapter {
  id: string;
  resolve(target: VisualTarget): Promise<VisualResolutionResult>;
}
