/** In-page script for ada_extract mode=viewTreeSummary (web) */
export const WEB_VIEW_TREE_SUMMARY_SCRIPT = `(() => {
  const out = [];
  const max = 50;
  const seen = new Set();
  const push = (el) => {
    if (out.length >= max) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const role = el.getAttribute("role") || el.tagName.toLowerCase();
    const name = (
      el.getAttribute("aria-label") ||
      el.getAttribute("placeholder") ||
      (el.textContent || "").trim()
    ).slice(0, 100);
    const key = role + ":" + name + ":" + Math.round(rect.x) + ":" + Math.round(rect.y);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      ref: "n-" + out.length,
      role,
      name,
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      visible: true,
      enabled: !el.disabled
    });
  };
  document.querySelectorAll("button,a,input,select,textarea,[role]").forEach(push);
  return out;
})()`;
