export type UiRole = "searchEntry" | "searchInput" | "homeTab";

export interface UiNode {
  text: string;
  desc: string;
  id: string;
  type: string;
  clickable: boolean;
  focused: boolean;
  point: [number, number];
  bounds?: { x1: number; y1: number; x2: number; y2: number; w: number; h: number };
  raw?: Record<string, unknown>;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export interface UiPickResult {
  point: [number, number];
  label: string;
  kind: "entry" | "input" | "tab";
  score?: number;
}

export interface FindUiOptions {
  screen: ScreenSize;
  role: UiRole;
  /** @deprecated 使用 findUiNode 的 heuristics 参数 */
  platform?: "android" | "harmony";
}
