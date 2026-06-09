var __ada_import_meta_url=require("url").pathToFileURL(__filename).href;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../plugins/driver-playwright/src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default,
  executeClickPath: () => executeClickPath,
  executeFillSearch: () => executeFillSearch,
  locatorFromPayload: () => locatorFromPayload,
  observeViewOnPage: () => observeViewOnPage,
  summarizeLocator: () => summarizeLocator
});
module.exports = __toCommonJS(index_exports);

// ../../packages/driver-rpc/src/playwright-defaults.ts
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function pickBool(p, options, key) {
  if (typeof p[key] === "boolean") {
    return p[key];
  }
  if (typeof options[key] === "boolean") {
    return options[key];
  }
  return void 0;
}
function resolvePlaywrightHeadless(payload) {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const explicit = pickBool(p, options, "headless");
  if (explicit !== void 0) {
    return explicit;
  }
  const env = process.env.ADA_PLAYWRIGHT_HEADLESS?.trim().toLowerCase();
  if (env === "true" || env === "1") {
    return true;
  }
  if (env === "false" || env === "0") {
    return false;
  }
  return false;
}
function resolvePlaywrightBringToFront(payload) {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const explicit = pickBool(p, options, "bringToFront");
  if (explicit !== void 0) {
    return explicit;
  }
  const env = process.env.ADA_PLAYWRIGHT_BRING_TO_FRONT?.trim().toLowerCase();
  if (env === "false" || env === "0") {
    return false;
  }
  return true;
}

// ../../packages/driver-rpc/src/fill-search-options.ts
function asStringList(v) {
  if (v == null) return [];
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  return [];
}
function mergeUnique(...lists) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const list of lists) {
    for (const item of list) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}
function parseFillSearchPayload(payload) {
  const p = payload ?? {};
  const nested = typeof p.fillSearch === "object" && p.fillSearch !== null ? p.fillSearch : {};
  const ui = p.uiHeuristics ?? nested.uiHeuristics;
  const legacyHints = asStringList(p.hints ?? nested.hints);
  const entryHints = mergeUnique(
    asStringList(p.entryHints ?? nested.entryHints),
    asStringList(ui?.searchEntryLabels),
    legacyHints
  );
  const inputHints = mergeUnique(
    asStringList(p.inputHints ?? nested.inputHints),
    asStringList(ui?.searchInputLabels),
    legacyHints
  );
  const heuristics = entryHints.length || inputHints.length || ui ? {
    ...ui,
    ...entryHints.length ? { searchEntryLabels: entryHints } : {},
    ...inputHints.length ? { searchInputLabels: inputHints } : {}
  } : ui;
  const strict = p.strict === true || nested.strict === true;
  const settleMs = typeof p.settleMs === "number" ? p.settleMs : typeof nested.settleMs === "number" ? nested.settleMs : void 0;
  return {
    heuristics,
    entryHints,
    inputHints,
    strict,
    recipeOptions: {
      settleMs,
      skipRedundantDump: p.skipRedundantDump === true || nested.skipRedundantDump === true,
      payload: p
    }
  };
}

// ../../packages/driver-rpc/src/fill-search-transition.ts
var FILL_SEARCH_DIRECT_INPUT_SETTLE_MS = 800;
var FILL_SEARCH_DEFAULT_SETTLE_MS = 400;
function isDirectInputTapDetail(detail) {
  return typeof detail === "string" && detail.includes("direct input");
}
function resolveFillSearchSettleMs(tapDetail, userSettleMs) {
  if (typeof userSettleMs === "number" && userSettleMs > 0) return userSettleMs;
  return isDirectInputTapDetail(tapDetail) ? FILL_SEARCH_DIRECT_INPUT_SETTLE_MS : FILL_SEARCH_DEFAULT_SETTLE_MS;
}

// ../../packages/driver-rpc/src/web-interaction-recipe.ts
var WEB_INTERACTION_ERROR_CODES = {
  CONTROL_NOT_FOUND: "CONTROL_NOT_FOUND",
  PATH_NOT_EXPANDED: "PATH_NOT_EXPANDED",
  ACTION_TOGGLE_LOOP: "ACTION_TOGGLE_LOOP",
  ACTION_CIRCUIT_OPEN: "ACTION_CIRCUIT_OPEN",
  NAV_TIMEOUT: "NAV_TIMEOUT",
  PATH_INVALID: "PATH_INVALID",
  FILL_SEARCH_MISSING_TEXT: "FILL_SEARCH_MISSING_TEXT",
  FILL_SEARCH_NO_ENTRY: "FILL_SEARCH_NO_ENTRY",
  FILL_SEARCH_NO_INPUT: "FILL_SEARCH_NO_INPUT",
  FILL_SEARCH_TYPE_FAILED: "FILL_SEARCH_TYPE_FAILED"
};
var DEFAULT_WEB_SEARCH_ENTRY_HINTS = ["search", "query", "find", "\u641C\u7D22"];
var DEFAULT_WEB_SEARCH_INPUT_HINTS = [
  "search",
  "query",
  "type",
  "enter",
  "input",
  "hint",
  "\u641C\u7D22",
  "\u8BF7\u8F93\u5165",
  "\u8F93\u5165"
];
var WEB_VIEW_SCRIPT = `(() => {
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
function normalizeControlPath(path3) {
  if (!Array.isArray(path3)) return [];
  return path3.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0);
}
function resolveExpandStrategy(requested, item) {
  const raw = typeof requested === "string" ? requested.toLowerCase() : "auto";
  if (raw === "hover" || raw === "click") return raw;
  if (item?.triggerKind === "hover" || item?.triggerKind === "click") return item.triggerKind;
  return "click";
}
function findControlByPath(flat, path3) {
  if (path3.length === 0) return void 0;
  const target = path3.join(">");
  let best;
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
function labelMatchesHints(label, hints) {
  if (!label?.trim() || hints.length === 0) return false;
  const lower = label.toLowerCase();
  return hints.some((hint) => hint.trim().length > 0 && lower.includes(hint.trim().toLowerCase()));
}
function findSearchEntryInFlat(flat, entryHints) {
  const hints = entryHints.length ? entryHints : DEFAULT_WEB_SEARCH_ENTRY_HINTS;
  const entryRoles = /* @__PURE__ */ new Set(["button", "link", "menuitem", "searchbox"]);
  for (const item of flat) {
    const role = (item.role ?? "").toLowerCase();
    if (!entryRoles.has(role)) continue;
    if (labelMatchesHints(item.name ?? item.ariaLabel, hints)) return item;
  }
  return void 0;
}
function findSearchInputInFlat(flat, inputHints) {
  const hints = inputHints.length ? inputHints : DEFAULT_WEB_SEARCH_INPUT_HINTS;
  const inputRoles = /* @__PURE__ */ new Set(["searchbox", "textbox", "input", "combobox"]);
  for (const item of flat) {
    const role = (item.role ?? "").toLowerCase();
    if (!inputRoles.has(role)) continue;
    const label = item.name ?? item.ariaLabel;
    if (role === "searchbox" || labelMatchesHints(label, hints)) return item;
  }
  return void 0;
}
function parseWebViewSnapshot(raw) {
  const value = typeof raw === "object" && raw !== null ? raw : {};
  const tree = Array.isArray(value.tree) ? value.tree : [];
  const flat = Array.isArray(value.flat) ? value.flat : [];
  const regions = Array.isArray(value.regions) ? value.regions : [];
  const url = typeof value.url === "string" ? value.url : "";
  return { tree, flat, regions, url };
}
function truncateTreeNodeList(nodes, maxNodes) {
  let count = 0;
  let truncated = false;
  function walk(list) {
    const out = [];
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
      const record = { ...node };
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
function truncateViewTreeValue(value, maxItems) {
  const limit = Math.max(1, Math.floor(maxItems));
  if (Array.isArray(value)) {
    const truncated2 = value.length > limit;
    return { value: value.slice(0, limit), truncated: truncated2 };
  }
  if (!value || typeof value !== "object") {
    return { value, truncated: false };
  }
  const obj = value;
  let truncated = false;
  const out = { ...obj };
  for (const key of ["flat", "matches"]) {
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
var DEFAULT_WEB_EXPAND_SETTLE_MS = 100;
function resolveWebExpandSettleMs(payload) {
  const p = payload ?? {};
  if (typeof p.expandSettleMs === "number" && p.expandSettleMs >= 0) {
    return Math.floor(p.expandSettleMs);
  }
  const env = process.env.ADA_WEB_EXPAND_SETTLE_MS?.trim();
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n >= 0) {
      return Math.floor(n);
    }
  }
  return DEFAULT_WEB_EXPAND_SETTLE_MS;
}
function resolveClickPathWaitNavigation(payload, leafMeta) {
  const p = payload ?? {};
  if (p.waitNavigation === true || p.waitNavigation === "true") {
    return true;
  }
  if (p.waitNavigation === false || p.waitNavigation === "false") {
    return false;
  }
  if (p.requireNavigation === true) {
    return true;
  }
  const href = leafMeta?.href?.trim();
  return Boolean(href && href !== "#" && !href.startsWith("#"));
}

// ../../packages/driver-rpc/src/cdp-auto-launch.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path = __toESM(require("node:path"), 1);
function asRecord2(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function getString(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
var spawnRegistry = /* @__PURE__ */ new Map();
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function pickBool2(payload, options, key, envKey) {
  if (typeof payload[key] === "boolean") return payload[key];
  if (typeof options[key] === "boolean") return options[key];
  if (envKey && process.env[envKey] === "true") return true;
  if (envKey && process.env[envKey] === "false") return false;
  return void 0;
}
function pickString(payload, options, key, envKey) {
  const top = getString(payload[key]);
  if (top) return top;
  const nested = getString(options[key]);
  if (nested) return nested;
  if (envKey && process.env[envKey]?.trim()) return process.env[envKey].trim();
  return "";
}
function parseCdpEndpoint(input, defaultPort = 9222) {
  const trimmed = input.trim();
  if (!trimmed) {
    const port2 = defaultPort;
    return { url: `http://127.0.0.1:${port2}`, host: "127.0.0.1", port: port2 };
  }
  if (/^\d+$/.test(trimmed)) {
    const port2 = Number(trimmed);
    return { url: `http://127.0.0.1:${port2}`, host: "127.0.0.1", port: port2 };
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);
  const port = url.port ? Number(url.port) : defaultPort;
  return { url: `http://${url.hostname}:${port}`, host: url.hostname, port };
}
function resolveCdpBrowserFamily(payload) {
  const p = asRecord2(payload);
  const options = asRecord2(p.options);
  const raw = (getString(p.browser) ?? getString(options.browser) ?? process.env.ADA_PLAYWRIGHT_CDP_BROWSER ?? "chromium").toLowerCase();
  return raw === "firefox" ? "firefox" : "chromium";
}
function defaultCdpPort(browser) {
  if (browser === "firefox") {
    const n2 = Number(process.env.ADA_PLAYWRIGHT_CDP_PORT_FIREFOX ?? 9223);
    return Number.isFinite(n2) && n2 > 0 ? n2 : 9223;
  }
  const n = Number(process.env.ADA_PLAYWRIGHT_CDP_PORT ?? 9222);
  return Number.isFinite(n) && n > 0 ? n : 9222;
}
function resolveCdpAutoLaunchPlan(payload) {
  const p = asRecord2(payload);
  const options = asRecord2(p.options);
  const browser = resolveCdpBrowserFamily(p);
  const autoLaunch = pickBool2(p, options, "cdpAutoLaunch", "ADA_PLAYWRIGHT_CDP_AUTO_LAUNCH") ?? false;
  const endpointRaw = pickString(p, options, "cdpEndpoint", "ADA_PLAYWRIGHT_CDP_ENDPOINT");
  const cdpPortRaw = pickString(p, options, "cdpPort", "ADA_PLAYWRIGHT_CDP_PORT");
  if (!autoLaunch && !endpointRaw) {
    return null;
  }
  const portDefault = cdpPortRaw ? Number(cdpPortRaw) : defaultCdpPort(browser);
  const parts = parseCdpEndpoint(endpointRaw || String(portDefault), portDefault);
  const headless = resolvePlaywrightHeadless(p);
  const cdpLaunchArgs = Array.isArray(p.cdpLaunchArgs) ? p.cdpLaunchArgs.map(String) : Array.isArray(options.cdpLaunchArgs) ? options.cdpLaunchArgs.map(String) : [];
  const launchOptions = asRecord2(p.launchOptions);
  const launchOptionsArgs = Array.isArray(launchOptions.args) ? launchOptions.args.map(String) : [];
  const extraArgs = [...launchOptionsArgs, ...cdpLaunchArgs];
  return {
    url: parts.url,
    port: parts.port,
    browser,
    autoLaunch,
    executablePath: pickString(p, options, "executablePath", "ADA_PLAYWRIGHT_EXECUTABLE_PATH"),
    channel: pickString(p, options, "channel", "ADA_PLAYWRIGHT_CHANNEL"),
    userDataDir: pickString(p, options, "userDataDir", "ADA_PLAYWRIGHT_USER_DATA_DIR"),
    headless,
    extraArgs
  };
}
async function probeCdpEndpoint(url, timeoutMs = 3e3) {
  const base = url.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}
function pathExists(filePath) {
  try {
    return import_node_fs.default.existsSync(filePath);
  } catch {
    return false;
  }
}
function firstExisting(paths) {
  for (const p of paths) {
    if (p && pathExists(p)) return p;
  }
  return void 0;
}
function resolveChromiumExecutable(channel, executablePath) {
  if (executablePath?.trim()) return executablePath.trim();
  const ch = (channel || process.env.ADA_PLAYWRIGHT_CHANNEL || "chrome").toLowerCase();
  if (ch === "msedge" || ch === "edge") {
    const edge = firstExisting([
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    ]);
    if (edge) return edge;
  }
  const chrome = firstExisting([
    process.env.ADA_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ].filter((x) => Boolean(x)));
  if (chrome) return chrome;
  throw new Error(
    "cdpAutoLaunch: Chrome/Edge not found. Set executablePath, channel=msedge, or ADA_CHROME_PATH"
  );
}
function resolveFirefoxExecutable(executablePath) {
  if (executablePath?.trim()) return executablePath.trim();
  const ff = firstExisting([
    process.env.ADA_FIREFOX_PATH,
    "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
    "/Applications/Firefox.app/Contents/MacOS/firefox",
    "/usr/bin/firefox"
  ].filter((x) => Boolean(x)));
  if (ff) return ff;
  throw new Error("cdpAutoLaunch: Firefox not found. Set executablePath or ADA_FIREFOX_PATH");
}
function resolveChromiumCdpUserDataDir(plan) {
  if (plan.userDataDir?.trim()) {
    const dir = plan.userDataDir.trim();
    import_node_fs.default.mkdirSync(dir, { recursive: true });
    return dir;
  }
  return import_node_fs.default.mkdtempSync(import_node_path.default.join(import_node_os.default.tmpdir(), "ada-cdp-chromium-"));
}
function buildChromiumLaunchArgs(plan, userDataDir) {
  const args = [
    `--remote-debugging-port=${plan.port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking"
  ];
  if (plan.headless) {
    args.push("--headless=new");
  }
  return [...args, ...plan.extraArgs];
}
function buildFirefoxLaunchArgs(plan) {
  const args = ["-no-remote", "-remote-debugging-port", String(plan.port)];
  if (plan.userDataDir) {
    import_node_fs.default.mkdirSync(plan.userDataDir, { recursive: true });
    args.push("-profile", plan.userDataDir);
  }
  if (plan.headless) {
    args.push("-headless");
  }
  return [...args, ...plan.extraArgs];
}
function spawnCdpBrowser(plan) {
  const executable = plan.browser === "firefox" ? resolveFirefoxExecutable(plan.executablePath) : resolveChromiumExecutable(plan.channel, plan.executablePath);
  const chromiumProfile = plan.browser === "firefox" ? "" : resolveChromiumCdpUserDataDir(plan);
  const args = plan.browser === "firefox" ? buildFirefoxLaunchArgs(plan) : buildChromiumLaunchArgs(plan, chromiumProfile);
  const child = (0, import_node_child_process.spawn)(executable, args, {
    detached: true,
    stdio: "ignore",
    shell: false,
    ...process.platform === "win32" ? { windowsHide: true } : {}
  });
  if (!child.pid) {
    throw new Error(`cdpAutoLaunch: failed to spawn ${plan.browser} (${executable})`);
  }
  const handle = {
    pid: child.pid,
    browser: plan.browser,
    port: plan.port,
    url: plan.url,
    executablePath: executable,
    ...chromiumProfile ? { userDataDir: chromiumProfile } : {}
  };
  child.unref();
  spawnRegistry.set(child.pid, handle);
  return handle;
}
async function forceKillProcessTree(pid) {
  forceKillProcessTreeDetached(pid);
}
function forceKillProcessTreeDetached(pid) {
  if (!pid || pid <= 0) return;
  if (process.platform === "win32") {
    const killer = (0, import_node_child_process.spawn)("taskkill", ["/PID", String(pid), "/T", "/F"], {
      shell: false,
      windowsHide: true,
      detached: true,
      stdio: "ignore"
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
    }
  }
}
async function stopCdpSpawn(handle) {
  if (!handle?.pid) return;
  spawnRegistry.delete(handle.pid);
  await forceKillProcessTree(handle.pid);
}
function cleanupAllCdpSpawnsDetached() {
  const handles = [...spawnRegistry.values()];
  spawnRegistry.clear();
  for (const h of handles) {
    forceKillProcessTreeDetached(h.pid);
  }
  return handles.length;
}
async function ensureCdpEndpointReady(plan, opts) {
  const timeoutMs = opts?.waitTimeoutMs ?? 45e3;
  if (await probeCdpEndpoint(plan.url)) {
    return { url: plan.url, spawned: null };
  }
  if (!plan.autoLaunch) {
    throw new Error(
      `CDP endpoint not reachable at ${plan.url}. Start browser with remote debugging or set cdpAutoLaunch=true`
    );
  }
  const spawned = spawnCdpBrowser(plan);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeCdpEndpoint(plan.url)) {
      return { url: plan.url, spawned };
    }
    await sleep(500);
  }
  await stopCdpSpawn(spawned).catch(() => void 0);
  throw new Error(
    `cdpAutoLaunch: ${plan.browser} did not expose CDP at ${plan.url} within ${timeoutMs}ms`
  );
}

// ../../packages/driver-rpc/src/index.ts
var PLAYWRIGHT_OBJECT_TYPES = /* @__PURE__ */ new Set([
  "Page",
  "Frame",
  "Locator",
  "BrowserContext",
  "Browser",
  "Response",
  "CDPSession",
  "ElementHandle",
  "JSHandle",
  "Worker",
  "Request",
  "Route",
  "WebSocket"
]);
function asRecord3(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function getString2(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function normalizeInvokePayload(raw, defaultMode) {
  const payload = asRecord3(raw);
  const httpBlock = asRecord3(payload.http);
  const httpMethod = getString2(httpBlock.method);
  const httpPath = getString2(httpBlock.path);
  const hasHttp = Boolean(httpMethod && httpPath);
  const method = getString2(payload.method);
  const target = getString2(payload.target);
  const hasMethod = Boolean(method);
  let mode = getString2(payload.mode);
  if (mode !== "method" && mode !== "http") {
    mode = hasHttp ? "http" : hasMethod ? "method" : defaultMode;
  }
  if (mode === "http" && !hasHttp && hasMethod) {
    mode = "method";
  }
  if (mode === "method" && !hasMethod && hasHttp) {
    mode = "http";
  }
  if (mode === "http") {
    if (!httpMethod || !httpPath) {
      return null;
    }
    return {
      mode: "http",
      http: {
        method: httpMethod,
        path: httpPath,
        body: httpBlock.body
      },
      options: asRecord3(payload.options)
    };
  }
  if (!method) {
    return null;
  }
  return {
    mode: "method",
    target: target ?? "page",
    method,
    args: Array.isArray(payload.args) ? payload.args : [],
    locator: asRecord3(payload.locator),
    options: asRecord3(payload.options)
  };
}
function pickPayloadString(payload, options, key, aliases = [], envKey) {
  const keys = [key, ...aliases];
  for (const k of keys) {
    const top = getString2(payload[k]);
    if (top) {
      return top;
    }
    const nested = getString2(options[k]);
    if (nested) {
      return nested;
    }
  }
  if (envKey && typeof process.env[envKey] === "string" && process.env[envKey].length > 0) {
    return process.env[envKey];
  }
  return "";
}
function resolveLocalBrowserFields(payload) {
  const p = asRecord3(payload);
  const options = asRecord3(p.options);
  return {
    cdpEndpoint: pickPayloadString(p, options, "cdpEndpoint", ["browserURL", "cdpUrl"], "ADA_PLAYWRIGHT_CDP_ENDPOINT"),
    executablePath: pickPayloadString(
      p,
      options,
      "executablePath",
      ["browserPath", "browserExecutable"],
      "ADA_PLAYWRIGHT_EXECUTABLE_PATH"
    ),
    channel: pickPayloadString(p, options, "channel", [], "ADA_PLAYWRIGHT_CHANNEL"),
    userDataDir: pickPayloadString(p, options, "userDataDir", [], "ADA_PLAYWRIGHT_USER_DATA_DIR")
  };
}
function buildSessionKey(payload) {
  const p = asRecord3(payload);
  const options = asRecord3(p.options);
  const local = resolveLocalBrowserFields(p);
  const browser = getString2(p.browser) ?? getString2(options.browser) ?? "chromium";
  const headless = resolvePlaywrightHeadless(p);
  const storageStatePath = getString2(p.storageStatePath) ?? getString2(options.storageStatePath) ?? "";
  const storageState = p.storageState ?? options.storageState;
  const storageKey = storageStatePath || (storageState !== void 0 ? JSON.stringify(storageState) : "");
  const cdpAutoLaunch = typeof p.cdpAutoLaunch === "boolean" ? p.cdpAutoLaunch : typeof options.cdpAutoLaunch === "boolean" ? options.cdpAutoLaunch : process.env.ADA_PLAYWRIGHT_CDP_AUTO_LAUNCH === "true";
  const cdpPort = getString2(p.cdpPort) ?? getString2(options.cdpPort) ?? "";
  return `${browser}|${headless}|${local.cdpEndpoint}|${cdpAutoLaunch}|${cdpPort}|${local.executablePath}|${local.channel}|${local.userDataDir}|${storageKey}`;
}
function serializeRpcResult(value, depth = 0) {
  if (depth > 10) {
    return "[MaxDepth]";
  }
  if (value === void 0) {
    return { __undefined: true };
  }
  if (value === null || typeof value !== "function") {
    if (value === null || typeof value !== "object") {
      return value;
    }
  } else {
    return { __type: "Function", hint: "Functions are not serializable over invoke RPC" };
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return { __type: "Buffer", encoding: "base64", data: value.toString("base64") };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeRpcResult(item, depth + 1));
  }
  const ctor = value.constructor?.name;
  if (ctor && PLAYWRIGHT_OBJECT_TYPES.has(ctor)) {
    return { __type: ctor, hint: "Live Playwright object; chain further invoke calls on page/context" };
  }
  if (value instanceof Map) {
    const out = {};
    for (const [k, v] of value.entries()) {
      out[String(k)] = serializeRpcResult(v, depth + 1);
    }
    return out;
  }
  try {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function") {
        continue;
      }
      out[k] = serializeRpcResult(v, depth + 1);
    }
    return out;
  } catch {
    return String(value);
  }
}
function mergeOptionsIntoPayload(payload) {
  const p = { ...asRecord3(payload) };
  const options = asRecord3(p.options);
  for (const key of [
    "browser",
    "headless",
    "bringToFront",
    "userDataDir",
    "storageStatePath",
    "storageState",
    "launchOptions",
    "contextOptions",
    "cdpEndpoint",
    "cdpAutoLaunch",
    "cdpPort",
    "cdpLaunchArgs",
    "browserURL",
    "cdpUrl",
    "executablePath",
    "browserPath",
    "browserExecutable",
    "channel",
    "engine",
    "browserName",
    "browserBinary",
    "profile"
  ]) {
    if (p[key] === void 0 && options[key] !== void 0) {
      p[key] = options[key];
    }
  }
  return p;
}

// ../../plugins/driver-playwright/src/index.ts
var import_node_module = require("node:module");
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);

// ../../plugins/driver-playwright/src/playwright-locator.ts
function asRecord4(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function getString3(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function parseLocator(raw) {
  if (!raw) return void 0;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") return raw;
  return void 0;
}
function stripScopeFields(raw) {
  if (!raw) return void 0;
  if (typeof raw === "string") return raw;
  if (typeof raw !== "object") return void 0;
  const l = { ...raw };
  delete l.within;
  delete l.parent;
  delete l.nth;
  return l;
}
function summarizeLocator(raw) {
  const locator = parseLocator(raw);
  if (!locator) return "(none)";
  if (typeof locator === "string") return locator;
  const l = locator;
  const scope = typeof l.nth === "number" ? `.nth(${l.nth})` : typeof l.nth === "string" ? `.nth(${l.nth})` : "";
  const withinHint = l.within || l.parent ? " within(...)" : "";
  if (typeof l.kind === "string") {
    if (typeof l.value === "string") return `${l.kind}:${l.value}${scope}${withinHint}`;
    if (typeof l.role === "string") return `role:${l.role}${l.name ? `(${String(l.name)})` : ""}${scope}${withinHint}`;
    if (typeof l.query === "string") return `visual:${l.query}${scope}${withinHint}`;
  }
  if (l.role) return `role:${String(l.role)}${l.name ? `(${String(l.name)})` : ""}${scope}${withinHint}`;
  if (l.testId) return `testId:${String(l.testId)}${scope}${withinHint}`;
  if (l.css) return `css:${String(l.css)}${scope}${withinHint}`;
  if (l.xpath) return `xpath:${String(l.xpath)}${scope}${withinHint}`;
  if (l.text) return `text:${String(l.text)}${scope}${withinHint}`;
  if (l.accessibilityId) return `a11y:${String(l.accessibilityId)}${scope}${withinHint}`;
  if (l.id) return `id:${String(l.id)}${scope}${withinHint}`;
  return JSON.stringify(l);
}
function resolveAutoWaitMs(payload) {
  const p = asRecord4(payload);
  const options = asRecord4(p.options);
  const fromPayload = typeof p.waitTimeoutMs === "number" ? p.waitTimeoutMs : typeof p.timeoutMs === "number" ? p.timeoutMs : typeof p.locatorTimeoutMs === "number" ? p.locatorTimeoutMs : void 0;
  const fromOptions = typeof options.waitTimeoutMs === "number" ? options.waitTimeoutMs : void 0;
  const env = Number(process.env.ADA_PLAYWRIGHT_AUTO_WAIT_MS ?? "5000");
  const raw = fromPayload ?? fromOptions ?? env;
  if (!Number.isFinite(raw) || raw <= 0) return 5e3;
  return Math.floor(raw);
}
async function autoWaitLocator(locator, timeoutMs) {
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
}
async function autoWaitEnabled(locator, timeoutMs) {
  await autoWaitLocator(locator, timeoutMs);
  if (typeof locator.isEnabled === "function") {
    const enabled = await locator.isEnabled({ timeout: timeoutMs });
    if (!enabled) {
      throw new Error("locator is not enabled");
    }
  }
}
function resolveLocatorOnScope(scope, locator) {
  if (!locator) {
    return null;
  }
  if (typeof locator === "string") {
    return scope.locator(locator);
  }
  const l = locator;
  const kind = getString3(l.kind) ?? getString3(l.strategy);
  if (kind === "role" && scope.getByRole) {
    const role = getString3(l.role);
    if (role) return scope.getByRole(role, l.name ? { name: String(l.name) } : void 0);
  }
  if (kind === "testId" && scope.getByTestId) {
    const value = getString3(l.value);
    if (value) return scope.getByTestId(value);
  }
  if (kind === "css" || kind === "xpath" || kind === "text" || kind === "resourceId" || kind === "accessibilityId") {
    const value = getString3(l.value);
    if (value) {
      if (kind === "text" && scope.getByText) return scope.getByText(value);
      if (kind === "xpath") return scope.locator(`xpath=${value}`);
      return scope.locator(value);
    }
  }
  if (l.role && scope.getByRole) return scope.getByRole(String(l.role), l.name ? { name: String(l.name) } : void 0);
  if (l.testId && scope.getByTestId) return scope.getByTestId(String(l.testId));
  if (l.text && scope.getByText) return scope.getByText(String(l.text));
  if (l.css) return scope.locator(String(l.css));
  if (l.xpath) return scope.locator(`xpath=${String(l.xpath)}`);
  if (l.id) return scope.locator(`#${String(l.id)}`);
  if (l.accessibilityId) return scope.locator(`[aria-label="${String(l.accessibilityId)}"]`);
  return null;
}
function applyNth(base, raw) {
  if (!base || raw === void 0 || raw === null) {
    return base;
  }
  const idx = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(idx) || idx < 0) {
    return base;
  }
  return base.nth(Math.floor(idx));
}
function locatorFromPayload(page, payload) {
  const p = asRecord4(payload);
  const locator = parseLocator(p.locator);
  if (!locator) {
    const selector = getString3(p.selector);
    return selector ? page.locator(selector) : null;
  }
  const l = typeof locator === "object" ? locator : {};
  const within = l.within ?? l.parent;
  let scope = page;
  if (within) {
    const parent = locatorFromPayload(page, { locator: within });
    if (!parent) return null;
    scope = parent;
  }
  const inner = stripScopeFields(locator);
  const base = resolveLocatorOnScope(scope, inner);
  return applyNth(base, l.nth);
}

// ../../plugins/driver-playwright/src/web-interaction-recipe.ts
var CLICK_PATH_CONTROLS_PREVIEW = 40;
function getString4(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function failResult(command, code, message, data) {
  return {
    requestId: command.requestId,
    success: false,
    errorCode: code,
    errorMessage: message,
    data
  };
}
async function waitAfterNavigation(page, payload, beforeUrl) {
  if (payload.waitNavigation !== true && payload.waitNavigation !== "true") {
    return { navigated: false, url: page.url() };
  }
  const timeoutMs = typeof payload.navigationTimeoutMs === "number" ? payload.navigationTimeoutMs : 8e3;
  const before = beforeUrl || page.url();
  try {
    await page.waitForURL((url) => url.href !== before, { timeout: timeoutMs });
    return { navigated: true, url: page.url() };
  } catch {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: Math.min(timeoutMs, 3e3) });
    } catch {
    }
    const after = page.url();
    if (after !== before) {
      return { navigated: true, url: after };
    }
    return { navigated: false, url: after };
  }
}
async function observeViewOnPage(page) {
  const raw = await page.evaluate(WEB_VIEW_SCRIPT);
  const snapshot = parseWebViewSnapshot(raw);
  return {
    ...snapshot,
    url: snapshot.url || page.url()
  };
}
async function resolveLabelLocator(page, label, nthFallback) {
  const roles = ["menuitem", "link", "button", "tab"];
  for (const role of roles) {
    try {
      const exact = page.getByRole(role, { name: label, exact: true });
      if (await exact.count() > 0) return exact.first();
    } catch {
    }
    try {
      const loose = page.getByRole(role, { name: label });
      if (await loose.count() > 0) return loose.first();
    } catch {
    }
  }
  try {
    const aria = page.locator(`[aria-label="${label.replace(/"/g, '\\"')}"]`);
    if (await aria.count() > 0) return aria.first();
  } catch {
  }
  if (typeof nthFallback === "number" && nthFallback >= 0) {
    for (const role of ["menuitem", "button", "link"]) {
      try {
        const items = page.getByRole(role);
        const count = await items.count();
        if (nthFallback < count) return items.nth(nthFallback);
      } catch {
      }
    }
  }
  return null;
}
async function expandPathSegment(page, label, strategy, waitMs, expandSettleMs, nthFallback) {
  const locator = await resolveLabelLocator(page, label, nthFallback);
  if (!locator) {
    return { ok: false, error: `control label not found: ${label}` };
  }
  if (strategy === "hover") {
    await locator.hover({ timeout: waitMs });
  } else {
    await locator.click({ timeout: waitMs });
  }
  if (expandSettleMs > 0) {
    await page.waitForTimeout(expandSettleMs);
  }
  return { ok: true };
}
async function firstVisibleLocator(locator, waitMs) {
  try {
    const count = await locator.count();
    if (count <= 0) return null;
    const first = locator.first();
    await autoWaitEnabled(first, waitMs);
    return first;
  } catch {
    return null;
  }
}
async function probeSearchInputLocator(page, inputHints) {
  try {
    const searchbox = page.getByRole("searchbox");
    if (await searchbox.count() > 0) {
      return { locator: searchbox.first(), mode: "searchbox" };
    }
  } catch {
  }
  try {
    const typeSearch = page.locator('input[type="search"]');
    if (await typeSearch.count() > 0) {
      return { locator: typeSearch.first(), mode: "input-type-search" };
    }
  } catch {
  }
  for (const hint of inputHints) {
    for (const role of ["textbox", "searchbox"]) {
      try {
        const byRole = page.getByRole(role, { name: hint });
        if (await byRole.count() > 0) {
          return { locator: byRole.first(), mode: `role-${role}` };
        }
      } catch {
      }
    }
    try {
      const byPlaceholder = page.getByPlaceholder(hint);
      if (await byPlaceholder.count() > 0) {
        return { locator: byPlaceholder.first(), mode: "placeholder" };
      }
    } catch {
    }
  }
  try {
    const headerInput = page.locator('header input, nav input, [role="search"] input, form input[type="search"]');
    if (await headerInput.count() > 0) {
      return { locator: headerInput.first(), mode: "header-input" };
    }
  } catch {
  }
  return null;
}
async function waitForSearchInputAfterEntry(page, inputHints, maxMs, pollMs = 80) {
  if (maxMs <= 0) {
    return probeSearchInputLocator(page, inputHints);
  }
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const hit = await probeSearchInputLocator(page, inputHints);
    if (hit) {
      return hit;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await page.waitForTimeout(Math.min(pollMs, remaining));
  }
  return probeSearchInputLocator(page, inputHints);
}
async function resolveSearchInputLocator(page, inputHints, waitMs, flat) {
  const probed = await probeSearchInputLocator(page, inputHints);
  if (probed) {
    try {
      await autoWaitEnabled(probed.locator, waitMs);
      return probed;
    } catch {
    }
  }
  const observed = flat ?? (await observeViewOnPage(page)).flat;
  const meta = findSearchInputInFlat(observed, inputHints);
  const label = meta?.name ?? meta?.ariaLabel;
  if (label) {
    const fromFlat = await resolveLabelLocator(page, label);
    if (fromFlat) {
      try {
        await autoWaitEnabled(fromFlat, waitMs);
        return { locator: fromFlat, mode: "flat-input" };
      } catch {
      }
    }
  }
  return null;
}
async function resolveSearchEntryLocator(page, entryHints, waitMs, flat) {
  for (const hint of entryHints) {
    for (const role of ["button", "link", "menuitem"]) {
      const byRole = await firstVisibleLocator(page.getByRole(role, { name: hint }), waitMs);
      if (byRole) return { locator: byRole, mode: `entry-${role}` };
    }
  }
  const observed = flat ?? (await observeViewOnPage(page)).flat;
  const meta = findSearchEntryInFlat(observed, entryHints);
  const label = meta?.name ?? meta?.ariaLabel;
  if (label) {
    const fromFlat = await resolveLabelLocator(page, label);
    if (fromFlat) {
      try {
        await autoWaitEnabled(fromFlat, waitMs);
        return { locator: fromFlat, mode: "flat-entry", meta };
      } catch {
      }
    }
  }
  return null;
}
async function executeFillSearch(command, page, payload) {
  const text = getString4(payload?.text);
  if (!text) {
    return failResult(
      command,
      WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_MISSING_TEXT,
      "fill_search requires text"
    );
  }
  const parsed = parseFillSearchPayload(payload);
  const waitMs = resolveAutoWaitMs(payload);
  const beforeUrl = page.url();
  let mode = "direct";
  let tapMode;
  let tapMeta;
  let input = await resolveSearchInputLocator(page, parsed.inputHints, waitMs);
  if (!input) {
    const entry = await resolveSearchEntryLocator(page, parsed.entryHints, waitMs);
    if (!entry) {
      if (parsed.strict) {
        return failResult(
          command,
          WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_ENTRY,
          "search entry not found (strict)",
          { entryHints: parsed.entryHints, businessCode: WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_ENTRY }
        );
      }
      return failResult(
        command,
        WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_ENTRY,
        "search entry not found",
        { entryHints: parsed.entryHints, businessCode: WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_ENTRY }
      );
    }
    tapMode = entry.mode;
    tapMeta = entry.meta;
    await entry.locator.click({ timeout: waitMs });
    mode = "entryTap";
    const settleMs = resolveFillSearchSettleMs(
      entry.mode.includes("flat") ? "direct input" : void 0,
      parsed.recipeOptions.settleMs
    );
    input = await waitForSearchInputAfterEntry(page, parsed.inputHints, settleMs);
    if (input) {
      try {
        await autoWaitEnabled(input.locator, waitMs);
      } catch {
        input = null;
      }
    }
  }
  if (!input) {
    if (parsed.strict) {
      return failResult(
        command,
        WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_INPUT,
        "search input not found (strict)",
        { inputHints: parsed.inputHints, tapMode, businessCode: WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_INPUT }
      );
    }
    return failResult(
      command,
      WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_INPUT,
      "search input not found",
      { inputHints: parsed.inputHints, tapMode, businessCode: WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_NO_INPUT }
    );
  }
  try {
    await input.locator.fill(text, { timeout: waitMs });
    await input.locator.press("Enter", { timeout: waitMs });
  } catch (error) {
    return failResult(
      command,
      WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
      error instanceof Error ? error.message : String(error),
      {
        mode,
        inputMode: input.mode,
        tapMode,
        businessCode: WEB_INTERACTION_ERROR_CODES.FILL_SEARCH_TYPE_FAILED
      }
    );
  }
  const nav = await waitAfterNavigation(page, { ...payload, waitNavigation: payload?.waitNavigation === true }, beforeUrl);
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "playwright",
      command: "recipe",
      action: "fill_search",
      text,
      mode,
      inputMode: input.mode,
      tapMode,
      tapMeta,
      enterOk: true,
      navigated: nav.navigated,
      url: nav.url,
      businessCode: "FILL_SEARCH_OK"
    }
  };
}
async function executeClickPath(command, page, payload) {
  const path3 = normalizeControlPath(payload?.path);
  if (path3.length === 0) {
    return failResult(command, WEB_INTERACTION_ERROR_CODES.PATH_INVALID, "clickPath requires non-empty path array");
  }
  const waitMs = resolveAutoWaitMs(payload);
  const expandSettleMs = resolveWebExpandSettleMs(payload);
  let observed = await observeViewOnPage(page);
  let targetMeta = findControlByPath(observed.flat, path3);
  const beforeUrl = page.url();
  for (let i = 0; i < path3.length - 1; i += 1) {
    const segment = path3[i];
    const segMeta = findControlByPath(observed.flat, path3.slice(0, i + 1));
    const segStrategy = resolveExpandStrategy(payload?.strategy, segMeta);
    const nthFallback = segment ? void 0 : Number(payload?.triggerNth ?? i);
    const expanded = await expandPathSegment(page, segment || "", segStrategy, waitMs, expandSettleMs, nthFallback);
    if (!expanded.ok) {
      return failResult(command, WEB_INTERACTION_ERROR_CODES.PATH_NOT_EXPANDED, expanded.error ?? `failed to expand ${segment}`, {
        path: path3,
        segment,
        businessCode: WEB_INTERACTION_ERROR_CODES.PATH_NOT_EXPANDED
      });
    }
    observed = await observeViewOnPage(page);
    targetMeta = findControlByPath(observed.flat, path3);
  }
  const leaf = path3[path3.length - 1];
  const leafStrategy = resolveExpandStrategy(payload?.strategy, targetMeta);
  const isLeafPopup = targetMeta?.hasPopup === true && path3.length === 1;
  const locator = await resolveLabelLocator(page, leaf, Number(payload?.leafNth));
  if (!locator) {
    return failResult(command, WEB_INTERACTION_ERROR_CODES.CONTROL_NOT_FOUND, `path leaf not found: ${leaf}`, {
      path: path3,
      businessCode: WEB_INTERACTION_ERROR_CODES.CONTROL_NOT_FOUND
    });
  }
  if (isLeafPopup && leafStrategy === "hover") {
    await locator.hover({ timeout: waitMs });
  } else {
    await locator.click({ timeout: waitMs });
  }
  const shouldWaitNavigation = resolveClickPathWaitNavigation(payload, targetMeta);
  const waitPayload = {
    ...payload,
    waitNavigation: shouldWaitNavigation
  };
  const nav = await waitAfterNavigation(page, waitPayload, beforeUrl);
  if (shouldWaitNavigation && !nav.navigated && (targetMeta?.href || payload?.requireNavigation === true)) {
    return failResult(command, WEB_INTERACTION_ERROR_CODES.NAV_TIMEOUT, `navigation did not complete after clickPath: ${leaf}`, {
      path: path3,
      beforeUrl,
      afterUrl: nav.url,
      businessCode: WEB_INTERACTION_ERROR_CODES.NAV_TIMEOUT
    });
  }
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "playwright",
      command: "recipe",
      action: "clickPath",
      path: path3,
      strategy: leafStrategy,
      navigated: nav.navigated,
      url: nav.url,
      waitNavigation: shouldWaitNavigation,
      controls: serializeRpcResult(truncateViewTreeValue(observed.flat, CLICK_PATH_CONTROLS_PREVIEW).value),
      controlsTruncated: observed.flat.length > CLICK_PATH_CONTROLS_PREVIEW ? true : void 0,
      reObservedAfterExpand: path3.length > 1 ? true : void 0,
      businessCode: "PATH_CLICK_OK"
    }
  };
}

// ../../plugins/driver-playwright/src/web-navigation.ts
var VALID_WAIT_UNTIL = /* @__PURE__ */ new Set(["load", "domcontentloaded", "networkidle", "commit"]);
function getNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function resolveGotoOptions(payload) {
  const raw = payload?.waitUntil;
  const waitUntil = typeof raw === "string" && VALID_WAIT_UNTIL.has(raw) ? raw : "domcontentloaded";
  const timeout = getNumber(payload?.navigationTimeoutMs) ?? getNumber(payload?.timeoutMs) ?? 3e4;
  return { waitUntil, timeout: Math.max(1e3, timeout) };
}
async function gotoPage(page, url, payload) {
  const opts = resolveGotoOptions(payload);
  await page.goto(url, { waitUntil: opts.waitUntil, timeout: opts.timeout });
}

// ../../scripts/lib/popups-dismiss-dom.mjs
var WEB_DISMISS_DOM_CLICK_SCRIPT = `(() => {
  const EXACT = /^(\u5173\u95ED|\u8DF3\u8FC7|\xD7|\u2715|close|got it|no thanks|\u6211\u77E5\u9053\u4E86|\u4E0D\u518D\u63D0\u793A|\u77E5\u9053\u4E86|\u6682\u4E0D|\u4EE5\u540E\u518D\u8BF4|\u53D6\u6D88|\u62D2\u7EDD|ok|accept)$/i;
  const PARTIAL = /(?:^|[^a-z0-9])(close|dismiss|closebtn|close-btn|close_btn|modal-close|popup-close|btn-close|guide-close|icon-close)(?:[^a-z0-9]|$)/i;
  const POPUP_ROOT =
    '[role="dialog"],dialog,[class*="modal" i],[class*="popup" i],[class*="dialog" i],[aria-modal="true"],' +
    '[class*="login-layer" i],[class*="login-modal" i],[class*="login-popup" i],[class*="login-bottom-bar" i],' +
    '[id*="dialog-wrap" i],[id*="dialog" i],[id*="popup" i],[id*="modal" i]';
  const CLOSE_BTN_SEL =
    '[class*="closeBtn" i],[class*="close-btn" i],[class*="close_btn" i],.login-bottom-bar-right-closeBtn';
  const GENERIC_CLOSE_SEL =
    '[id*="close" i],[class*="close" i],[class*="cancel" i],[class*="dismiss" i],' +
    '[aria-label*="\u5173\u95ED"],[aria-label*="close" i],[title*="\u5173\u95ED"],[title*="close" i],' +
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

// ../../scripts/lib/popups-wait-dom.mjs
var WEB_POPUP_BLOCKER_PROBE_SCRIPT = `(() => {
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
var WEB_POPUP_PRE_WAIT_POLL_MS = 200;
var WEB_POPUP_IDLE_POLLS = 2;

// ../../plugins/driver-playwright/src/web-dismiss-popups.ts
var DOM_SCAN_BURST = 4;
var DISMISS_HIT_SLEEP_MS = 200;
var DISMISS_ROUND_SLEEP_MS = 200;
var DISMISS_LOCATOR_TIMEOUT_MS = 300;
var POPUP_ROOT = '[role="dialog"],dialog,[class*="modal" i],[class*="popup" i],[aria-modal="true"],[class*="login-layer" i],[class*="login-modal" i],[class*="login-popup" i],[class*="login-bottom-bar" i],[id*="dialog-wrap" i],[id*="dialog" i]';
var WEB_DISMISS_LOCATORS = [
  {
    css: `${POPUP_ROOT} [id*="close" i], ${POPUP_ROOT} [class*="close" i], ${POPUP_ROOT} [class*="cancel" i], ${POPUP_ROOT} [class*="dismiss" i]`
  },
  {
    css: `#login2025-dialog-wrap [id*="close" i], #login2025-dialog-wrap [class*="close" i], #login2025-dialog-wrap [aria-label*="\u5173\u95ED"], #login2025-dialog-wrap [aria-label*="close" i]`
  },
  {
    css: `${POPUP_ROOT} [aria-label*="\u5173\u95ED"], ${POPUP_ROOT} [aria-label*="close" i], ${POPUP_ROOT} [title*="\u5173\u95ED"], ${POPUP_ROOT} [title*="close" i]`
  },
  {
    css: `${POPUP_ROOT} img[id*="close" i], ${POPUP_ROOT} img[class*="close" i], ${POPUP_ROOT} button[id*="close" i], ${POPUP_ROOT} button[class*="close" i]`
  },
  {
    css: `${POPUP_ROOT} [id^="close" i], ${POPUP_ROOT} [id$="close" i], ${POPUP_ROOT} [class^="close" i], ${POPUP_ROOT} [class$="close" i]`
  },
  { css: `${POPUP_ROOT} [data-dismiss="modal"]` }
];
function asRecord5(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function getNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function sleep2(page, ms) {
  return page.waitForTimeout(Math.max(0, ms));
}
async function waitForWebPopupReady(page, budgetMs) {
  const deadline = Date.now() + Math.max(0, budgetMs);
  let idleStreak = 0;
  let sawBlocker = false;
  while (Date.now() < deadline) {
    const value = asRecord5(await page.evaluate(WEB_POPUP_BLOCKER_PROBE_SCRIPT));
    if (value.blocking) {
      sawBlocker = true;
      idleStreak = 0;
      return { ready: true, reason: "blocking", id: String(value.id ?? "blocker") };
    }
    idleStreak += 1;
    if (idleStreak >= WEB_POPUP_IDLE_POLLS) {
      return { ready: true, reason: sawBlocker ? "cleared" : "idle" };
    }
    await sleep2(page, WEB_POPUP_PRE_WAIT_POLL_MS);
  }
  return { ready: true, reason: "timeout", sawBlocker };
}
async function tryDomDismiss(page) {
  const value = asRecord5(await page.evaluate(WEB_DISMISS_DOM_CLICK_SCRIPT));
  return value.clicked === true ? value : null;
}
async function tryLocatorDismiss(page, payload, waitMs) {
  for (const locatorSpec of WEB_DISMISS_LOCATORS) {
    const locator = locatorFromPayload(page, { ...payload, locator: locatorSpec });
    if (!locator) continue;
    try {
      await locator.click({ timeout: Math.min(waitMs, DISMISS_LOCATOR_TIMEOUT_MS) });
      return locatorSpec;
    } catch {
    }
  }
  return null;
}
async function executeDismissPopups(command, page, payload) {
  const timeoutMs = Math.max(600, getNumber2(payload.timeoutMs) ?? 1e4);
  const attempts = Math.max(1, Math.floor(getNumber2(payload.attempts) ?? 4));
  const waitMs = resolveAutoWaitMs(payload);
  const started = Date.now();
  const deadline = started + timeoutMs;
  let dismissActions = 0;
  let rounds = 0;
  let idleStreak = 0;
  const hitLog = [];
  const preBudget = Math.min(4e3, Math.max(600, Math.floor(timeoutMs * 0.45)));
  const pre = await waitForWebPopupReady(page, preBudget);
  if (pre.reason === "blocking") hitLog.push(`pre:${pre.id ?? "blocker"}`);
  else if (pre.reason === "idle") hitLog.push("pre:idle");
  while (Date.now() < deadline && rounds < attempts) {
    rounds += 1;
    let roundOk = false;
    for (let i = 0; i < DOM_SCAN_BURST; i++) {
      if (Date.now() >= deadline) break;
      const dom = await tryDomDismiss(page);
      if (!dom) break;
      roundOk = true;
      hitLog.push(`dom:${dom.via ?? "scan"}:${String(dom.text ?? dom.tag ?? "?").slice(0, 40)}`);
      await sleep2(page, DISMISS_HIT_SLEEP_MS);
      break;
    }
    if (!roundOk) {
      const loc = await tryLocatorDismiss(page, payload, waitMs);
      if (loc) {
        roundOk = true;
        hitLog.push(`locator:${JSON.stringify(loc).slice(0, 72)}`);
        await sleep2(page, DISMISS_HIT_SLEEP_MS);
      }
    }
    if (roundOk) {
      dismissActions += 1;
      idleStreak = 0;
    } else {
      idleStreak += 1;
      if (idleStreak >= 2) break;
    }
    if (Date.now() >= deadline) break;
    await sleep2(page, DISMISS_ROUND_SLEEP_MS);
  }
  const endedAt = Date.now();
  const dismissed = dismissActions > 0;
  const timedOut = endedAt >= deadline;
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "playwright",
      command: command.command,
      action: "dismissPopups",
      businessCode: dismissed ? "POPUP_DISMISSED" : timedOut ? "POPUP_DISMISS_TIMEOUT" : "POPUP_NOT_FOUND",
      dismissed,
      reason: dismissed ? "dismissed" : timedOut ? "timed_out" : "no_popup",
      dismissActions,
      rounds,
      timedOut,
      elapsedMs: endedAt - started,
      timeoutMs,
      hits: hitLog
    }
  };
}

// ../../plugins/driver-playwright/src/index.ts
var sessions = /* @__PURE__ */ new Map();
var localRequire = (0, import_node_module.createRequire)(typeof __filename === "string" ? __filename : process.cwd());
var SEMANTIC_COMMANDS = [
  "click",
  "type",
  "assertVisible",
  "screenshot",
  "navigate",
  "hover",
  "press",
  "select",
  "scroll",
  "forward",
  "newTab",
  "switchTab",
  "uploadFile",
  "dragDrop",
  "wait",
  "assertText",
  "getText",
  "back",
  "reload",
  "closeTab",
  "custom",
  "recipe"
];
async function loadPlaywrightModule() {
  const cwd = process.cwd();
  const candidates = [
    import_node_path2.default.join(cwd, "..", "package.json"),
    import_node_path2.default.join(cwd, "package.json"),
    typeof __filename === "string" ? __filename : void 0
  ].filter((x) => Boolean(x));
  for (const base of candidates) {
    try {
      const req = (0, import_node_module.createRequire)(base);
      return req("playwright");
    } catch {
    }
  }
  try {
    return localRequire("playwright");
  } catch {
  }
  return await new Function('return import("playwright")')();
}
function asRecord6(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function parseHeadless(payload) {
  return resolvePlaywrightHeadless(payload);
}
function shouldForceMaximize(payload) {
  const p = asRecord6(payload);
  const options = asRecord6(p.options);
  const direct = p.maximize;
  const fromOptions = options.maximize;
  if (typeof direct === "boolean") return direct;
  if (typeof fromOptions === "boolean") return fromOptions;
  const state = String(p.windowState ?? options.windowState ?? "").toLowerCase();
  return state === "maximized";
}
function shouldCreateCdpContext(contextOptions) {
  const keys = Object.keys(contextOptions);
  if (keys.length === 0) return false;
  if (keys.length === 1 && "viewport" in contextOptions && contextOptions.viewport === null) {
    return false;
  }
  return true;
}
async function forceMaximizeWindowIfNeeded(pw, payload) {
  if (pw.headless || pw.browserKind !== "chromium" || !shouldForceMaximize(payload)) {
    return;
  }
  try {
    const cdp = await pw.context.newCDPSession(pw.page);
    const info = await cdp.send("Browser.getWindowForTarget");
    const windowId = Number(info.windowId ?? 0);
    if (windowId > 0) {
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "maximized" } });
    }
    if (typeof cdp.detach === "function") {
      await cdp.detach().catch(() => void 0);
    }
  } catch {
  }
}
async function focusVisibleBrowser(pw, payload) {
  if (pw.headless || !resolvePlaywrightBringToFront(payload)) {
    return;
  }
  const bringOnce = async () => {
    await pw.page.bringToFront().catch(() => void 0);
    try {
      const browser = pw.browser ?? (typeof pw.context?.browser === "function" ? pw.context.browser() : null);
      if (browser && typeof browser.bringToFront === "function") {
        await browser.bringToFront();
      }
    } catch {
    }
    await pw.page.evaluate(() => window.focus()).catch(() => void 0);
  };
  await bringOnce();
  if (process.platform === "win32") {
    await sleepMs(200);
    await bringOnce();
  }
}
function defaultCdpPortForPayload(payload) {
  return defaultCdpPort(resolveCdpBrowserFamily(payload));
}
function parseBrowserKind(payload) {
  const merged = mergeOptionsIntoPayload(payload);
  const raw = (getString2(merged.browser) ?? process.env.ADA_PLAYWRIGHT_BROWSER ?? "chromium").toLowerCase();
  if (raw === "firefox" || raw === "webkit") {
    return raw;
  }
  return "chromium";
}
async function resolveStorageState(payload) {
  const merged = mergeOptionsIntoPayload(payload);
  const pathStr = getString2(merged.storageStatePath);
  if (pathStr) {
    const raw = await import_promises.default.readFile(pathStr, "utf8");
    return JSON.parse(raw);
  }
  if (merged.storageState !== void 0) {
    return merged.storageState;
  }
  return void 0;
}
var CLOSE_SESSION_MS = Number(process.env.ADA_PLAYWRIGHT_CLOSE_TIMEOUT_MS ?? 15e3);
var forceShutdown = false;
function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function forceKillPlaywrightProcessDetached(pw) {
  try {
    const browser = pw.browser ?? (typeof pw.context?.browser === "function" ? pw.context.browser() : null);
    const proc = browser && typeof browser.process === "function" ? browser.process() : void 0;
    if (proc?.pid) {
      forceKillProcessTreeDetached(proc.pid);
    }
  } catch {
  }
  if (pw.cdpSpawn?.pid) {
    forceKillProcessTreeDetached(pw.cdpSpawn.pid);
    pw.cdpSpawn = null;
  }
}
async function closePlaywrightSessionBody(pw) {
  if (pw.connectedOverCdp) {
    const connected = pw.browser && typeof pw.browser.isConnected === "function" ? pw.browser.isConnected() : true;
    if (!connected) {
      if (pw.cdpSpawn) {
        await stopCdpSpawn(pw.cdpSpawn);
        pw.cdpSpawn = null;
      }
      return;
    }
    await pw.browser?.close().catch(() => void 0);
    if (pw.cdpSpawn) {
      await stopCdpSpawn(pw.cdpSpawn);
      pw.cdpSpawn = null;
    }
    return;
  }
  await pw.context.close().catch(() => void 0);
  if (!pw.persistent && pw.browser) {
    await pw.browser.close().catch(() => void 0);
  }
}
async function closePlaywrightSession(pw) {
  if (forceShutdown) {
    forceKillPlaywrightProcessDetached(pw);
    return;
  }
  try {
    await Promise.race([
      closePlaywrightSessionBody(pw),
      sleepMs(CLOSE_SESSION_MS).then(() => {
        throw new Error(`PLAYWRIGHT_CLOSE_TIMEOUT after ${CLOSE_SESSION_MS}ms`);
      })
    ]);
  } catch {
    forceKillPlaywrightProcessDetached(pw);
  }
}
async function releasePlaywrightDriverSession(driverSessionId) {
  const pw = sessions.get(driverSessionId);
  if (!pw) {
    return;
  }
  sessions.delete(driverSessionId);
  await closePlaywrightSession(pw);
}
function isRecoverableInteractionError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|locator|not found|not visible|not enabled|strict mode violation|intercepts pointer events/i.test(
    message
  );
}
function applyLocalLaunchOverrides(baseLaunch, local, browserKind) {
  if (local.executablePath) {
    baseLaunch.executablePath = local.executablePath;
  }
  if (local.channel && browserKind === "chromium") {
    baseLaunch.channel = local.channel;
  }
}
async function createPlaywrightSession(playwrightModule, payload) {
  const merged = mergeOptionsIntoPayload(payload);
  const local = resolveLocalBrowserFields(merged);
  const browserKind = parseBrowserKind(merged);
  const headless = parseHeadless(merged);
  const launchOptions = asRecord6(merged.launchOptions);
  const contextOptions = { ...asRecord6(merged.contextOptions) };
  const storageState = await resolveStorageState(merged);
  if (storageState !== void 0) {
    contextOptions.storageState = storageState;
  }
  const sessionKey = buildSessionKey(merged);
  const localBrowser = {
    cdpEndpoint: local.cdpEndpoint || void 0,
    executablePath: local.executablePath || void 0,
    channel: local.channel || void 0,
    userDataDir: local.userDataDir || void 0
  };
  const cdpPlan = resolveCdpAutoLaunchPlan(merged);
  let cdpUrl = local.cdpEndpoint ? parseCdpEndpoint(local.cdpEndpoint, defaultCdpPortForPayload(merged)).url : "";
  let cdpSpawn = null;
  try {
    if (cdpPlan) {
      const ready = await ensureCdpEndpointReady(cdpPlan);
      cdpUrl = ready.url;
      cdpSpawn = ready.spawned;
    } else if (cdpUrl) {
      if (!await probeCdpEndpoint(cdpUrl)) {
        throw new Error(
          `CDP endpoint not reachable at ${cdpUrl}. Set cdpAutoLaunch=true to start ${resolveCdpBrowserFamily(merged)} automatically`
        );
      }
    }
    if (cdpUrl) {
      const chromium = playwrightModule.chromium;
      if (!chromium?.connectOverCDP) {
        throw new Error("connectOverCDP requires playwright chromium module (Chrome/Edge/Firefox CDP)");
      }
      const connectOptions = asRecord6(merged.connectOptions);
      const browser2 = await chromium.connectOverCDP(cdpUrl, connectOptions);
      const contexts = browser2.contexts();
      const createNewContext = shouldCreateCdpContext(contextOptions);
      const context2 = createNewContext ? await browser2.newContext(contextOptions) : contexts[0] ?? await browser2.newContext(contextOptions);
      const pages = context2.pages();
      const page2 = pages[0] ?? await context2.newPage();
      const cdpBrowser = cdpPlan?.browser ?? resolveCdpBrowserFamily(merged);
      const reportedKind = cdpBrowser === "firefox" ? "firefox" : "chromium";
      return {
        browser: browser2,
        context: context2,
        page: page2,
        headless,
        browserKind: reportedKind,
        persistent: false,
        connectedOverCdp: true,
        sessionKey,
        launchPayload: merged,
        playwrightModule,
        cdpSpawn,
        localBrowser: {
          ...localBrowser,
          cdpEndpoint: cdpUrl,
          cdpAutoLaunch: cdpPlan?.autoLaunch ?? false
        }
      };
    }
    const userDataDir = local.userDataDir;
    const launcher = playwrightModule[browserKind];
    const baseLaunch = { headless, ...launchOptions };
    applyLocalLaunchOverrides(baseLaunch, local, browserKind);
    if (userDataDir) {
      if (!launcher?.launchPersistentContext) {
        throw new Error(`launchPersistentContext not available for ${browserKind}`);
      }
      const context2 = await launcher.launchPersistentContext(userDataDir, {
        ...baseLaunch,
        ...contextOptions
      });
      const pages = context2.pages();
      const page2 = pages[0] ?? await context2.newPage();
      return {
        browser: typeof context2.browser === "function" ? context2.browser() : null,
        context: context2,
        page: page2,
        headless,
        browserKind,
        persistent: true,
        connectedOverCdp: false,
        sessionKey,
        launchPayload: merged,
        playwrightModule,
        localBrowser
      };
    }
    if (!launcher?.launch) {
      throw new Error(`playwright browser not available: ${browserKind}`);
    }
    const browser = await launcher.launch(baseLaunch);
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    return {
      browser,
      context,
      page,
      headless,
      browserKind,
      persistent: false,
      connectedOverCdp: false,
      sessionKey,
      launchPayload: merged,
      playwrightModule,
      localBrowser
    };
  } catch (error) {
    if (cdpSpawn) {
      await stopCdpSpawn(cdpSpawn).catch(() => void 0);
    }
    throw error;
  }
}
function mergeWithLaunchDefaults(pw, payload) {
  return mergeOptionsIntoPayload({ ...pw.launchPayload, ...payload });
}
async function ensurePlaywrightSession(session, payload) {
  const existed = sessions.get(session.id);
  if (existed) {
    return existed;
  }
  const merged = mergeOptionsIntoPayload(payload);
  const sessionKey = buildSessionKey(merged);
  const playwrightModule = await loadPlaywrightModule();
  try {
    const pwSession = await createPlaywrightSession(playwrightModule, merged);
    sessions.set(session.id, pwSession);
    await forceMaximizeWindowIfNeeded(pwSession, merged);
    await focusVisibleBrowser(pwSession, merged);
    return pwSession;
  } catch (error) {
    sessions.delete(session.id);
    throw error;
  }
}
function resolvePlaywrightTarget(pw, invoke) {
  const target = (invoke.target ?? "page").toLowerCase();
  if (target === "page") {
    return pw.page;
  }
  if (target === "context") {
    return pw.context;
  }
  if (target === "browser") {
    if (!pw.browser) {
      throw new Error("browser handle not available (persistent context may expose null browser)");
    }
    return pw.browser;
  }
  if (target === "playwright") {
    return pw.playwrightModule;
  }
  if (target === "locator") {
    const locator = locatorFromPayload(pw.page, { locator: invoke.locator });
    if (!locator) {
      throw new Error("invoke target=locator requires payload.locator");
    }
    return locator;
  }
  throw new Error(`unsupported invoke target: ${target}`);
}
async function executePlaywrightInvoke(command, pw, payload) {
  const invoke = normalizeInvokePayload(payload, "method");
  if (!invoke?.method) {
    return {
      requestId: command.requestId,
      success: false,
      errorCode: "INVOKE_INVALID_PAYLOAD",
      errorMessage: "invoke requires payload.method (and optional target, args)"
    };
  }
  const target = resolvePlaywrightTarget(pw, invoke);
  const fn = target[invoke.method];
  if (typeof fn !== "function") {
    return {
      requestId: command.requestId,
      success: false,
      errorCode: "INVOKE_METHOD_NOT_FOUND",
      errorMessage: `Method not found: ${invoke.target ?? "page"}.${invoke.method}`
    };
  }
  const args = Array.isArray(invoke.args) ? invoke.args : [];
  const result = await fn.apply(target, args);
  if (invoke.target === "context" && invoke.method === "newPage" && result) {
    pw.page = result;
  }
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "playwright",
      command: "invoke",
      mode: "real",
      rpcMode: "method",
      target: invoke.target ?? "page",
      method: invoke.method,
      value: serializeRpcResult(result),
      browser: pw.browserKind,
      headless: pw.headless,
      connectedOverCdp: pw.connectedOverCdp,
      localBrowser: pw.localBrowser
    }
  };
}
async function runMock(command, reason) {
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "playwright",
      command: command.command,
      mode: "mock",
      reason: reason ?? "fallback",
      message: "Mock web command executed"
    }
  };
}
function failResult2(command, code, message, data) {
  return {
    requestId: command.requestId,
    success: false,
    errorCode: code,
    errorMessage: message,
    ...data ? { data } : {}
  };
}
var LOCATOR_FORMAT_HINT = 'Use payload.locator.css, payload.selector, or locator: { kind: "css", value: "#id" } (strategy aliases kind).';
async function enrichFailureData(page, data) {
  if (!page || typeof page !== "object") {
    return data;
  }
  const p = page;
  const base = { ...data ?? {} };
  try {
    if (typeof p.url === "function") {
      base.url = p.url();
    }
    if (typeof p.title === "function") {
      base.title = await p.title().catch(() => void 0);
    }
    if (typeof p.evaluate === "function") {
      const preview = await p.evaluate(() => {
        const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
        return text.slice(0, 800);
      }).catch(() => void 0);
      if (typeof preview === "string" && preview.length > 0) {
        base.pageTextPreview = preview;
      }
    }
  } catch {
  }
  return Object.keys(base).length > 0 ? base : void 0;
}
async function failWithPage(command, page, code, message, data) {
  const enriched = await enrichFailureData(page, data);
  return failResult2(command, code, message, enriched);
}
function getNumber3(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function isTypeClearOp(payload) {
  if (!payload) return false;
  return payload.inputOp === "clear" || payload.webInputOp === "clear";
}
function getStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string");
}
var playwrightPlugin = {
  manifest: {
    id: "driver-playwright",
    version: "0.1.0",
    engine: "playwright",
    platforms: ["web"],
    capabilities: [...SEMANTIC_COMMANDS, "invoke"],
    semanticCommands: [...SEMANTIC_COMMANDS],
    invoke: {
      modes: ["method"],
      targets: ["page", "context", "browser", "playwright", "locator"]
    },
    viewCapabilities: ["observeSnapshot", "resolveLocator"]
  },
  async init() {
  },
  async createSession(platform) {
    return { id: `pw-${Date.now()}`, platform };
  },
  async execute(session, command) {
    const cmd = command.command;
    const payload = command.payload;
    const forceMock = Boolean(payload?.mock);
    if (forceMock) {
      return runMock(command, "payload.mock=true");
    }
    if (cmd === "invoke") {
      try {
        const pw = await ensurePlaywrightSession(session, payload);
        await focusVisibleBrowser(pw, payload);
        return await executePlaywrightInvoke(command, pw, payload);
      } catch (error) {
        if (!isRecoverableInteractionError(error)) {
          await releasePlaywrightDriverSession(session.id);
        }
        return failResult2(command, "INVOKE_FAILED", error instanceof Error ? error.message : String(error));
      }
    }
    try {
      const pw = await ensurePlaywrightSession(session, payload);
      const effective = mergeWithLaunchDefaults(pw, payload);
      await focusVisibleBrowser(pw, effective);
      const page = pw.page;
      const url = getString2(effective?.url);
      const locator = locatorFromPayload(page, effective);
      const waitMs = resolveAutoWaitMs(effective);
      if (cmd === "navigate") {
        if (!url) {
          return failResult2(command, "INVALID_PAYLOAD", "navigate requires url");
        }
        await gotoPage(page, url, effective);
        await focusVisibleBrowser(pw, effective);
      } else if (command.command === "click") {
        if (!locator) {
          return await failWithPage(command, page, "LOCATOR_NOT_FOUND", `click requires locator. ${LOCATOR_FORMAT_HINT}`, {
            locatorUsed: summarizeLocator(effective?.locator ?? effective?.selector),
            locatorHint: LOCATOR_FORMAT_HINT
          });
        }
        await autoWaitEnabled(locator, waitMs);
        const beforeClickUrl = page.url();
        await locator.click({ timeout: waitMs });
        await waitAfterNavigation(page, effective, beforeClickUrl);
      } else if (command.command === "hover") {
        if (!locator) {
          return await failWithPage(command, page, "LOCATOR_NOT_FOUND", `hover requires locator. ${LOCATOR_FORMAT_HINT}`, {
            locatorUsed: summarizeLocator(effective?.locator ?? effective?.selector),
            locatorHint: LOCATOR_FORMAT_HINT
          });
        }
        await autoWaitEnabled(locator, waitMs);
        await locator.hover({ timeout: waitMs });
      } else if (command.command === "type") {
        if (!locator) {
          return await failWithPage(command, page, "LOCATOR_NOT_FOUND", `type requires locator. ${LOCATOR_FORMAT_HINT}`, {
            locatorUsed: summarizeLocator(effective?.locator ?? effective?.selector),
            locatorHint: LOCATOR_FORMAT_HINT
          });
        }
        await autoWaitEnabled(locator, waitMs);
        if (isTypeClearOp(payload)) {
          await locator.clear({ timeout: waitMs });
        } else {
          const text = getString2(payload?.text) ?? "";
          await locator.fill(text, { timeout: waitMs });
        }
      } else if (command.command === "press") {
        const key = getString2(payload?.key);
        if (!key) {
          return failResult2(command, "INVALID_PAYLOAD", "press requires key");
        }
        if (locator) {
          await locator.press(key);
        } else {
          await page.keyboard.press(key);
        }
      } else if (command.command === "select") {
        if (!locator) {
          return failResult2(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const value = getString2(payload?.value);
        const label = getString2(payload?.label);
        const index = getNumber3(payload?.index);
        if (value) {
          await locator.selectOption({ value });
        } else if (label) {
          await locator.selectOption({ label });
        } else if (typeof index === "number") {
          await locator.selectOption({ index });
        } else {
          return failResult2(command, "INVALID_PAYLOAD", "select requires value, label, or index");
        }
      } else if (command.command === "scroll") {
        const deltaX = getNumber3(payload?.deltaX) ?? 0;
        const deltaY = getNumber3(payload?.deltaY) ?? 500;
        if (locator) {
          await locator.scrollIntoViewIfNeeded();
        }
        await page.mouse.wheel(deltaX, deltaY);
      } else if (command.command === "forward") {
        await page.goForward().catch(() => null);
      } else if (command.command === "newTab") {
        const newPage = await pw.context.newPage();
        pw.page = newPage;
        if (url) {
          await gotoPage(newPage, url, effective);
        }
        await focusVisibleBrowser(pw, effective);
      } else if (command.command === "switchTab") {
        const pages = pw.context.pages();
        const tabIndex = getNumber3(payload?.tabIndex) ?? 0;
        const safeIndex = Math.max(0, Math.min(pages.length - 1, tabIndex));
        const selected = pages[safeIndex];
        if (!selected) {
          return failResult2(command, "TAB_NOT_FOUND", `No tab found at index ${tabIndex}`);
        }
        pw.page = selected;
        await focusVisibleBrowser(pw, effective);
      } else if (command.command === "uploadFile") {
        if (!locator) {
          return failResult2(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const filePath = getString2(payload?.filePath);
        const filePaths = getStringArray(payload?.filePaths);
        const targetPaths = filePaths.length > 0 ? filePaths : filePath ? [filePath] : [];
        if (targetPaths.length === 0) {
          return failResult2(command, "INVALID_PAYLOAD", "uploadFile requires filePath or filePaths");
        }
        await locator.setInputFiles(targetPaths);
      } else if (command.command === "dragDrop") {
        const sourceLocatorObj = asRecord6(payload?.sourceLocator ?? payload?.fromLocator);
        const targetLocatorObj = asRecord6(payload?.targetLocator ?? payload?.toLocator);
        const source = Object.keys(sourceLocatorObj).length > 0 ? locatorFromPayload(page, { locator: sourceLocatorObj }) : locator;
        const target = Object.keys(targetLocatorObj).length > 0 ? locatorFromPayload(page, { locator: targetLocatorObj }) : void 0;
        if (!source || !target) {
          return failResult2(command, "LOCATOR_NOT_FOUND", "dragDrop requires source and target locator");
        }
        await source.dragTo(target);
      } else if (command.command === "wait") {
        const timeoutMs = getNumber3(payload?.timeoutMs) ?? 300;
        await page.waitForTimeout(timeoutMs);
      } else if (command.command === "back") {
        await page.goBack().catch(() => null);
      } else if (command.command === "reload") {
        await page.reload();
      } else if (command.command === "closeTab") {
        await page.close();
        pw.page = await pw.context.newPage();
      } else if (command.command === "assertVisible") {
        if (!locator) {
          return failResult2(command, "LOCATOR_NOT_FOUND", "assertVisible requires locator", {
            locatorUsed: summarizeLocator(payload?.locator)
          });
        }
        try {
          await autoWaitLocator(locator, waitMs);
        } catch {
          return failResult2(command, "ASSERT_NOT_VISIBLE", "Target element is not visible.", {
            assertionDiff: {
              type: "visible",
              expected: true,
              actual: false,
              locatorUsed: summarizeLocator(payload?.locator)
            }
          });
        }
      } else if (command.command === "assertText") {
        if (!locator) {
          return failResult2(command, "LOCATOR_NOT_FOUND", "assertText requires locator", {
            locatorUsed: summarizeLocator(payload?.locator)
          });
        }
        const expected = getString2(payload?.expectedText);
        if (!expected) {
          return failResult2(command, "INVALID_PAYLOAD", "assertText requires expectedText");
        }
        try {
          await autoWaitLocator(locator, waitMs);
        } catch {
          return failResult2(command, "ASSERT_NOT_VISIBLE", "Target element is not visible before text assert.", {
            assertionDiff: {
              type: "text",
              expected,
              actual: null,
              locatorUsed: summarizeLocator(payload?.locator)
            }
          });
        }
        const actual = await locator.textContent() ?? "";
        if (!actual.includes(expected)) {
          return failResult2(command, "ASSERT_TEXT_MISMATCH", `Expected text to include "${expected}", got "${actual}"`, {
            assertionDiff: {
              type: "text",
              expected,
              actual,
              locatorUsed: summarizeLocator(payload?.locator)
            }
          });
        }
      } else if (command.command === "getText") {
        if (!locator) {
          return failResult2(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const text = await locator.textContent() ?? "";
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "playwright", command: command.command, mode: "real", text, headless: pw.headless, browser: pw.browserKind }
        };
      } else if (command.command === "screenshot") {
        const customPath = getString2(payload?.screenshotPath);
        const dir = import_node_path2.default.join(process.cwd(), "artifacts");
        await import_promises.default.mkdir(dir, { recursive: true });
        const target = customPath ? import_node_path2.default.resolve(customPath) : import_node_path2.default.join(dir, `${command.requestId}.png`);
        if (customPath) {
          await import_promises.default.mkdir(import_node_path2.default.dirname(target), { recursive: true });
        }
        const fullPage = typeof payload?.fullPage === "boolean" ? payload.fullPage : false;
        await page.screenshot({ path: target, fullPage });
        return {
          requestId: command.requestId,
          success: true,
          data: {
            driver: "playwright",
            command: command.command,
            screenshot: target,
            fullPage,
            headless: pw.headless,
            browser: pw.browserKind
          }
        };
      } else if (command.command === "recipe") {
        const action = getString2(payload?.action)?.toLowerCase();
        if (action === "clickpath") {
          return executeClickPath(command, page, payload);
        }
        if (action === "fill_search" || action === "fillsearch") {
          return executeFillSearch(command, page, payload);
        }
        return failResult2(
          command,
          "UNSUPPORTED_COMMAND",
          `unsupported web recipe action: ${action ?? "(missing)"}; supported: clickPath, fill_search`
        );
      } else if (command.command === "custom") {
        const action = getString2(payload?.action)?.toLowerCase();
        if (action === "invoke" || payload?.method && !action) {
          return executePlaywrightInvoke(command, pw, payload);
        }
        if (action === "evaluate") {
          const script = getString2(payload?.script);
          if (!script) {
            return failResult2(command, "INVALID_PAYLOAD", "evaluate requires script");
          }
          const value = await page.evaluate(script);
          return {
            requestId: command.requestId,
            success: true,
            data: {
              driver: "playwright",
              command: command.command,
              mode: "real",
              action: "evaluate",
              value: serializeRpcResult(value),
              headless: pw.headless,
              browser: pw.browserKind
            }
          };
        }
        if (action === "dismisspopups" || action === "dismiss_popups") {
          return executeDismissPopups(command, page, effective);
        }
        return failResult2(
          command,
          "UNSUPPORTED_COMMAND",
          "unsupported custom action; use action=evaluate|invoke or command=invoke"
        );
      } else {
        return failResult2(command, "UNSUPPORTED_COMMAND", `unsupported command: ${cmd}`);
      }
      return {
        requestId: command.requestId,
        success: true,
        data: {
          driver: "playwright",
          command: command.command,
          mode: "real",
          headless: pw.headless,
          browser: pw.browserKind,
          connectedOverCdp: pw.connectedOverCdp,
          localBrowser: pw.localBrowser
        }
      };
    } catch (error) {
      if (!isRecoverableInteractionError(error)) {
        await releasePlaywrightDriverSession(session.id);
      }
      const pw = sessions.get(session.id);
      return await failWithPage(
        command,
        pw?.page,
        "COMMAND_FAILED",
        error instanceof Error ? error.message : String(error),
        { locatorUsed: summarizeLocator(payload?.locator ?? payload?.selector) }
      );
    }
  },
  async destroySession(session) {
    const existed = sessions.get(session.id);
    if (!existed) {
      return;
    }
    await closePlaywrightSession(existed);
    sessions.delete(session.id);
  },
  async dispose() {
    for (const [, pw] of sessions) {
      await closePlaywrightSession(pw);
    }
    sessions.clear();
  },
  forceDispose() {
    forceShutdown = true;
    for (const [, pw] of sessions) {
      forceKillPlaywrightProcessDetached(pw);
    }
    sessions.clear();
    cleanupAllCdpSpawnsDetached();
  }
};
var index_default = playwrightPlugin;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  executeClickPath,
  executeFillSearch,
  locatorFromPayload,
  observeViewOnPage,
  summarizeLocator
});
