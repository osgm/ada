/**
 * 页内关弹窗：仅 dialog / popup / modal 内的关闭控件（不点全屏遮罩、不用 Escape）
 */
export const WEB_DISMISS_DOM_CLICK_SCRIPT = `(() => {
  const EXACT = /^(关闭|跳过|×|✕|close|got it|no thanks|我知道了|不再提示|知道了|暂不|以后再说|取消|拒绝|ok|accept)$/i;
  const PARTIAL = /(?:^|[^a-z0-9])(close|dismiss|closebtn|close-btn|close_btn|modal-close|popup-close|btn-close|guide-close|icon-close)(?:[^a-z0-9]|$)/i;
  const POPUP_ROOT =
    '[role="dialog"],dialog,[class*="modal" i],[class*="popup" i],[class*="dialog" i],[aria-modal="true"],' +
    '[class*="login-layer" i],[class*="login-modal" i],[class*="login-popup" i],[class*="login-bottom-bar" i],' +
    '[id*="dialog-wrap" i],[id*="dialog" i],[id*="popup" i],[id*="modal" i]';
  const CLOSE_BTN_SEL =
    '[class*="closeBtn" i],[class*="close-btn" i],[class*="close_btn" i],.login-bottom-bar-right-closeBtn';
  const GENERIC_CLOSE_SEL =
    '[id*="close" i],[class*="close" i],[class*="cancel" i],[class*="dismiss" i],' +
    '[aria-label*="关闭"],[aria-label*="close" i],[title*="关闭"],[title*="close" i],' +
    'img[id*="close" i],img[class*="close" i],button[id*="close" i],button[class*="close" i]';

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return false;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    return true;
  }

  function inPopup(el) {
    return !!el.closest(POPUP_ROOT);
  }

  function labelOf(el) {
    return (
      (el.getAttribute("aria-label") || "") +
      " " +
      (el.getAttribute("title") || "") +
      " " +
      ((el.textContent || "").trim())
    ).trim();
  }

  function score(el) {
    if (!inPopup(el)) return 0;
    const text = (el.textContent || "").trim();
    const label = labelOf(el);
    const cls = (typeof el.className === "string" ? el.className : "") || "";
    let s = 40;
    if (/closeBtn|close-btn|close_btn/i.test(cls)) s += 45;
    if (EXACT.test(text) || EXACT.test(label)) s += 50;
    else if (PARTIAL.test(label) || PARTIAL.test(cls)) s += 30;
    const tag = el.tagName;
    if (tag === "BUTTON" || tag === "A" || el.getAttribute("role") === "button") s += 10;
    const r = el.getBoundingClientRect();
    if (r.width <= 72 && r.height <= 72 && (PARTIAL.test(label) || PARTIAL.test(cls))) s += 12;
    return s;
  }

  function clickEl(el) {
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } catch (_) {}
    try {
      el.click();
    } catch (_) {}
  }

  function topBlockingRoot() {
    const cx = Math.max(1, Math.floor(innerWidth / 2));
    const cy = Math.max(1, Math.floor(innerHeight / 2));
    const stack = document.elementsFromPoint(cx, cy) || [];
    for (const el of stack) {
      if (!isVisible(el)) continue;
      const id = (el.id || "").toLowerCase();
      const cls = (typeof el.className === "string" ? el.className : "").toLowerCase();
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "body" || tag === "html") continue;
      if (/(dialog|modal|popup|mask|overlay|login)/.test(id) || /(dialog|modal|popup|mask|overlay|login)/.test(cls)) {
        return el;
      }
      if (el.closest && el.closest(POPUP_ROOT)) return el.closest(POPUP_ROOT);
    }
    return null;
  }

  function clickFromRoot(root, via) {
    if (!root) return null;
    const nodes = root.querySelectorAll(GENERIC_CLOSE_SEL);
    let best = null;
    let bestScore = 0;
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const sc = score(el) + 18;
      if (sc > bestScore) {
        best = el;
        bestScore = sc;
      }
    }
    if (!best) return null;
    const r = best.getBoundingClientRect();
    clickEl(best);
    return {
      clicked: true,
      via,
      score: bestScore,
      tag: best.tagName,
      text: labelOf(best).slice(0, 80),
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2)
    };
  }

  function forceHideLogin2025IfBlocking() {
    const loginWrap = document.querySelector("#login2025-dialog-wrap");
    if (!loginWrap || !isVisible(loginWrap)) return null;
    const cx = Math.max(1, Math.floor(innerWidth / 2));
    const cy = Math.max(1, Math.floor(innerHeight / 2));
    const stack = document.elementsFromPoint(cx, cy) || [];
    const blocksCenter = stack.some((el) => el === loginWrap || loginWrap.contains(el));
    if (!blocksCenter) return null;
    loginWrap.style.setProperty("display", "none", "important");
    loginWrap.style.setProperty("pointer-events", "none", "important");
    loginWrap.setAttribute("aria-hidden", "true");
    return {
      clicked: true,
      via: "login2025-force-hide",
      tag: "DIV",
      text: "login2025-dialog-wrap"
    };
  }

  const loginHideFirst = forceHideLogin2025IfBlocking();
  if (loginHideFirst) return loginHideFirst;

  for (const el of document.querySelectorAll(CLOSE_BTN_SEL)) {
    if (!isVisible(el)) continue;
    const cls = (typeof el.className === "string" ? el.className : "") || "";
    const isLoginClose = /login-bottom-bar-right-closeBtn|closeBtn|close-btn|close_btn/i.test(cls);
    if (!inPopup(el) && !isLoginClose) continue;
    const r = el.getBoundingClientRect();
    clickEl(el);
    const stillBlocking = forceHideLogin2025IfBlocking();
    if (stillBlocking) return stillBlocking;
    return {
      clicked: true,
      via: "closeBtn-class",
      tag: el.tagName,
      text: (typeof el.className === "string" ? el.className : "").slice(0, 80),
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2)
    };
  }

  let best = null;
  let bestScore = 0;
  const nodes = document.querySelectorAll(
    "button,a,[role=button],[aria-label],[title],i,span,svg,div"
  );
  for (const el of nodes) {
    if (!isVisible(el)) continue;
    const sc = score(el);
    if (sc < 55) continue;
    if (sc > bestScore) {
      bestScore = sc;
      best = el;
    }
  }

  if (best) {
    const r = best.getBoundingClientRect();
    clickEl(best);
    const stillBlocking = forceHideLogin2025IfBlocking();
    if (stillBlocking) return stillBlocking;
    return {
      clicked: true,
      via: "popup-candidate",
      score: bestScore,
      tag: best.tagName,
      text: labelOf(best).slice(0, 80),
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2)
    };
  }

  const blocker = topBlockingRoot();
  const fromBlocker = clickFromRoot(blocker, "blocking-root");
  if (fromBlocker) {
    const stillBlocking = forceHideLogin2025IfBlocking();
    if (stillBlocking) return stillBlocking;
    return fromBlocker;
  }

  const loginHideLast = forceHideLogin2025IfBlocking();
  if (loginHideLast) return loginHideLast;

  return { clicked: false, reason: "no-popup-candidate" };
})()`;
