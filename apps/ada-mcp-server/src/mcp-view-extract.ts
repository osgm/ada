/** In-page script for ada_extract mode=viewTree (semantic UI snapshot) */
export const WEB_VIEW_TREE_SCRIPT = `(() => {
  const maxNodes = 80;
  const maxDepth = 8;
  let count = 0;
  const interactiveTags = new Set(["button", "a", "input", "select", "textarea", "option"]);
  const landmarkRoles = new Set([
    "navigation",
    "menu",
    "menubar",
    "banner",
    "main",
    "contentinfo",
    "tablist",
    "list",
    "listitem",
    "menuitem",
    "link",
    "tab",
    "checkbox",
    "radio",
    "combobox",
    "searchbox",
    "heading"
  ]);

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
    if (count >= maxNodes || depth > maxDepth) return null;
    if (!isInteresting(el)) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1 && el.tagName.toLowerCase() !== "body") return null;
    const role = el.getAttribute("role") || el.tagName.toLowerCase();
    const name = (
      el.getAttribute("aria-label") ||
      el.getAttribute("placeholder") ||
      (el.textContent || "").trim()
    ).slice(0, 120);
    const node = {
      ref: "n-" + count,
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
    count += 1;
    const children = [];
    for (const child of el.children) {
      if (count >= maxNodes) break;
      const built = buildNode(child, depth + 1);
      if (built) children.push(built);
    }
    if (children.length) node.children = children;
    return node;
  }

  const roots = [];
  for (const selector of ["nav", "header", "main", "[role=navigation]", "[role=menubar]"]) {
    for (const el of document.querySelectorAll(selector)) {
      if (count >= maxNodes) break;
      const built = buildNode(el, 0);
      if (built) roots.push(built);
    }
  }
  if (roots.length === 0) {
    const body = buildNode(document.body, 0);
    return body ? [body] : [];
  }
  return roots;
})()`;

/** @deprecated Use WEB_VIEW_TREE_SCRIPT */
export const WEB_VIEW_TREE_SUMMARY_SCRIPT = WEB_VIEW_TREE_SCRIPT;
