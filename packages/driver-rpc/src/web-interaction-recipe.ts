/** Shared observe/clickPath helpers for MCP + driver-playwright; bundled .cjs duplicates are intentional for publish. */
export type ExpandStrategy = "auto" | "hover" | "click";

export interface ControlObserveItem {
  role: string;
  name?: string;
  ariaLabel?: string;
  href?: string;
  expanded?: boolean;
  hasPopup?: boolean;
  triggerKind?: ExpandStrategy;
  path: string[];
  bounds?: { x: number; y: number; width: number; height: number };
  isLeaf?: boolean;
}

export interface ControlObserveResult {
  regions: Array<{ root: string; items: ControlObserveItem[] }>;
  flat: ControlObserveItem[];
  url: string;
}

export interface WebViewSnapshot {
  tree: unknown[];
  flat: ControlObserveItem[];
  regions: Array<{ root: string; items: ControlObserveItem[] }>;
  url: string;
}

export const WEB_INTERACTION_ERROR_CODES = {
  CONTROL_NOT_FOUND: "CONTROL_NOT_FOUND",
  PATH_NOT_EXPANDED: "PATH_NOT_EXPANDED",
  ACTION_TOGGLE_LOOP: "ACTION_TOGGLE_LOOP",
  ACTION_CIRCUIT_OPEN: "ACTION_CIRCUIT_OPEN",
  NAV_TIMEOUT: "NAV_TIMEOUT",
  PATH_INVALID: "PATH_INVALID"
} as const;

export type WebInteractionErrorCode = (typeof WEB_INTERACTION_ERROR_CODES)[keyof typeof WEB_INTERACTION_ERROR_CODES];

/** Unified in-page script: semantic tree + flat interaction controls */
export const WEB_VIEW_SCRIPT = `(() => {
  const maxNodes = 80;
  const maxDepth = 8;
  const maxItems = 120;
  let nodeCount = 0;
  const items = [];
  const seen = new Set();
  const interactiveTags = new Set(["button", "a", "input", "select", "textarea", "option"]);
  const landmarkRoles = new Set([
    "navigation", "menu", "menubar", "banner", "main", "contentinfo",
    "tablist", "list", "listitem", "menuitem", "link", "tab",
    "checkbox", "radio", "combobox", "searchbox", "heading"
  ]);

  function labelOf(el) {
    return (
      (el.getAttribute("aria-label") || "") ||
      (el.getAttribute("title") || "") ||
      (el.getAttribute("placeholder") || "") ||
      ((el.textContent || "").trim())
    ).slice(0, 120);
  }

  function isInteresting(el) {
    if (!(el instanceof Element)) return false;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || "";
    if (interactiveTags.has(tag)) return true;
    if (landmarkRoles.has(role)) return true;
    if (role) return true;
    if (el.getAttribute("aria-label")) return true;
    if (tag === "body") return true;
    return false;
  }

  function buildNode(el, depth) {
    if (nodeCount >= maxNodes || depth > maxDepth) return null;
    if (!isInteresting(el)) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1 && el.tagName.toLowerCase() !== "body") return null;
    const role = el.getAttribute("role") || el.tagName.toLowerCase();
    const name = labelOf(el);
    const node = {
      ref: "n-" + nodeCount,
      role,
      name: name || undefined,
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      visible: rect.width > 0 && rect.height > 0,
      enabled: !el.disabled
    };
    nodeCount += 1;
    const children = [];
    for (const child of el.children) {
      if (nodeCount >= maxNodes) break;
      const built = buildNode(child, depth + 1);
      if (built) children.push(built);
    }
    if (children.length) node.children = children;
    return node;
  }

  function triggerKind(el) {
    if (el.closest("[role=menubar], [data-menu-orientation=horizontal]")) return "hover";
    const popup = el.getAttribute("aria-haspopup");
    if (popup === "true" || popup === "menu") {
      const parentBar = el.closest("[role=menubar], nav");
      if (parentBar) {
        const pr = parentBar.getBoundingClientRect();
        if (pr.width > pr.height * 1.2) return "hover";
      }
    }
    return "click";
  }

  function pathOf(el) {
    const path = [];
    let node = el;
    while (node && node !== document.body) {
      const tag = (node.tagName || "").toLowerCase();
      const role = node.getAttribute("role") || "";
      if (tag === "li" || role === "menuitem" || role === "menu" || tag === "nav" || role === "menubar") {
        const label = labelOf(node);
        if (label && (tag === "li" || role === "menuitem" || tag === "a" || tag === "button")) {
          if (path[0] !== label) path.unshift(label);
        }
      }
      node = node.parentElement;
    }
    const self = labelOf(el);
    if (self && path[path.length - 1] !== self) path.push(self);
    return path.filter(Boolean);
  }

  function pushItem(el) {
    if (items.length >= maxItems) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const role = el.getAttribute("role") || el.tagName.toLowerCase();
    const name = (el.textContent || "").trim().slice(0, 120) || undefined;
    const ariaLabel = el.getAttribute("aria-label") || undefined;
    const path = pathOf(el);
    const key = path.join(">") + "|" + role + "|" + Math.round(rect.x);
    if (seen.has(key)) return;
    seen.add(key);
    const expandedRaw = el.getAttribute("aria-expanded");
    items.push({
      role: role === "a" ? "link" : role,
      name: name || undefined,
      ariaLabel,
      href: el.getAttribute("href") || undefined,
      expanded: expandedRaw === "true" ? true : expandedRaw === "false" ? false : undefined,
      hasPopup: el.getAttribute("aria-haspopup") === "true" || undefined,
      triggerKind: triggerKind(el),
      path,
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    });
  }

  const tree = [];
  for (const selector of ["nav", "header", "main", "[role=navigation]", "[role=menubar]"]) {
    for (const el of document.querySelectorAll(selector)) {
      if (nodeCount >= maxNodes) break;
      const built = buildNode(el, 0);
      if (built) tree.push(built);
    }
  }
  if (tree.length === 0) {
    const body = buildNode(document.body, 0);
    if (body) tree.push(body);
  }

  const controlRoots = ["[role=menubar]", "[role=navigation]", "nav", "aside nav", "header nav", "main"];
  for (const sel of controlRoots) {
    document.querySelectorAll(sel).forEach((root) => {
      root.querySelectorAll("[role=menuitem], [role=button], [role=link], a, button").forEach(pushItem);
    });
  }
  if (items.length === 0) {
    document.querySelectorAll("[role=menuitem], [role=button], a, button").forEach(pushItem);
  }

  const flat = items.map((item) => ({ ...item, isLeaf: !item.hasPopup }));

  return {
    tree,
    flat,
    regions: [{ root: "document", items }],
    url: location.href
  };
})()`;

export function normalizeControlPath(path: unknown): string[] {
  if (!Array.isArray(path)) return [];
  return path.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0);
}

export function normalizeRecipeAction(action: string): string {
  return action.trim().toLowerCase();
}

export function resolveExpandStrategy(
  requested: unknown,
  item?: Pick<ControlObserveItem, "triggerKind">
): ExpandStrategy {
  const raw = typeof requested === "string" ? requested.toLowerCase() : "auto";
  if (raw === "hover" || raw === "click") return raw;
  if (item?.triggerKind === "hover" || item?.triggerKind === "click") return item.triggerKind;
  return "click";
}

export function findControlByPath(flat: ControlObserveItem[], path: string[]): ControlObserveItem | undefined {
  if (path.length === 0) return undefined;
  const target = path.join(">");
  let best: ControlObserveItem | undefined;
  let bestLen = -1;
  for (const item of flat) {
    const key = (item.path ?? []).join(">");
    if (key === target || key.endsWith(">" + target) || target.endsWith(key)) {
      if (key.length > bestLen) {
        best = item;
        bestLen = key.length;
      }
    }
  }
  return best;
}

export function findControlsByHref(flat: ControlObserveItem[], href: string): ControlObserveItem[] {
  const needle = href.trim();
  if (!needle) return [];
  return flat.filter((item) => typeof item.href === "string" && item.href.includes(needle));
}

export function findControlsByName(flat: ControlObserveItem[], name: string): ControlObserveItem[] {
  const needle = name.trim().toLowerCase();
  if (!needle) return [];
  return flat.filter((item) => {
    const n = (item.name ?? item.ariaLabel ?? "").toLowerCase();
    return n.includes(needle);
  });
}

export function parseWebViewSnapshot(raw: unknown): WebViewSnapshot {
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const tree = Array.isArray(value.tree) ? value.tree : [];
  const flat = Array.isArray(value.flat) ? (value.flat as ControlObserveItem[]) : [];
  const regions = Array.isArray(value.regions) ? (value.regions as WebViewSnapshot["regions"]) : [];
  const url = typeof value.url === "string" ? value.url : "";
  return { tree, flat, regions, url };
}

export function applyControlFilters(
  snapshot: WebViewSnapshot,
  filters: { href?: string; name?: string }
): WebViewSnapshot & { matches?: ControlObserveItem[] } {
  const href = filters.href?.trim();
  const name = filters.name?.trim();
  if (!href && !name) return snapshot;
  const matches = href ? findControlsByHref(snapshot.flat, href) : findControlsByName(snapshot.flat, name ?? "");
  return { ...snapshot, matches };
}

export type ViewTreeDetail = "tree" | "controls" | "full";

export function shapeViewTreeExtract(
  snapshot: WebViewSnapshot & { matches?: ControlObserveItem[] },
  detail: ViewTreeDetail = "controls"
): unknown {
  if (detail === "tree") return snapshot.tree;
  if (detail === "controls") return snapshot.matches ?? snapshot.flat;
  const full: Record<string, unknown> = {
    tree: snapshot.tree,
    flat: snapshot.flat,
    url: snapshot.url
  };
  if (snapshot.matches?.length) {
    full.matches = snapshot.matches;
  }
  return full;
}

function truncateTreeNodeList(nodes: unknown[], maxNodes: number): { nodes: unknown[]; truncated: boolean } {
  let count = 0;
  let truncated = false;

  function walk(list: unknown[]): unknown[] {
    const out: unknown[] = [];
    for (const node of list) {
      if (count >= maxNodes) {
        truncated = true;
        break;
      }
      count += 1;
      if (!node || typeof node !== "object") {
        out.push(node);
        continue;
      }
      const record = { ...(node as Record<string, unknown>) };
      const children = record.children;
      if (Array.isArray(children)) {
        record.children = walk(children);
      }
      out.push(record);
    }
    return out;
  }

  return { nodes: walk(nodes), truncated };
}

/** Cap viewTree extract payloads for MCP responses (controls array or full object). */
export function truncateViewTreeValue(
  value: unknown,
  maxItems: number
): { value: unknown; truncated: boolean } {
  const limit = Math.max(1, Math.floor(maxItems));
  if (Array.isArray(value)) {
    const truncated = value.length > limit;
    return { value: value.slice(0, limit), truncated };
  }
  if (!value || typeof value !== "object") {
    return { value, truncated: false };
  }

  const obj = value as Record<string, unknown>;
  let truncated = false;
  const out: Record<string, unknown> = { ...obj };

  for (const key of ["flat", "matches"] as const) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length > limit) {
      out[key] = arr.slice(0, limit);
      truncated = true;
    }
  }

  if (Array.isArray(obj.tree)) {
    const treeResult = truncateTreeNodeList(obj.tree, limit);
    out.tree = treeResult.nodes;
    truncated = truncated || treeResult.truncated;
  }

  return { value: out, truncated };
}
