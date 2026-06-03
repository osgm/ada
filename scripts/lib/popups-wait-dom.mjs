/**
 * Web 弹窗就绪探测：轮询中心点是否被 dialog / login2025 遮挡
 */
export const WEB_POPUP_BLOCKER_PROBE_SCRIPT = `(() => {
  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return false;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) return false;
    return true;
  }
  const loginWrap = document.querySelector("#login2025-dialog-wrap");
  if (loginWrap && isVisible(loginWrap)) {
    return { blocking: true, id: "login2025-dialog-wrap" };
  }
  const cx = Math.max(1, Math.floor(innerWidth / 2));
  const cy = Math.max(1, Math.floor(innerHeight / 2));
  const stack = document.elementsFromPoint(cx, cy) || [];
  for (const el of stack) {
    if (!isVisible(el)) continue;
    const id = (el.id || "").toLowerCase();
    const cls = (typeof el.className === "string" ? el.className : "").toLowerCase();
    if (/(dialog|modal|popup|login)/.test(id) || /(dialog|modal|popup|login)/.test(cls)) {
      return { blocking: true, id: el.id || cls.slice(0, 40) || el.tagName };
    }
    if (el.closest && el.closest('[role="dialog"],[aria-modal="true"],#login2025-dialog-wrap')) {
      return { blocking: true, id: el.id || "dialog" };
    }
  }
  return { blocking: false };
})()`;

export const WEB_POPUP_PRE_WAIT_POLL_MS = 200;
export const WEB_POPUP_IDLE_POLLS = 2;
