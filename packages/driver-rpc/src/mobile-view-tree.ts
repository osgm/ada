import {
  parseAndroidHierarchy,
  parseHarmonyLayoutJson,
  parseIosHierarchy,
  type UiNode
} from "@ada/mobile-ui";
import { normalizeControlPath } from "./web-interaction-recipe.js";

export type MobilePlatform = "android" | "ios" | "harmony";

export interface MobileControlItem {
  name: string;
  text?: string;
  desc?: string;
  resourceId?: string;
  clickable: boolean;
  point: [number, number];
  bounds?: UiNode["bounds"];
  path: string[];
}

function nodeLabel(node: UiNode): string {
  const text = node.text?.trim();
  if (text) return text;
  const desc = node.desc?.trim();
  if (desc) return desc;
  const id = node.id?.trim();
  if (id) {
    const short = id.includes("/") ? id.split("/").pop()! : id;
    return short;
  }
  return "";
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

export function parseMobileHierarchy(platform: MobilePlatform, raw: string): UiNode[] {
  if (platform === "ios") return parseIosHierarchy(raw);
  if (platform === "harmony") return parseHarmonyLayoutJson(raw);
  return parseAndroidHierarchy(raw);
}

export function extractMobilePageSourceText(resultData: Record<string, unknown> | undefined): string | undefined {
  if (!resultData) return undefined;
  const value = resultData.value;
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof resultData.pageSource === "string") return resultData.pageSource;
  if (typeof resultData.source === "string") return resultData.source;
  return undefined;
}

export function shapeMobileViewTreeFlat(
  nodes: UiNode[],
  maxItems = 80
): { flat: MobileControlItem[]; truncated: boolean } {
  const limit = Math.max(1, Math.floor(maxItems));
  const seen = new Set<string>();
  const flat: MobileControlItem[] = [];

  for (const node of nodes) {
    const name = nodeLabel(node);
    if (!name && !node.clickable) continue;
    if (!node.clickable && !name) continue;
    const key = `${name}|${node.point[0]}|${node.point[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flat.push({
      name: name || "(node)",
      text: node.text?.trim() || undefined,
      desc: node.desc?.trim() || undefined,
      resourceId: node.id?.trim() || undefined,
      clickable: node.clickable,
      point: node.point,
      bounds: node.bounds,
      path: name ? [name] : []
    });
    if (flat.length >= limit) {
      return { flat, truncated: true };
    }
  }

  return { flat, truncated: false };
}

export function findMobileNodeForSegment(nodes: UiNode[], segment: string): UiNode | undefined {
  const target = normalizeLabel(segment);
  if (!target) return undefined;

  const candidates = nodes.filter((node) => node.clickable);
  const scored = candidates
    .map((node) => {
      const label = normalizeLabel(nodeLabel(node));
      if (!label) return { node, score: -1 };
      if (label === target) return { node, score: 100 };
      if (label.includes(target) || target.includes(label)) return { node, score: 60 };
      return { node, score: -1 };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.node;
}

export function findMobileControlByPath(flat: MobileControlItem[], path: string[]): MobileControlItem | undefined {
  const normalized = normalizeControlPath(path);
  if (normalized.length === 0) return undefined;
  const leaf = normalized[normalized.length - 1];
  const leafNorm = normalizeLabel(leaf);
  let best: MobileControlItem | undefined;
  let bestScore = -1;
  for (const item of flat) {
    const labels = item.path.length > 0 ? item.path : [item.name];
    const suffix = labels.map(normalizeLabel);
    const matchesSuffix =
      suffix.length >= normalized.length &&
      suffix.slice(suffix.length - normalized.length).every((part, idx) => {
        const want = normalizeLabel(normalized[idx] ?? "");
        return part === want || part.includes(want) || want.includes(part);
      });
    const nameNorm = normalizeLabel(item.name);
    const nameMatch = nameNorm === leafNorm || nameNorm.includes(leafNorm) || leafNorm.includes(nameNorm);
    if (!matchesSuffix && !nameMatch) continue;
    const score = matchesSuffix ? normalized.length * 10 + (item.clickable ? 1 : 0) : 1;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}
