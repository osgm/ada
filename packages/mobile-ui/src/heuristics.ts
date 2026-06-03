import { resolveUiHeuristicsConfig, type UiHeuristicsConfig } from "./heuristics-config.js";
import type { FindUiOptions, ScreenSize, UiNode, UiPickResult, UiRole } from "./types.js";

function nodeLabel(n: UiNode): string {
  return `${n.text}${n.desc}${n.id}`.trim();
}

/** 按 hints 子串在 dump 中找节点（fillSearch P1 fallback） */
export function pickNodeByTextHints(
  nodes: UiNode[],
  hints: string[],
  role: "searchEntry" | "searchInput",
  screen: ScreenSize
): UiPickResult | null {
  if (!hints.length) return null;
  const topMaxY = role === "searchEntry" ? screen.height * 0.35 : screen.height * 0.45;
  const minW = screen.width * (role === "searchEntry" ? 0.08 : 0.12);

  for (const hint of hints) {
    const needle = hint.trim().toLowerCase();
    if (!needle) continue;
    const hits = nodes
      .map((n) => {
        const label = nodeLabel(n);
        if (!label.toLowerCase().includes(needle)) return null;
        const b = n.bounds;
        if (!b || n.point[1] > topMaxY || b.w < minW) return null;
        if (role === "searchEntry" && !n.clickable) return null;
        let score = b.w;
        if (n.focused) score += 800;
        if (n.text.toLowerCase() === needle) score += 400;
        return { n, label, score };
      })
      .filter(Boolean) as Array<{ n: UiNode; label: string; score: number }>;
    hits.sort((a, b) => b.score - a.score);
    const hit = hits[0];
    if (!hit) continue;
    return {
      point: hit.n.point,
      label: hit.label,
      kind: role === "searchEntry" ? "entry" : "input",
      score: hit.score
    };
  }
  return null;
}

function pickSearchEntry(nodes: UiNode[], screen: ScreenSize, cfg: ReturnType<typeof resolveUiHeuristicsConfig>): UiPickResult | null {
  const topMaxY = screen.height * cfg.topRegionRatio;
  const minW = screen.width * cfg.minEntryWidthRatio;
  const candidates = nodes
    .map((n) => {
      const b = n.bounds;
      if (!b || n.point[1] > topMaxY || b.w < minW) return null;
      if (!n.clickable) return null;
      const label = nodeLabel(n);
      if (!cfg.searchEntryRe.test(label)) return null;
      return { n, label, score: b.w };
    })
    .filter(Boolean) as Array<{ n: UiNode; label: string; score: number }>;
  candidates.sort((a, b) => b.score - a.score);
  const hit = candidates[0];
  if (!hit) return null;
  return { point: hit.n.point, label: hit.label, kind: "entry", score: hit.score };
}

function pickSearchInput(nodes: UiNode[], screen: ScreenSize, cfg: ReturnType<typeof resolveUiHeuristicsConfig>): UiPickResult | null {
  const topMaxY = screen.height * cfg.inputRegionRatio;
  const minW = screen.width * cfg.minInputWidthRatio;
  const candidates = nodes
    .map((n) => {
      const b = n.bounds;
      if (!b || n.point[1] > topMaxY || b.h < 24 || b.w < minW) return null;
      const label = nodeLabel(n);
      const isInputType = cfg.inputTypeRe.test(n.type);
      const isHint = cfg.searchInputRe.test(label);
      if (!isInputType && !n.focused && !isHint) return null;
      let score = b.w;
      if (isInputType) score += 800;
      if (n.focused) score += 1200;
      if (isHint) score += 400;
      if (/Button|Image/i.test(n.type) && !n.focused) score -= 600;
      return { n, label, score };
    })
    .filter(Boolean) as Array<{ n: UiNode; label: string; score: number }>;
  candidates.sort((a, b) => b.score - a.score);
  const hit = candidates[0];
  if (!hit) return null;
  return { point: hit.n.point, label: hit.label, kind: "input", score: hit.score };
}

function pickHomeTab(nodes: UiNode[], screen: ScreenSize, cfg: ReturnType<typeof resolveUiHeuristicsConfig>): UiPickResult | null {
  const bottomMinY = screen.height * cfg.bottomTabMinRatio;
  const candidates = nodes
    .filter((n) => {
      const b = n.bounds;
      if (!b || n.point[1] < bottomMinY) return false;
      if (!n.clickable) return false;
      return cfg.homeTabRe.test(nodeLabel(n));
    })
    .map((n) => ({ n, label: nodeLabel(n), score: n.bounds?.w ?? 0 }));
  candidates.sort((a, b) => b.score - a.score);
  const hit = candidates[Math.floor(candidates.length / 2)] ?? candidates[0];
  if (!hit) return null;
  return { point: hit.n.point, label: hit.label, kind: "tab", score: hit.score };
}

/** Android：顶部可点击条 + resource-id 常含 search */
function pickSearchEntryAndroid(
  nodes: UiNode[],
  screen: ScreenSize,
  cfg: ReturnType<typeof resolveUiHeuristicsConfig>
): UiPickResult | null {
  const direct = nodes.filter((n) => n.clickable && cfg.searchEntryRe.test(nodeLabel(n)));
  if (direct.length) {
    const n = direct[0];
    return { point: n.point, label: nodeLabel(n), kind: "entry" };
  }
  const topBar = nodes.filter(
    (n) => n.clickable && n.point[1] < screen.height * 0.22 && (n.text.length > 0 || n.desc.length > 0)
  );
  const hit = topBar.find((n) => cfg.searchEntryRe.test(`${n.text}${n.desc}`)) ?? topBar[0];
  if (!hit) return pickSearchEntry(nodes, screen, cfg);
  return { point: hit.point, label: nodeLabel(hit), kind: "entry" };
}

export function findUiNode(
  nodes: UiNode[],
  options: FindUiOptions & { platform?: "android" | "harmony"; heuristics?: UiHeuristicsConfig }
): UiPickResult | null {
  const { role, screen, platform } = options;
  const cfg = resolveUiHeuristicsConfig(options.heuristics);
  if (role === "searchEntry") {
    return platform === "android" ? pickSearchEntryAndroid(nodes, screen, cfg) : pickSearchEntry(nodes, screen, cfg);
  }
  if (role === "searchInput") {
    return pickSearchInput(nodes, screen, cfg);
  }
  if (role === "homeTab") {
    return pickHomeTab(nodes, screen, cfg);
  }
  return null;
}

export function normalizedSwipePoints(
  screen: ScreenSize,
  from: [number, number],
  to: [number, number],
  options?: { relative?: boolean }
): { from: [number, number]; to: [number, number] } {
  if (options?.relative === true) {
    const norm = (p: [number, number]): [number, number] => [
      Math.round(p[0] * screen.width),
      Math.round(p[1] * screen.height)
    ];
    return { from: norm(from), to: norm(to) };
  }
  return {
    from: [Math.round(from[0]), Math.round(from[1])],
    to: [Math.round(to[0]), Math.round(to[1])]
  };
}
