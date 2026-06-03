import { parseBoundsString } from "./bounds.js";
import type { UiNode } from "./types.js";

export function parseAndroidHierarchy(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  const tagRe = /<node\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const tag = m[0];
    const bounds = tag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bounds) continue;
    const b = parseBoundsString(`[${bounds[1]},${bounds[2]}][${bounds[3]},${bounds[4]}]`);
    if (!b) continue;
    const text = (tag.match(/\btext="([^"]*)"/) || [])[1] ?? "";
    const desc = (tag.match(/\bcontent-desc="([^"]*)"/) || [])[1] ?? "";
    const id = (tag.match(/\bresource-id="([^"]*)"/) || [])[1] ?? "";
    const clickable = /clickable="true"/.test(tag);
    nodes.push({
      text,
      desc,
      id,
      type: "",
      clickable,
      focused: /focused="true"/.test(tag),
      point: [b.cx, b.cy],
      bounds: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, w: b.w, h: b.h }
    });
  }
  return nodes;
}
