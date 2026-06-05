import type { UiNode } from "./types.js";

function readAttr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m?.[1] ?? "";
}

function readIntAttr(tag: string, name: string): number {
  const n = Number(readAttr(tag, name));
  return Number.isFinite(n) ? n : 0;
}

/** Parse WDA / XCUITest page source XML into generic UiNode list (for fillSearch / dismissPopups). */
export function parseIosHierarchy(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  const tagRe = /<XCUIElementType[A-Za-z]+[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const tag = m[0];
    const x = readIntAttr(tag, "x");
    const y = readIntAttr(tag, "y");
    const w = readIntAttr(tag, "width");
    const h = readIntAttr(tag, "height");
    if (w <= 0 || h <= 0) continue;
    const name = readAttr(tag, "name");
    const label = readAttr(tag, "label");
    const value = readAttr(tag, "value");
    const type = readAttr(tag, "type");
    const text = label || name || value;
    const desc = label && name && label !== name ? name : "";
    const id = name && name !== text ? name : "";
    const accessible = readAttr(tag, "accessible") === "true";
    const visible = readAttr(tag, "visible");
    if (visible === "false") continue;
    const cx = Math.round(x + w / 2);
    const cy = Math.round(y + h / 2);
    const clickable =
      accessible ||
      /Button|SearchField|TextField|Cell|Link|Switch|Tab/i.test(type) ||
      /Button|SearchField|TextField/i.test(tag);
    nodes.push({
      text,
      desc,
      id,
      type,
      clickable,
      focused: false,
      point: [cx, cy],
      bounds: { x1: x, y1: y, x2: x + w, y2: y + h, w, h }
    });
  }
  return nodes;
}
