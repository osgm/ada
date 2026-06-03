import { parseBoundsString, isTruthyAttr } from "./bounds.js";
import type { UiNode } from "./types.js";

export function walkHarmonyTree(node: unknown, out: UiNode[] = []): UiNode[] {
  if (!node || typeof node !== "object") return out;
  const rec = node as Record<string, unknown>;
  const attrs =
    rec.attributes && typeof rec.attributes === "object"
      ? (rec.attributes as Record<string, unknown>)
      : rec;
  const bounds = parseBoundsString(String(attrs.bounds ?? ""));
  if (bounds) {
    out.push({
      text: String(attrs.text ?? ""),
      desc: String(attrs.description ?? ""),
      id: String(attrs.id ?? ""),
      type: String(attrs.type ?? ""),
      clickable: isTruthyAttr(attrs.clickable) || isTruthyAttr(attrs.longClickable),
      focused: isTruthyAttr(attrs.focused),
      point: [bounds.cx, bounds.cy],
      bounds: { x1: bounds.x1, y1: bounds.y1, x2: bounds.x2, y2: bounds.y2, w: bounds.w, h: bounds.h },
      raw: attrs
    });
  }
  for (const child of (rec.children as unknown[]) ?? []) {
    walkHarmonyTree(child, out);
  }
  return out;
}

export function parseHarmonyLayoutJson(raw: string): UiNode[] {
  const tree = JSON.parse(raw) as unknown;
  return walkHarmonyTree(tree);
}

export function extractHarmonyDumpPath(shellOutput: string): string | null {
  const out = String(shellOutput ?? "");
  const m =
    out.match(/saved to:\s*(\S+)/i) ??
    out.match(/(\/data\/local\/tmp\/layout[^\s"'`]+\.json)/i) ??
    out.match(/(layout[-\w]*\.json)/i);
  return m?.[1] ?? null;
}
