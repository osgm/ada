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

// ../../plugins/driver-harmony/src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);

// ../../packages/driver-rpc/src/command-timeout.ts
var DEFAULT_COMMAND_TIMEOUT_MS = 3e4;
var CommandTimeoutError = class extends Error {
  name = "CommandTimeoutError";
  constructor(message) {
    super(message);
  }
};
function resolveCommandTimeoutMs(payload) {
  const p = payload ?? {};
  const options = typeof p.options === "object" && p.options !== null ? p.options : {};
  const fromPayload = typeof p.commandTimeoutMs === "number" ? p.commandTimeoutMs : typeof options.commandTimeoutMs === "number" ? options.commandTimeoutMs : void 0;
  if (typeof fromPayload === "number" && fromPayload > 0) {
    return fromPayload;
  }
  const env = process.env.ADA_COMMAND_TIMEOUT_MS;
  if (env?.trim()) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return DEFAULT_COMMAND_TIMEOUT_MS;
}
function resolveLocatorTimeoutMs(payload, options) {
  const p = payload ?? {};
  const defaultMs = options?.defaultMs ?? 4e3;
  const maxMs = options?.maxMs ?? 8e3;
  const explicit = typeof p.locatorTimeoutMs === "number" ? p.locatorTimeoutMs : typeof p.timeoutMs === "number" && p.timeoutMs > 0 ? p.timeoutMs : defaultMs;
  return Math.min(Math.max(500, explicit), maxMs);
}
function resolveSubOperationTimeoutMs(commandTimeoutMs, fallbackMs, ratio = 0.5) {
  const scaled = Math.floor(commandTimeoutMs * ratio);
  return Math.min(commandTimeoutMs - 500, Math.max(fallbackMs, scaled));
}
function raceCommandTimeout(work, timeoutMs, label = "command") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CommandTimeoutError(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

// ../../packages/driver-rpc/src/optional-ui.ts
var UI_ELEMENT_NOT_FOUND = "UI_ELEMENT_NOT_FOUND";
var HYPIUM_OPTIONAL_PROBE_NOISE = /RpcClient|Fail to resolve object|RPC exception|\[Device\]|\[Analysis\]|\[RemoteObject\]/i;
function isHypiumProbeNoise(text) {
  return HYPIUM_OPTIONAL_PROBE_NOISE.test(text);
}
function suppressHypiumOptionalProbeLogs() {
  const origError = console.error;
  const origLog = console.log;
  const origTrace = console.trace;
  const filter = (orig) => (...args) => {
    const text = args.map(String).join(" ");
    if (isHypiumProbeNoise(text)) return;
    orig.apply(console, args);
  };
  console.error = filter(origError);
  console.log = filter(origLog);
  console.trace = () => {
  };
  return () => {
    console.error = origError;
    console.log = origLog;
    console.trace = origTrace;
  };
}
async function withSuppressedHypiumProbeLogs(fn) {
  const restore = suppressHypiumOptionalProbeLogs();
  try {
    return await fn();
  } finally {
    restore();
  }
}
function isOptionalUiPayload(payload) {
  const p = payload ?? {};
  return p.optional === true || p.bestEffort === true;
}
function buildOptionalUiMissResult(command, message, extra) {
  return {
    requestId: command.requestId,
    success: false,
    errorCode: UI_ELEMENT_NOT_FOUND,
    errorMessage: message,
    data: {
      businessCode: "LOCATOR_NOT_FOUND",
      optional: true,
      command: command.command,
      ...extra
    }
  };
}

// ../../packages/driver-rpc/src/swipe-coords.ts
function normalizedSwipePoints(screen, from, to, options = {}) {
  if (options.relative === true) {
    const norm = (p) => [
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
function harmonySwipePixels(screen, from, to, durationMs, options = {}) {
  const px = normalizedSwipePoints(screen, from, to, options);
  return {
    ...px,
    durationMs: Math.max(50, Math.round(durationMs))
  };
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

// ../../packages/mobile-ui/src/heuristics-config.ts
var DEFAULT_UI_HEURISTICS = {
  searchEntryLabels: ["search", "query", "find", "\u641C\u7D22"],
  searchInputLabels: ["search", "query", "type", "enter", "input", "hint", "\u641C\u7D22", "\u8BF7\u8F93\u5165", "\u8F93\u5165"],
  homeTabLabels: ["home", "main", "index"],
  inputTypePattern: "TextInput|TextField|TextArea|Search|Edit",
  topRegionRatio: 0.3,
  inputRegionRatio: 0.38,
  bottomTabMinRatio: 0.72,
  minEntryWidthRatio: 0.2,
  minInputWidthRatio: 0.15
};
function toRegex(parts, fallback) {
  const list = (parts?.length ? parts : fallback).map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return /^$/i;
  return new RegExp(list.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
}
function resolveUiHeuristicsConfig(overrides) {
  const base = { ...DEFAULT_UI_HEURISTICS, ...overrides };
  return {
    topRegionRatio: base.topRegionRatio ?? DEFAULT_UI_HEURISTICS.topRegionRatio,
    inputRegionRatio: base.inputRegionRatio ?? DEFAULT_UI_HEURISTICS.inputRegionRatio,
    bottomTabMinRatio: base.bottomTabMinRatio ?? DEFAULT_UI_HEURISTICS.bottomTabMinRatio,
    minEntryWidthRatio: base.minEntryWidthRatio ?? DEFAULT_UI_HEURISTICS.minEntryWidthRatio,
    minInputWidthRatio: base.minInputWidthRatio ?? DEFAULT_UI_HEURISTICS.minInputWidthRatio,
    searchEntryRe: toRegex(base.searchEntryLabels, DEFAULT_UI_HEURISTICS.searchEntryLabels),
    searchInputRe: toRegex(base.searchInputLabels, DEFAULT_UI_HEURISTICS.searchInputLabels),
    homeTabRe: toRegex(base.homeTabLabels, DEFAULT_UI_HEURISTICS.homeTabLabels),
    inputTypeRe: new RegExp(base.inputTypePattern ?? DEFAULT_UI_HEURISTICS.inputTypePattern, "i")
  };
}
function uiHeuristicsFromEnv(env = process.env) {
  const json = env.ADA_UI_HEURISTICS_JSON?.trim();
  if (json) {
    try {
      return JSON.parse(json);
    } catch {
      return void 0;
    }
  }
  const split = (key) => env[key]?.split(",").map((s) => s.trim()).filter(Boolean);
  const searchEntryLabels = split("ADA_UI_SEARCH_ENTRY_LABELS");
  const searchInputLabels = split("ADA_UI_SEARCH_INPUT_LABELS");
  const homeTabLabels = split("ADA_UI_HOME_TAB_LABELS");
  if (!searchEntryLabels?.length && !searchInputLabels?.length && !homeTabLabels?.length) {
    return void 0;
  }
  return {
    ...searchEntryLabels?.length ? { searchEntryLabels } : {},
    ...searchInputLabels?.length ? { searchInputLabels } : {},
    ...homeTabLabels?.length ? { homeTabLabels } : {}
  };
}

// ../../packages/mobile-ui/src/bounds.ts
function parseBoundsString(bounds) {
  const m = String(bounds ?? "").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!m) return null;
  const x1 = Number(m[1]);
  const y1 = Number(m[2]);
  const x2 = Number(m[3]);
  const y2 = Number(m[4]);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return {
    x1,
    y1,
    x2,
    y2,
    w: x2 - x1,
    h: y2 - y1,
    cx: Math.round((x1 + x2) / 2),
    cy: Math.round((y1 + y2) / 2)
  };
}
function isTruthyAttr(v) {
  return v === true || String(v).toLowerCase() === "true";
}

// ../../packages/mobile-ui/src/harmony.ts
function walkHarmonyTree(node, out = []) {
  if (!node || typeof node !== "object") return out;
  const rec = node;
  const attrs = rec.attributes && typeof rec.attributes === "object" ? rec.attributes : rec;
  const bounds = parseBoundsString(String(attrs.bounds ?? ""));
  if (bounds) {
    out.push({
      text: String(attrs.text ?? ""),
      desc: String(attrs.description ?? ""),
      id: String(attrs.id ?? ""),
      type: String(attrs.type ?? ""),
      clickable: isTruthyAttr(attrs.clickable) || isTruthyAttr(attrs.longClickable),
      focused: isTruthyAttr(attrs.focused),
      point: [bounds.cx, bounds.cy],
      bounds: { x1: bounds.x1, y1: bounds.y1, x2: bounds.x2, y2: bounds.y2, w: bounds.w, h: bounds.h },
      raw: attrs
    });
  }
  for (const child of rec.children ?? []) {
    walkHarmonyTree(child, out);
  }
  return out;
}
function parseHarmonyLayoutJson(raw) {
  const tree = JSON.parse(raw);
  return walkHarmonyTree(tree);
}
function extractHarmonyDumpPath(shellOutput) {
  const out = String(shellOutput ?? "");
  const m = out.match(/saved to:\s*(\S+)/i) ?? out.match(/(\/data\/local\/tmp\/layout[^\s"'`]+\.json)/i) ?? out.match(/(layout[-\w]*\.json)/i);
  return m?.[1] ?? null;
}

// ../../packages/mobile-ui/src/heuristics.ts
function nodeLabel(n) {
  return `${n.text}${n.desc}${n.id}`.trim();
}
function pickNodeByTextHints(nodes, hints, role, screen) {
  if (!hints.length) return null;
  const topMaxY = role === "searchEntry" ? screen.height * 0.35 : screen.height * 0.45;
  const minW = screen.width * (role === "searchEntry" ? 0.08 : 0.12);
  for (const hint of hints) {
    const needle = hint.trim().toLowerCase();
    if (!needle) continue;
    const hits = nodes.map((n) => {
      const label = nodeLabel(n);
      if (!label.toLowerCase().includes(needle)) return null;
      const b = n.bounds;
      if (!b || n.point[1] > topMaxY || b.w < minW) return null;
      if (role === "searchEntry" && !n.clickable) return null;
      let score = b.w;
      if (n.focused) score += 800;
      if (n.text.toLowerCase() === needle) score += 400;
      return { n, label, score };
    }).filter(Boolean);
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
function pickSearchEntry(nodes, screen, cfg) {
  const topMaxY = screen.height * cfg.topRegionRatio;
  const minW = screen.width * cfg.minEntryWidthRatio;
  const candidates = nodes.map((n) => {
    const b = n.bounds;
    if (!b || n.point[1] > topMaxY || b.w < minW) return null;
    if (!n.clickable) return null;
    const label = nodeLabel(n);
    if (!cfg.searchEntryRe.test(label)) return null;
    return { n, label, score: b.w };
  }).filter(Boolean);
  candidates.sort((a, b) => b.score - a.score);
  const hit = candidates[0];
  if (!hit) return null;
  return { point: hit.n.point, label: hit.label, kind: "entry", score: hit.score };
}
function pickSearchInput(nodes, screen, cfg) {
  const topMaxY = screen.height * cfg.inputRegionRatio;
  const minW = screen.width * cfg.minInputWidthRatio;
  const candidates = nodes.map((n) => {
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
  }).filter(Boolean);
  candidates.sort((a, b) => b.score - a.score);
  const hit = candidates[0];
  if (!hit) return null;
  return { point: hit.n.point, label: hit.label, kind: "input", score: hit.score };
}
function pickHomeTab(nodes, screen, cfg) {
  const bottomMinY = screen.height * cfg.bottomTabMinRatio;
  const candidates = nodes.filter((n) => {
    const b = n.bounds;
    if (!b || n.point[1] < bottomMinY) return false;
    if (!n.clickable) return false;
    return cfg.homeTabRe.test(nodeLabel(n));
  }).map((n) => ({ n, label: nodeLabel(n), score: n.bounds?.w ?? 0 }));
  candidates.sort((a, b) => b.score - a.score);
  const hit = candidates[Math.floor(candidates.length / 2)] ?? candidates[0];
  if (!hit) return null;
  return { point: hit.n.point, label: hit.label, kind: "tab", score: hit.score };
}
function pickSearchEntryAndroid(nodes, screen, cfg) {
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
function findUiNode(nodes, options) {
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

// ../../packages/driver-rpc/src/fill-search-transition.ts
var FILL_SEARCH_DIRECT_INPUT_SETTLE_MS = 800;
var FILL_SEARCH_PAGE_TRANSITION_SETTLE_MS = 500;
var FILL_SEARCH_DEFAULT_SETTLE_MS = 400;
function resourceIdFromLabel(label) {
  const m = label.match(/([\w.]+:id\/\w+)/i);
  return (m?.[1] ?? label).toLowerCase();
}
function pickPointDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function detectFillSearchPageTransition(tapPick, afterPick, screen, beforeNodeCount = 0, afterNodeCount = 0) {
  if (tapPick?.point && afterPick?.point) {
    const threshold = Math.min(screen.width, screen.height) * 0.06;
    if (pickPointDistance(tapPick.point, afterPick.point) >= threshold) return true;
    const tapLabel = (tapPick.label ?? "").trim();
    const afterLabel = (afterPick.label ?? "").trim();
    if (tapLabel && afterLabel && tapLabel !== afterLabel) {
      if (resourceIdFromLabel(tapLabel) !== resourceIdFromLabel(afterLabel)) return true;
    }
  }
  if (beforeNodeCount > 0 && afterNodeCount > 0) {
    const ratio = afterNodeCount / beforeNodeCount;
    if (ratio < 0.55 || ratio > 1.75) return true;
  }
  return false;
}
function isDirectInputTapDetail(detail) {
  return typeof detail === "string" && detail.includes("direct input");
}
function resolveFillSearchSettleMs(tapDetail, userSettleMs) {
  if (typeof userSettleMs === "number" && userSettleMs > 0) return userSettleMs;
  return isDirectInputTapDetail(tapDetail) ? FILL_SEARCH_DIRECT_INPUT_SETTLE_MS : FILL_SEARCH_DEFAULT_SETTLE_MS;
}

// ../../packages/driver-rpc/src/recipe-errors.ts
var RECIPE_ERROR_CODES = {
  TAP_SEARCH_FAILED: "RECIPE_TAP_SEARCH_FAILED",
  FILL_SEARCH_FAILED: "RECIPE_FILL_SEARCH_FAILED",
  FILL_SEARCH_NO_ENTRY: "RECIPE_FILL_SEARCH_NO_ENTRY",
  FILL_SEARCH_NO_INPUT: "RECIPE_FILL_SEARCH_NO_INPUT",
  FILL_SEARCH_TYPE_FAILED: "RECIPE_FILL_SEARCH_TYPE_FAILED",
  DUMP_UI_FAILED: "RECIPE_DUMP_UI_FAILED",
  FILL_SEARCH_MISSING_TEXT: "RECIPE_FILL_SEARCH_MISSING_TEXT"
};
function recipeErrorCodeForAction(action, ok) {
  if (ok) return void 0;
  switch (action) {
    case "tap_search":
      return RECIPE_ERROR_CODES.TAP_SEARCH_FAILED;
    case "fill_search":
      return RECIPE_ERROR_CODES.FILL_SEARCH_FAILED;
    case "dump_ui":
      return RECIPE_ERROR_CODES.DUMP_UI_FAILED;
    default:
      return "RECIPE_FAILED";
  }
}
function platformRecipeErrorCode(platform, action) {
  const base = recipeErrorCodeForAction(action, false) ?? "RECIPE_FAILED";
  return `${platform.toUpperCase()}_${base}`;
}

// ../../packages/driver-rpc/src/smart-wait.ts
function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function smartWaitFromEnv(env = process.env) {
  const until = env.ADA_WAIT_UNTIL?.trim();
  return {
    ...until === "ui_stable" || until === "launch_settled" || until === "timeout" ? { until } : {},
    ...env.ADA_WAIT_UI_STABLE_MS ? { stableMs: Number(env.ADA_WAIT_UI_STABLE_MS) } : {},
    ...env.ADA_WAIT_POLL_MS ? { pollMs: Number(env.ADA_WAIT_POLL_MS) } : {},
    ...env.ADA_WAIT_MAX_MS ? { timeoutMs: Number(env.ADA_WAIT_MAX_MS) } : {}
  };
}
function parseSmartWaitFromPayload(payload) {
  const p = payload ?? {};
  const wait = typeof p.wait === "object" && p.wait !== null ? p.wait : void 0;
  const custom = typeof p.custom === "object" && p.custom !== null ? p.custom : void 0;
  const block = wait ?? custom?.wait;
  if (!block || typeof block !== "object") return null;
  const until = String(block.until ?? "").trim();
  if (until !== "timeout" && until !== "ui_stable" && until !== "launch_settled") return null;
  return {
    until,
    timeoutMs: numberOr(block.timeoutMs ?? block.maxMs, 15e3),
    stableMs: numberOr(block.stableMs, 600),
    pollMs: numberOr(block.pollMs, 400),
    stablePolls: numberOr(block.stablePolls, 3)
  };
}
function mergeSmartWait(...parts) {
  const merged = { until: "timeout", timeoutMs: 1e3, stableMs: 600, pollMs: 400, stablePolls: 3 };
  for (const p of parts) {
    if (!p) continue;
    Object.assign(merged, p);
  }
  return merged;
}
async function runSmartWait(reader, options) {
  if (options.until === "timeout" || !reader) {
    await new Promise((r) => setTimeout(r, options.timeoutMs ?? 1e3));
    return;
  }
  const deadline = Date.now() + (options.timeoutMs ?? 15e3);
  const pollMs = options.pollMs ?? 400;
  const stableMs = options.stableMs ?? 600;
  const needPolls = options.stablePolls ?? 3;
  if (options.until === "ui_stable") {
    let lastCount2 = -1;
    let stableSince = 0;
    while (Date.now() < deadline) {
      const nodes = await reader.dumpUi();
      const count = nodes.length;
      if (count > 0 && count === lastCount2) {
        if (stableSince === 0) stableSince = Date.now();
        if (Date.now() - stableSince >= stableMs) return;
      } else {
        lastCount2 = count;
        stableSince = 0;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return;
  }
  let lastCount = -1;
  let streak = 0;
  while (Date.now() < deadline) {
    const nodes = await reader.dumpUi();
    const count = nodes.length;
    if (count > 0 && count === lastCount) {
      streak += 1;
      if (streak >= needPolls) return;
    } else {
      lastCount = count;
      streak = count > 0 ? 1 : 0;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
async function recipeSettleDelay(reader, payload, fallbackMs = 600) {
  const fromPayload = parseSmartWaitFromPayload(payload);
  const fromEnv = smartWaitFromEnv();
  const opts = mergeSmartWait({ until: "timeout", timeoutMs: fallbackMs }, fromEnv, fromPayload);
  await runSmartWait(reader, opts);
}

// ../../packages/driver-rpc/src/mobile-recipes.ts
async function dumpWithRetry(ctx, retries = 1) {
  let nodes = await safeDumpUi(ctx);
  if (nodes.length === 0 && retries > 0) {
    await recipeSettleDelay(ctx, void 0, 800);
    nodes = await safeDumpUi(ctx);
  }
  return nodes;
}
async function safeDumpUi(ctx, retries = 1) {
  for (let i = 0; i <= retries; i += 1) {
    try {
      const nodes = await ctx.dumpUi();
      if (nodes.length > 0 || i === retries) return nodes;
    } catch {
      if (i === retries) return [];
    }
    await recipeSettleDelay(ctx, void 0, 350);
  }
  return [];
}
async function focusAndType(ctx, input, point, text, payload) {
  if (ctx.typeFocused) {
    if (input?.kind === "input") {
      ctx.invalidateDumpCache?.();
      await ctx.clickPoint(input.point);
      await recipeSettleDelay(ctx, payload, 350);
    }
    await ctx.typeFocused(text);
    return "typeFocused";
  }
  ctx.invalidateDumpCache?.();
  await ctx.typeAt(point, text);
  return "typeAt";
}
function fillSearchSuccess(point, text, tap, typeMode, extra = {}) {
  return {
    ok: true,
    phase: "fill_search",
    detail: `fill @ ${point.join(",")}`,
    data: { point, text, tap, typeMode, enterOk: extra.enterOk ?? false, ...extra }
  };
}
function mergedHeuristics(ctx, parsed) {
  if (!ctx.heuristics && !parsed.heuristics) return void 0;
  return { ...ctx.heuristics, ...parsed.heuristics };
}
function findRole(nodes, ctx, role, heuristics) {
  return findUiNode(nodes, {
    role,
    screen: ctx.screen,
    platform: ctx.platform === "ios" ? "android" : ctx.platform,
    heuristics: heuristics ?? ctx.heuristics
  });
}
function coordinateFallback(screen, kind) {
  const yRatio = kind === "entry" ? 0.11 : 0.12;
  return [Math.round(screen.width / 2), Math.round(screen.height * yRatio)];
}
async function tryHintChainFill(ctx, parsed, text, payload) {
  if (parsed.strict || !parsed.entryHints.length && !parsed.inputHints.length) return null;
  let nodes = await ctx.dumpUi();
  for (const hint of parsed.entryHints) {
    const entry = pickNodeByTextHints(nodes, [hint], "searchEntry", ctx.screen);
    if (entry) {
      ctx.invalidateDumpCache?.();
      await ctx.clickPoint(entry.point);
      await recipeSettleDelay(ctx, payload, 600);
      nodes = await ctx.dumpUi();
      break;
    }
  }
  const inputHints = parsed.inputHints.length ? parsed.inputHints : parsed.entryHints;
  for (const hint of inputHints) {
    const input = pickNodeByTextHints(nodes, [hint], "searchInput", ctx.screen);
    if (!input) continue;
    try {
      ctx.invalidateDumpCache?.();
      await ctx.clickPoint(input.point);
      await recipeSettleDelay(ctx, payload, 400);
      if (ctx.typeFocused) {
        await ctx.typeFocused(text);
      } else {
        await ctx.typeAt(input.point, text);
      }
      return {
        ok: true,
        phase: "fill_search",
        detail: `hint chain @ ${input.point.join(",")}`,
        data: { point: input.point, text, pick: input, mode: "textHintChain", hint }
      };
    } catch {
      continue;
    }
  }
  return null;
}
async function recipeDumpUi(ctx) {
  const nodes = await ctx.dumpUi();
  return { ok: true, phase: "dump_ui", detail: `nodes=${nodes.length}`, data: { nodeCount: nodes.length } };
}
async function recipeTapSearch(ctx, options) {
  const parsed = parseFillSearchPayload(options?.payload);
  const h = mergedHeuristics(ctx, parsed);
  const nodes = await dumpWithRetry(ctx);
  let input = findRole(nodes, ctx, "searchInput", h);
  if (input) {
    ctx.invalidateDumpCache?.();
    await ctx.clickPoint(input.point);
    return {
      ok: true,
      phase: "tap_search",
      detail: `direct input @ ${input.point.join(",")}`,
      data: { nodeCount: nodes.length, pick: input, mode: "heuristic", directInputTap: true }
    };
  }
  let entry = findRole(nodes, ctx, "searchEntry", h);
  let mode = "heuristic";
  if (!entry && parsed.entryHints.length && !parsed.strict) {
    entry = pickNodeByTextHints(nodes, parsed.entryHints, "searchEntry", ctx.screen);
    if (entry) mode = "textHint";
  }
  if (!entry) {
    if (parsed.strict) {
      return {
        ok: false,
        phase: "tap_search",
        errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_NO_ENTRY,
        detail: "search entry not found (strict)",
        data: { nodeCount: nodes.length, entryHints: parsed.entryHints }
      };
    }
    const fallback = coordinateFallback(ctx.screen, "entry");
    ctx.invalidateDumpCache?.();
    await ctx.clickPoint(fallback);
    return {
      ok: true,
      phase: "tap_search",
      detail: `fallback entry @ ${fallback.join(",")}`,
      data: { nodeCount: nodes.length, fallback: true, pick: { point: fallback, label: "fallback" }, mode: "coordinate" }
    };
  }
  ctx.invalidateDumpCache?.();
  await ctx.clickPoint(entry.point);
  await recipeSettleDelay(ctx, options?.payload, options?.settleMs ?? 800);
  const after = await ctx.dumpUi();
  input = findRole(after, ctx, "searchInput", h) ?? entry;
  return {
    ok: true,
    phase: "tap_search",
    detail: `tap entry @ ${entry.point.join(",")}`,
    data: { nodeCount: nodes.length, pick: entry, input, mode }
  };
}
async function recipeFillSearch(ctx, text, options) {
  if (!text) {
    return {
      ok: false,
      phase: "fill_search",
      errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_MISSING_TEXT,
      detail: "fill_search requires text"
    };
  }
  const parsed = parseFillSearchPayload(options?.payload);
  const h = mergedHeuristics(ctx, parsed);
  const mergedOpts = { ...options, ...parsed.recipeOptions, payload: options?.payload };
  const tap = await recipeTapSearch(ctx, mergedOpts);
  if (!tap.ok) {
    const chain = await tryHintChainFill(ctx, parsed, text, mergedOpts.payload);
    if (chain?.ok) {
      await recipeSettleDelay(ctx, mergedOpts.payload, 400);
      try {
        await ctx.pressEnter();
      } catch {
      }
      return chain;
    }
    return {
      ...tap,
      phase: "fill_search",
      errorCode: tap.errorCode ?? RECIPE_ERROR_CODES.FILL_SEARCH_NO_ENTRY
    };
  }
  const postTapSettleMs = typeof mergedOpts.settleMs === "number" && mergedOpts.settleMs > 0 && !isDirectInputTapDetail(tap.detail) ? FILL_SEARCH_DEFAULT_SETTLE_MS : resolveFillSearchSettleMs(tap.detail, mergedOpts.settleMs);
  await recipeSettleDelay(ctx, mergedOpts.payload, postTapSettleMs);
  let nodes;
  let input = null;
  let mode = tap.data?.mode ?? "heuristic";
  const tapInput = tap.data?.input;
  const tapPick = tap.data?.pick;
  const beforeCount = tap.data?.nodeCount ?? 0;
  if (mergedOpts.skipRedundantDump && (tapInput || tapPick?.kind === "input")) {
    input = tapInput ?? (tapPick?.kind === "input" ? tapPick : null);
    nodes = [];
  } else {
    nodes = await safeDumpUi(ctx);
    input = findRole(nodes, ctx, "searchInput", h);
    if (!input && parsed.inputHints.length && !parsed.strict) {
      input = pickNodeByTextHints(nodes, parsed.inputHints, "searchInput", ctx.screen);
      if (input) mode = "textHint";
    }
    const pageTransition = detectFillSearchPageTransition(
      tapPick,
      input,
      ctx.screen,
      beforeCount,
      nodes.length
    );
    if (pageTransition) {
      mode = "pageTransition";
      const userSettle = mergedOpts.settleMs;
      const extraMs = typeof userSettle === "number" && userSettle >= FILL_SEARCH_DIRECT_INPUT_SETTLE_MS ? 400 : FILL_SEARCH_PAGE_TRANSITION_SETTLE_MS;
      await recipeSettleDelay(ctx, mergedOpts.payload, extraMs);
      ctx.invalidateDumpCache?.();
      nodes = await safeDumpUi(ctx);
      input = findRole(nodes, ctx, "searchInput", h) ?? (parsed.inputHints.length && !parsed.strict ? pickNodeByTextHints(nodes, parsed.inputHints, "searchInput", ctx.screen) : null) ?? input;
    }
  }
  if (!input && parsed.strict) {
    return {
      ok: false,
      phase: "fill_search",
      errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_NO_INPUT,
      detail: "search input not found (strict)",
      data: { tap, inputHints: parsed.inputHints, nodeCount: nodes.length }
    };
  }
  const point = input?.point ?? tapInput?.point ?? (tap.data?.fallback ? coordinateFallback(ctx.screen, "input") : coordinateFallback(ctx.screen, "input"));
  if (!input && !parsed.strict && mode !== "textHint") {
    mode = tap.data?.fallback ? "coordinate" : mode;
  }
  let typeMode = "typeAt";
  let typed = false;
  try {
    typeMode = await focusAndType(ctx, input, point, text, mergedOpts.payload);
    typed = true;
  } catch (e) {
    if (ctx.platform === "harmony" && ctx.shell) {
      try {
        typeMode = "uitest.inputText";
        ctx.invalidateDumpCache?.();
        await ctx.shell(`uitest uiInput inputText ${point[0]} ${point[1]} ${text}`);
        typed = true;
      } catch (shellErr) {
        return {
          ok: false,
          phase: "fill_search",
          errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
          detail: shellErr instanceof Error ? shellErr.message : String(shellErr),
          data: { point, tap, typeMode, pick: input, mode }
        };
      }
    } else if (!parsed.strict && parsed.inputHints.length) {
      const retryNodes = nodes.length ? nodes : await safeDumpUi(ctx);
      const hintInput = pickNodeByTextHints(retryNodes, parsed.inputHints, "searchInput", ctx.screen);
      if (hintInput) {
        try {
          typeMode = await focusAndType(ctx, hintInput, hintInput.point, text, mergedOpts.payload);
          input = hintInput;
          mode = "textHint";
          typed = true;
        } catch (retryErr) {
          return {
            ok: false,
            phase: "fill_search",
            errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
            detail: retryErr instanceof Error ? retryErr.message : String(retryErr),
            data: { point: hintInput.point, tap, typeMode, pick: hintInput, mode }
          };
        }
      } else {
        return {
          ok: false,
          phase: "fill_search",
          errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
          detail: e instanceof Error ? e.message : String(e),
          data: { point, tap, typeMode, pick: input, mode }
        };
      }
    } else {
      const chain = await tryHintChainFill(ctx, parsed, text, mergedOpts.payload);
      if (chain?.ok) {
        await recipeSettleDelay(ctx, mergedOpts.payload, 400);
        let enterOk2 = true;
        try {
          await ctx.pressEnter();
        } catch {
          enterOk2 = false;
        }
        return { ...chain, data: { ...chain.data, tap, enterOk: enterOk2 } };
      }
      return {
        ok: false,
        phase: "fill_search",
        errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
        detail: e instanceof Error ? e.message : String(e),
        data: { point, tap, typeMode, pick: input, mode }
      };
    }
  }
  if (!typed) {
    return {
      ok: false,
      phase: "fill_search",
      errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
      detail: "type step did not run",
      data: { point, tap, typeMode, pick: input, mode }
    };
  }
  await recipeSettleDelay(ctx, mergedOpts.payload, 300);
  let enterOk = true;
  try {
    await ctx.pressEnter();
  } catch {
    enterOk = false;
  }
  return fillSearchSuccess(point, text, tap, typeMode, {
    enterOk,
    nodeCount: nodes.length,
    pick: input,
    mode,
    pageTransition: mode === "pageTransition"
  });
}

// ../../packages/driver-rpc/src/mobile-custom.ts
function normalizeMobileCustomAction(action, method) {
  const a = String(action || method || "").toLowerCase();
  if (a === "dump_hierarchy" || a === "dump_layout") return "dump_ui";
  return a;
}
function recipeOptionsFromPayload(payload) {
  const p = payload ?? {};
  const custom = typeof p.custom === "object" && p.custom !== null ? p.custom : {};
  return {
    maxBack: typeof custom.maxBack === "number" ? custom.maxBack : void 0,
    skipRedundantDump: custom.skipRedundantDump === true || p.skipRedundantDump === true,
    settleMs: typeof custom.settleMs === "number" ? custom.settleMs : void 0,
    payload: p
  };
}
async function runMobileCustomAction(rawAction, ctx, options) {
  const action = normalizeMobileCustomAction(rawAction);
  const recipeOpts = recipeOptionsFromPayload(options?.payload);
  if (typeof options?.maxBack === "number") {
    recipeOpts.maxBack = options.maxBack;
  }
  if (action === "smart_wait") {
    const payload = options?.payload ?? {};
    const custom = typeof payload.custom === "object" && payload.custom !== null ? payload.custom : void 0;
    const waitBlock = payload.wait ?? custom?.wait;
    const fallbackMs = typeof waitBlock?.timeoutMs === "number" ? waitBlock.timeoutMs : typeof waitBlock?.maxMs === "number" ? waitBlock.maxMs : typeof payload.settleMs === "number" ? payload.settleMs : 8e3;
    await recipeSettleDelay(ctx, payload, fallbackMs);
    return { handled: true, value: "ok" };
  }
  if (action === "dump_ui") {
    const raw = ctx.getDumpRaw ? await ctx.getDumpRaw() : JSON.stringify(await ctx.dumpUi());
    const recipe = await recipeDumpUi(ctx);
    return { handled: true, value: raw, recipe };
  }
  if (action === "tap_search") {
    const recipe = await recipeTapSearch(ctx, recipeOpts);
    const errorCode = recipe.ok ? void 0 : recipeErrorCodeForAction(action, false);
    return { handled: true, recipe, errorCode, value: recipe.detail };
  }
  if (action === "fill_search") {
    const text = String(options?.text ?? "");
    if (!text) {
      return {
        handled: true,
        recipe: { ok: false, phase: "fill_search", detail: "fill_search requires text", errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_MISSING_TEXT },
        errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_MISSING_TEXT
      };
    }
    const recipe = await recipeFillSearch(ctx, text, recipeOpts);
    const errorCode = recipe.ok ? void 0 : recipe.errorCode ?? recipeErrorCodeForAction(action, false);
    return { handled: true, recipe, errorCode, value: recipe.detail };
  }
  return { handled: false };
}

// ../../packages/driver-rpc/src/mobile-device-admin.ts
var DEVICE_ADMIN_ACTIONS = [
  "listApps",
  "appInfo",
  "isInstalled",
  "installApp",
  "uninstallApp",
  "pushFile",
  "pullFile",
  "shell",
  "hdc",
  "currentApp",
  "clearAppData",
  "openUrl",
  "pressKey",
  "longPress",
  "setClipboard",
  "getClipboard",
  "deviceInfo",
  "grantPermission",
  "setOrientation",
  "startScreenRecord",
  "stopScreenRecord",
  "reboot"
];
function readDeviceAdminAction(payload) {
  const raw = String(payload.action ?? "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const aliases = {
    listapps: "listApps",
    applist: "listApps",
    app: "appInfo",
    appinfo: "appInfo",
    isinstalled: "isInstalled",
    install: "installApp",
    uninstall: "uninstallApp",
    push: "pushFile",
    pull: "pullFile",
    opendeeplink: "openUrl",
    opendeepink: "openUrl",
    presskey: "pressKey",
    longpress: "longPress",
    setclipboard: "setClipboard",
    getclipboard: "getClipboard",
    deviceinfo: "deviceInfo",
    grantpermission: "grantPermission",
    setorientation: "setOrientation",
    startscreenrecord: "startScreenRecord",
    stopscreenrecord: "stopScreenRecord",
    clearappdata: "clearAppData",
    currentapp: "currentApp"
  };
  if (DEVICE_ADMIN_ACTIONS.includes(raw)) return raw;
  return aliases[lower] ?? null;
}
function deviceAdminSuccess(command, action, value) {
  return {
    requestId: command.requestId,
    success: true,
    data: { command: "deviceAdmin", action, ...value }
  };
}
function deviceAdminFail(command, code, message) {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}

// ../../packages/driver-rpc/src/ui-dump-cache.ts
function readUiDumpCacheTtlMs() {
  const raw = process.env.ADA_UI_DUMP_CACHE_MS ?? process.env.ADA_ANDROID_HIERARCHY_CACHE_MS ?? "2000";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 2e3;
}
var UiDumpCache = class {
  constructor(ttlMs = readUiDumpCacheTtlMs()) {
    this.ttlMs = ttlMs;
  }
  entry;
  get() {
    const hit = this.entry;
    if (!hit) return void 0;
    if (Date.now() - hit.at > this.ttlMs) {
      this.entry = void 0;
      return void 0;
    }
    return hit.raw;
  }
  set(raw) {
    this.entry = { raw, at: Date.now() };
  }
  invalidate() {
    this.entry = void 0;
  }
  async getOrLoad(loader) {
    const cached = this.get();
    if (cached !== void 0) return cached;
    const raw = await loader();
    this.set(raw);
    return raw;
  }
};

// ../../packages/driver-rpc/src/ui-heuristics.ts
function parseUiHeuristicsFromPayload(payload) {
  const p = payload ?? {};
  const fromPayload = p.uiHeuristics ?? (typeof p.custom === "object" && p.custom !== null ? p.custom.heuristics : void 0);
  const fromEnv = uiHeuristicsFromEnv();
  if (!fromPayload && !fromEnv) return void 0;
  return { ...fromEnv, ...fromPayload };
}

// ../../packages/driver-rpc/src/swipe-duration.ts
var SWIPE_DURATION_MS = {
  fast: 250,
  normal: 400,
  slow: 800
};
var PRESET_ALIASES = {
  fast: "fast",
  quick: "fast",
  \u5FEB: "fast",
  normal: "normal",
  default: "normal",
  \u4E2D: "normal",
  slow: "slow",
  \u6162: "slow"
};
function positiveMs(v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return void 0;
  return Math.round(v);
}
function presetFromPayload(payload) {
  const raw = payload.swipePreset ?? payload.swipeSpeed;
  if (typeof raw !== "string" || !raw.trim()) return void 0;
  return PRESET_ALIASES[raw.trim().toLowerCase()];
}
function resolveSwipeDurationMs(payload, options = {}) {
  const p = payload ?? {};
  const preset = presetFromPayload(p);
  if (preset) return SWIPE_DURATION_MS[preset];
  const fromDuration = positiveMs(p.durationMs);
  if (fromDuration !== void 0) return fromDuration;
  const fromSpeed = positiveMs(p.speed);
  if (fromSpeed !== void 0) return fromSpeed;
  const env = positiveMs(options.envDefaultMs ?? Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS));
  if (env !== void 0) return env;
  return options.fallbackMs ?? SWIPE_DURATION_MS.normal;
}

// ../../packages/driver-rpc/src/pinch-payload.ts
function ensurePoint(v) {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}
function readPinchEndsFromPayload(payload) {
  const finger1Start = ensurePoint(payload.finger1);
  const finger2Start = ensurePoint(payload.finger2);
  const finger1End = ensurePoint(payload.finger1End);
  const finger2End = ensurePoint(payload.finger2End);
  if (!finger1Start || !finger2Start || !finger1End || !finger2End) return null;
  const center = [
    Math.round((finger1Start[0] + finger2Start[0]) / 2),
    Math.round((finger1Start[1] + finger2Start[1]) / 2)
  ];
  return { finger1Start, finger1End, finger2Start, finger2End, center };
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
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function getString(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function normalizeInvokePayload(raw, defaultMode) {
  const payload = asRecord(raw);
  const legacyCustom = asRecord(payload.custom);
  const httpBlock = asRecord(payload.http);
  const httpMethod = getString(httpBlock.method) ?? getString(legacyCustom.method);
  const httpPath = getString(httpBlock.path) ?? getString(legacyCustom.path);
  const hasHttp = Boolean(httpMethod && httpPath);
  const method = getString(payload.method);
  const target = getString(payload.target);
  const hasMethod = Boolean(method);
  let mode = getString(payload.mode);
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
        body: httpBlock.body ?? legacyCustom.body
      },
      options: asRecord(payload.options)
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
    locator: asRecord(payload.locator),
    options: asRecord(payload.options)
  };
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

// ../../plugins/driver-harmony/src/harmony-paste-text.ts
var import_node_child_process = require("node:child_process");
var HARMONY_PASTE_KEY_EVENT = "uitest uiInput keyEvent 2072 2038";
async function setHostClipboard(text) {
  const value = String(text ?? "");
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const child = (0, import_node_child_process.spawn)(
        "powershell",
        ["-NoProfile", "-Command", "[Console]::In.ReadToEnd() | Set-Clipboard"],
        { stdio: ["pipe", "ignore", "pipe"] }
      );
      let err = "";
      child.stderr?.on("data", (chunk) => {
        err += chunk.toString("utf8");
      });
      child.stdin?.write(value, "utf8");
      child.stdin?.end();
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(err.trim() || `Set-Clipboard exit ${code}`));
      });
    });
    return;
  }
  if (process.platform === "darwin") {
    await new Promise((resolve, reject) => {
      const child = (0, import_node_child_process.spawn)("pbcopy", [], { stdio: ["pipe", "ignore", "pipe"] });
      let err = "";
      child.stderr?.on("data", (chunk) => {
        err += chunk.toString("utf8");
      });
      child.stdin?.write(value, "utf8");
      child.stdin?.end();
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(err.trim() || `pbcopy exit ${code}`));
      });
    });
    return;
  }
  await new Promise((resolve, reject) => {
    const child = (0, import_node_child_process.spawn)("xclip", ["-selection", "clipboard"], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    child.stderr?.on("data", (chunk) => {
      err += chunk.toString("utf8");
    });
    child.stdin?.write(value, "utf8");
    child.stdin?.end();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `xclip exit ${code}`));
    });
  });
}
async function pasteFromHostClipboard(shell) {
  await shell(HARMONY_PASTE_KEY_EVENT, 8e3);
}
async function shellInputTextAt(shell, x, y, text) {
  const q = (s) => /[\s"'\\]/.test(s) ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
  try {
    await shell(`uitest uiInput inputText ${x} ${y} ${q(text)}`, 8e3);
    return true;
  } catch {
    return false;
  }
}
async function pasteTextViaHostClipboard(shell, text) {
  try {
    await setHostClipboard(text);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await pasteFromHostClipboard(shell);
    return true;
  } catch {
    return false;
  }
}

// ../../plugins/driver-harmony/src/recipe-context.ts
function numberOr2(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function opTimeoutMs(payload, fallbackMs) {
  const cmd = numberOr2(payload.commandTimeoutMs, 12e4);
  return resolveSubOperationTimeoutMs(cmd, fallbackMs, 0.85);
}
async function dumpHarmonyRaw(driver, payload) {
  const dumpOut = await raceCommandTimeout(
    driver.shell("uitest dumpLayout", numberOr2(payload.custom?.timeoutMs, 2e4)),
    opTimeoutMs(payload, 25e3),
    "harmony.dumpLayout"
  );
  const remotePath = extractHarmonyDumpPath(String(dumpOut ?? ""));
  if (!remotePath) {
    throw new Error(`uitest dumpLayout: no path in output: ${String(dumpOut).slice(0, 200)}`);
  }
  return String(
    await raceCommandTimeout(
      driver.shell(`cat ${remotePath}`, numberOr2(payload.custom?.timeoutMs, 12e3)),
      opTimeoutMs(payload, 15e3),
      "harmony.dumpLayout.cat"
    )
  );
}
function buildHarmonyRecipeContext(driver, payload, screen, heuristics) {
  const dumpCache = new UiDumpCache();
  return {
    platform: "harmony",
    screen,
    heuristics,
    invalidateDumpCache() {
      dumpCache.invalidate();
    },
    async getDumpRaw() {
      return dumpCache.getOrLoad(() => dumpHarmonyRaw(driver, payload));
    },
    async dumpUi() {
      const raw = await this.getDumpRaw();
      return parseHarmonyLayoutJson(raw);
    },
    async clickPoint(point) {
      dumpCache.invalidate();
      await driver.click(point[0], point[1]);
    },
    async typeAt(point, text) {
      dumpCache.invalidate();
      await driver.click(point[0], point[1]);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const shell = (cmd, timeout) => driver.shell(cmd, timeout);
      if (await shellInputTextAt(shell, point[0], point[1], text)) return;
      try {
        await driver.inputText({ x: point[0], y: point[1] }, text);
        return;
      } catch {
      }
      if (await pasteTextViaHostClipboard(shell, text)) return;
      await driver.shell(`uitest uiInput text ${text}`, 8e3);
    },
    async typeFocused(text) {
      dumpCache.invalidate();
      if (await pasteTextViaHostClipboard((cmd, timeout) => driver.shell(cmd, timeout), text)) return;
      await driver.shell(`uitest uiInput text ${text}`, 8e3);
    },
    async pressEnter() {
      await driver.shell("uitest uiInput keyEvent 2054", 8e3);
    },
    async pressBack() {
      dumpCache.invalidate();
      await driver.pressBack();
    },
    async shell(cmd) {
      return String(await driver.shell(cmd, 12e3));
    }
  };
}

// ../../plugins/driver-harmony/src/harmony-pinch.ts
function buildHarmonyPinchPointerMatrix(types, ends, durationMs) {
  const { PointAction, Point } = types;
  const sampling = 15;
  const downMs = Math.min(80, Math.max(30, Math.floor(durationMs * 0.1)));
  const moveMs = Math.max(100, durationMs);
  const finger1 = new PointAction(sampling).down(new Point(ends.finger1Start[0], ends.finger1Start[1]), downMs).move_to(new Point(ends.finger1End[0], ends.finger1End[1]), moveMs);
  const finger2 = new PointAction(sampling).down(new Point(ends.finger2Start[0], ends.finger2Start[1]), downMs).move_to(new Point(ends.finger2End[0], ends.finger2End[1]), moveMs);
  return PointAction.mergeMultiPointAction([finger1, finger2]);
}
async function executeHarmonyPinch(driver, ends, durationMs, types) {
  if (typeof driver.injectMultiPointerAction === "function" && types) {
    const matrix = buildHarmonyPinchPointerMatrix(types, ends, durationMs);
    await driver.injectMultiPointerAction(matrix, durationMs);
    return { mode: "multiPointer" };
  }
  await driver.swipe(
    ends.finger1Start[0],
    ends.finger1Start[1],
    ends.finger1End[0],
    ends.finger1End[1],
    durationMs
  );
  await driver.swipe(
    ends.finger2Start[0],
    ends.finger2Start[1],
    ends.finger2End[0],
    ends.finger2End[1],
    durationMs
  );
  return { mode: "sequential" };
}

// ../../plugins/driver-harmony/src/device-admin.ts
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
function deviceSn(payload) {
  const caps = payload.capabilities ?? {};
  return String(caps.deviceSn ?? caps.udid ?? caps["ada:udid"] ?? process.env.ADA_HARMONY_DEVICE_SN ?? "").trim();
}
function adminTimeoutMs(payload, fallback) {
  const raw = payload.commandTimeoutMs;
  return typeof raw === "number" && raw > 0 ? Math.min(raw, fallback * 3) : fallback;
}
async function runShell(driver, payload, cmd) {
  const ms = adminTimeoutMs(payload, 15e3);
  return raceCommandTimeout(driver.shell(cmd, ms), ms, "harmony.shell");
}
async function runHdc(driver, payload, cmd) {
  const ms = adminTimeoutMs(payload, 2e4);
  return raceCommandTimeout(driver.hdc(cmd, ms), ms, "harmony.hdc");
}
async function executeHarmonyDeviceAdmin(command, driver, payload) {
  const action = readDeviceAdminAction(payload);
  if (!action) return deviceAdminFail(command, "DEVICE_ADMIN_ACTION_MISSING", "payload.action required");
  const appId = String(payload.appId ?? "").trim();
  const sn = deviceSn(payload);
  try {
    switch (action) {
      case "listApps": {
        if (typeof driver.getInstalledApps !== "function") {
          return deviceAdminFail(command, "HARMONY_LIST_APPS_UNSUPPORTED", "getInstalledApps not available");
        }
        const packages = await driver.getInstalledApps("");
        return deviceAdminSuccess(command, action, { packages, count: packages.length });
      }
      case "appInfo": {
        if (!appId) return deviceAdminFail(command, "HARMONY_APP_ID_MISSING", "appId required");
        const out = await runShell(driver, payload, `bm dump -n ${appId}`);
        const versionName = out.match(/versionName\s*[:=]\s*([^\s]+)/i)?.[1];
        const versionCode = out.match(/versionCode\s*[:=]\s*(\d+)/i)?.[1];
        return deviceAdminSuccess(command, action, {
          appId,
          package: appId,
          versionName: versionName ?? null,
          versionCode: versionCode ? Number(versionCode) : null,
          raw: out.slice(0, 2e3)
        });
      }
      case "isInstalled": {
        if (!appId) return deviceAdminFail(command, "HARMONY_APP_ID_MISSING", "appId required");
        if (typeof driver.getInstalledApps === "function") {
          const packages = await driver.getInstalledApps("");
          const installed2 = packages.includes(appId);
          return deviceAdminSuccess(command, action, { appId, installed: installed2 });
        }
        const out = await runShell(driver, payload, `bm dump -n ${appId}`);
        const installed = !/error|not found|fail/i.test(out);
        return deviceAdminSuccess(command, action, { appId, installed });
      }
      case "installApp": {
        const localPath = import_node_path.default.resolve(String(payload.path ?? payload.localPath ?? ""));
        if (!localPath) return deviceAdminFail(command, "HARMONY_INSTALL_PATH_MISSING", "path required");
        const remote = `/data/local/tmp/${import_node_path.default.basename(localPath)}`;
        if (sn) {
          await runHdc(driver, payload, `file send "${localPath}" "${remote}"`);
        }
        const out = await runShell(driver, payload, `bm install -p ${remote}`);
        return deviceAdminSuccess(command, action, { path: localPath, remote, output: out });
      }
      case "uninstallApp": {
        if (!appId) return deviceAdminFail(command, "HARMONY_APP_ID_MISSING", "appId required");
        const out = await runShell(driver, payload, `bm uninstall -n ${appId}`);
        return deviceAdminSuccess(command, action, { appId, output: out });
      }
      case "pushFile": {
        const localPath = import_node_path.default.resolve(String(payload.localPath ?? payload.path ?? ""));
        const remotePath = String(payload.remotePath ?? "").trim();
        if (!localPath || !remotePath) {
          return deviceAdminFail(command, "HARMONY_PUSH_PATHS_MISSING", "localPath and remotePath required");
        }
        const hdcCmd = sn ? `file send "${localPath}" "${remotePath}"` : `file send "${localPath}" "${remotePath}"`;
        await runHdc(driver, payload, hdcCmd);
        return deviceAdminSuccess(command, action, { localPath, remotePath });
      }
      case "pullFile": {
        const localPath = import_node_path.default.resolve(String(payload.localPath ?? payload.path ?? ""));
        const remotePath = String(payload.remotePath ?? "").trim();
        if (!localPath || !remotePath) {
          return deviceAdminFail(command, "HARMONY_PULL_PATHS_MISSING", "localPath and remotePath required");
        }
        await import_promises.default.mkdir(import_node_path.default.dirname(localPath), { recursive: true });
        await runHdc(driver, payload, `file recv "${remotePath}" "${localPath}"`);
        return deviceAdminSuccess(command, action, { localPath, remotePath });
      }
      case "shell": {
        const cmd = String(payload.command ?? "").trim();
        if (!cmd) return deviceAdminFail(command, "HARMONY_SHELL_COMMAND_MISSING", "command required");
        const output = await runShell(driver, payload, cmd);
        return deviceAdminSuccess(command, action, { output });
      }
      case "hdc": {
        const cmd = String(payload.command ?? "").trim();
        if (!cmd) return deviceAdminFail(command, "HARMONY_HDC_COMMAND_MISSING", "command required");
        const output = await runHdc(driver, payload, cmd);
        return deviceAdminSuccess(command, action, { output });
      }
      case "currentApp": {
        const out = await runShell(driver, payload, "hidumper -s WindowManagerService -a -a");
        const bundle = out.match(/bundleName[=:]\s*([^\s,;]+)/i)?.[1] ?? out.match(/focus.*?([a-z][a-z0-9_.]+)/i)?.[1];
        if (!bundle) return deviceAdminFail(command, "HARMONY_CURRENT_APP_UNKNOWN", "could not parse foreground bundle");
        return deviceAdminSuccess(command, action, { appId: bundle, package: bundle });
      }
      case "clearAppData": {
        if (!appId) return deviceAdminFail(command, "HARMONY_APP_ID_MISSING", "appId required");
        const out = await runShell(driver, payload, `bm clean -n ${appId}`);
        return deviceAdminSuccess(command, action, { appId, cleared: true, output: out });
      }
      case "openUrl": {
        const url = String(payload.url ?? "").trim();
        if (!url) return deviceAdminFail(command, "HARMONY_URL_MISSING", "url required");
        const out = await runShell(driver, payload, `aa start -U '${url.replace(/'/g, "'\\''")}'`);
        return deviceAdminSuccess(command, action, { url, output: out });
      }
      case "pressKey": {
        const key = String(payload.key ?? payload.keyCode ?? "Home");
        const out = await runShell(driver, payload, `uitest uiInput keyEvent ${key}`);
        return deviceAdminSuccess(command, action, { key, output: out });
      }
      case "longPress": {
        const ms = Math.max(300, Number(payload.durationMs ?? payload.ms ?? 800));
        const point = payload.point;
        if (!point || point.length !== 2) {
          return deviceAdminFail(command, "HARMONY_LONG_PRESS_POINT", "longPress requires payload.point [x,y]");
        }
        const [x, y] = point;
        await driver.swipe(x, y, x, y, ms);
        return deviceAdminSuccess(command, action, { point: [Math.round(x), Math.round(y)], durationMs: ms });
      }
      case "setClipboard":
        return deviceAdminFail(command, "HARMONY_CLIPBOARD_UNSUPPORTED", "use shell/hdc or type() after focus");
      case "getClipboard":
        return deviceAdminFail(command, "HARMONY_CLIPBOARD_UNSUPPORTED", "not available via deviceAdmin");
      case "deviceInfo": {
        const model = await runShell(driver, payload, "param get const.product.model").catch(() => "");
        const ver = await runShell(driver, payload, "param get const.os.fullname").catch(() => "");
        const size = await runShell(driver, payload, "wm size").catch(() => "");
        const w = size.match(/(\d+)\s*[xX]\s*(\d+)/);
        return deviceAdminSuccess(command, action, {
          platform: "harmony",
          deviceSn: sn || void 0,
          model: model.trim(),
          osVersion: ver.trim(),
          screenWidth: w ? Number(w[1]) : void 0,
          screenHeight: w ? Number(w[2]) : void 0,
          display: size.trim()
        });
      }
      case "grantPermission":
        return deviceAdminFail(command, "HARMONY_GRANT_PERMISSION_UNSUPPORTED", "use shell aa/bm if needed");
      case "setOrientation": {
        const orientation = String(payload.orientation ?? "portrait").toLowerCase();
        const out = await runShell(
          driver,
          payload,
          orientation.includes("land") ? "uitest uiInput rotate 90" : "uitest uiInput rotate 0"
        ).catch(() => "");
        return deviceAdminSuccess(command, action, { orientation, output: out });
      }
      case "startScreenRecord":
        return deviceAdminFail(command, "HARMONY_SCREEN_RECORD_UNSUPPORTED", "not implemented");
      case "stopScreenRecord":
        return deviceAdminFail(command, "HARMONY_SCREEN_RECORD_UNSUPPORTED", "not implemented");
      case "reboot": {
        await runHdc(driver, payload, "target boot");
        return deviceAdminSuccess(command, action, { rebooting: true });
      }
      default:
        return deviceAdminFail(command, "DEVICE_ADMIN_UNSUPPORTED", `unsupported action: ${action}`);
    }
  } catch (error) {
    return deviceAdminFail(
      command,
      "HARMONY_DEVICE_ADMIN_FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

// ../../plugins/driver-harmony/src/index.ts
var import_promises2 = __toESM(require("node:fs/promises"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_module = require("node:module");
var sessions = /* @__PURE__ */ new Map();
var harmonyModulePromise = null;
var localRequire = (0, import_node_module.createRequire)(typeof __filename === "string" ? __filename : process.cwd());
function failResult(command, code, message) {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}
function ensureReal(payload) {
  if (payload.mock === true) {
    return false;
  }
  if (payload.real === false) {
    return false;
  }
  return true;
}
function numberOr3(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function asPoint2(value) {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return [x, y];
}
async function loadHarmonyModule() {
  if (!harmonyModulePromise) {
    harmonyModulePromise = (async () => {
      try {
        return localRequire("hypium-driver");
      } catch {
        return await new Function('return import("hypium-driver")')();
      }
    })();
  }
  return harmonyModulePromise;
}
function resolveConnectOpts(payload) {
  const caps = payload.capabilities ?? {};
  const deviceSn2 = String(caps.deviceSn ?? caps["ada:udid"] ?? caps.udid ?? process.env.ADA_HARMONY_DEVICE_SN ?? "").trim() || void 0;
  const hdcHost = String(caps.hdcHost ?? process.env.ADA_HARMONY_HDC_HOST ?? "").trim() || void 0;
  const hdcPortRaw = caps.hdcPort ?? process.env.ADA_HARMONY_HDC_PORT;
  const hdcPort = typeof hdcPortRaw === "number" ? hdcPortRaw : Number(hdcPortRaw);
  return {
    deviceSn: deviceSn2,
    udid: deviceSn2,
    hdcHost,
    hdcPort: Number.isFinite(hdcPort) && hdcPort > 0 ? hdcPort : void 0
  };
}
function buildSignature(payload) {
  return JSON.stringify(resolveConnectOpts(payload));
}
function resolveConnectTimeoutMs(payload) {
  const fromPayload = typeof payload.commandTimeoutMs === "number" ? payload.commandTimeoutMs : void 0;
  const cmd = fromPayload && fromPayload > 0 ? fromPayload : resolveCommandTimeoutMs(payload);
  const env = Number(process.env.ADA_HARMONY_CONNECT_TIMEOUT_MS ?? "45000");
  const envCap = Number.isFinite(env) && env > 0 ? env : 45e3;
  return Math.min(cmd, envCap, resolveSubOperationTimeoutMs(cmd, 45e3, 0.6));
}
function opTimeoutMs2(payload, fallbackMs) {
  const cmd = resolveCommandTimeoutMs(payload);
  return resolveSubOperationTimeoutMs(cmd, fallbackMs, 0.85);
}
async function getOrCreateDriver(session, payload) {
  const signature = buildSignature(payload);
  const existed = sessions.get(session.id);
  if (existed && existed.signature === signature) {
    return existed.driver;
  }
  if (existed) {
    await existed.driver.disconnect().catch(() => void 0);
  }
  const mod = await loadHarmonyModule();
  const connectMs = resolveConnectTimeoutMs(payload);
  const driver = await raceCommandTimeout(mod.UiDriver.connect(resolveConnectOpts(payload)), connectMs, "harmony.connect");
  sessions.set(session.id, { driver, signature, connectedAt: Date.now() });
  return driver;
}
async function resolveDisplay(driver) {
  try {
    const size = await driver.getDisplaySize();
    const width = numberOr3(size.width ?? size.x, 0);
    const height = numberOr3(size.height ?? size.y, 0);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  } catch {
  }
  return { width: 1080, height: 1920 };
}
async function normalizeAbsPoint(point, driver) {
  const [rawX, rawY] = point;
  if (rawX >= 0 && rawX <= 1 && rawY >= 0 && rawY <= 1) {
    const size = await resolveDisplay(driver);
    return {
      x: Math.round(rawX * size.width),
      y: Math.round(rawY * size.height)
    };
  }
  return { x: Math.round(rawX), y: Math.round(rawY) };
}
async function findHarmonyComponent(driver, finder, _optional) {
  return withSuppressedHypiumProbeLogs(async () => {
    try {
      const value = await finder();
      return value ?? null;
    } catch {
      return null;
    }
  });
}
async function resolveElement(driver, payload) {
  const locator = payload.locator ?? {};
  const optional = isOptionalUiPayload(payload);
  const timeoutMs = resolveLocatorTimeoutMs(payload, {
    defaultMs: optional ? 600 : 4e3,
    maxMs: optional ? 1200 : 8e3
  });
  if (locator.xpath) {
    return await findHarmonyComponent(
      driver,
      () => driver.findComponentByXpath(locator.xpath, timeoutMs),
      optional
    );
  }
  const mod = await loadHarmonyModule();
  const BY = mod.BY;
  if (locator.byExpression && mod.byExpression) {
    const expr = mod.byExpression(locator.byExpression);
    return await findHarmonyComponent(driver, () => driver.findComponent(expr, timeoutMs), optional);
  }
  if (locator.text) {
    const text = String(locator.text).trim();
    if (isSearchLabel(text)) {
      return null;
    }
    return await findHarmonyComponent(driver, () => driver.findComponent(BY.text(text), timeoutMs), optional);
  }
  if (locator.id) {
    return await findHarmonyComponent(driver, () => driver.findComponent(BY.id(locator.id), timeoutMs), optional);
  }
  if (locator.key) {
    return await findHarmonyComponent(driver, () => driver.findComponent(BY.key(locator.key), timeoutMs), optional);
  }
  if (locator.type) {
    return await findHarmonyComponent(driver, () => driver.findComponent(BY.type(locator.type), timeoutMs), optional);
  }
  return null;
}
function shellQuote(text) {
  if (!/[\s"'\\]/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function hasLocator(payload) {
  const loc = payload.locator ?? {};
  return Boolean(loc.text || loc.id || loc.key || loc.type || loc.xpath || loc.byExpression);
}
async function resolveElementCenter(element) {
  const el = element;
  if (typeof el.getBounds !== "function") return null;
  try {
    const b = await el.getBounds();
    const left = Number(b.left ?? b.x);
    const top = Number(b.top ?? b.y);
    const w = Number(b.width);
    const h = Number(b.height);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return {
      x: Math.round(left + (Number.isFinite(w) ? w / 2 : 0)),
      y: Math.round(top + (Number.isFinite(h) ? h / 2 : 0))
    };
  } catch {
    return null;
  }
}
function isSearchLabel(label) {
  return /搜索|请输入|输入|search/i.test(label.trim());
}
var KEYBOARD_FOCUS_MAX_Y_RATIO = 0.38;
async function resolveSearchInputPoint(driver, payload) {
  const screen = await resolveDisplay(driver);
  const ctx = buildHarmonyRecipeContext(
    driver,
    payload,
    screen,
    parseUiHeuristicsFromPayload(payload)
  );
  const nodes = await ctx.dumpUi();
  const pick = findUiNode(nodes, {
    role: "searchInput",
    screen,
    platform: "harmony",
    heuristics: ctx.heuristics
  });
  return pick?.point ?? null;
}
async function clearSearchFieldViaUiDump(driver, payload) {
  const pt = await resolveSearchInputPoint(driver, payload);
  if (pt) {
    await driver.click(pt[0], pt[1]);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  for (let i = 0; i < 16; i++) {
    try {
      await driver.shell("uitest uiInput keyEvent 2055", 4e3);
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return true;
}
async function isSearchLabelVisibleViaUiDump(driver, payload, label) {
  const screen = await resolveDisplay(driver);
  const ctx = buildHarmonyRecipeContext(
    driver,
    payload,
    screen,
    parseUiHeuristicsFromPayload(payload)
  );
  const nodes = await ctx.dumpUi();
  const heuristics = ctx.heuristics;
  if (findUiNode(nodes, { role: "searchInput", screen, platform: "harmony", heuristics }) || findUiNode(nodes, { role: "searchEntry", screen, platform: "harmony", heuristics })) {
    return true;
  }
  return nodes.some(
    (n) => n.text && n.text.includes(label) || n.desc && n.desc.includes(label)
  );
}
async function tryElementInputText(element, text, opts) {
  const el = element;
  if (typeof el.inputText !== "function") return false;
  return withSuppressedHypiumProbeLogs(async () => {
    try {
      if (!opts?.skipClick && typeof el.click === "function") {
        await el.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await el.inputText(text, { paste: true });
      return true;
    } catch {
      return false;
    }
  });
}
async function typeAtPoint(driver, x, y, text, opts) {
  if (!opts?.skipClick) {
    await driver.click(x, y);
    await new Promise((resolve) => setTimeout(resolve, 600));
  } else {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (await shellInputTextAt((cmd, timeout) => driver.shell(cmd, timeout), x, y, text)) return;
  const mod = await loadHarmonyModule();
  const BY = mod.BY;
  for (const typeName of ["TextInput", "TextField"]) {
    const el = await findHarmonyComponent(
      driver,
      () => driver.findComponent(BY.type(typeName), 1200),
      true
    );
    if (el && await tryElementInputText(el, text, { skipClick: true })) return;
  }
  try {
    await driver.inputText({ x, y }, text);
    return;
  } catch {
  }
  if (await pasteTextViaHostClipboard((cmd, timeout) => driver.shell(cmd, timeout), text)) return;
  try {
    await driver.shell(`uitest uiInput text ${shellQuote(text)}`, 8e3);
    return;
  } catch {
  }
  await driver.shell(`uitest uiInput inputText ${x} ${y} ${shellQuote(text)}`, 8e3);
}
async function typeViaUiDump(driver, payload, text, opts) {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const screen = await resolveDisplay(driver);
  const ctx = buildHarmonyRecipeContext(
    driver,
    payload,
    screen,
    parseUiHeuristicsFromPayload(payload)
  );
  const nodes = await ctx.dumpUi();
  const topMaxY = screen.height * KEYBOARD_FOCUS_MAX_Y_RATIO;
  const focusedInput = nodes.filter((n) => n.focused && n.point[1] < topMaxY).sort((a, b) => (b.bounds?.w ?? 0) - (a.bounds?.w ?? 0))[0];
  if (focusedInput) {
    await typeAtPoint(driver, focusedInput.point[0], focusedInput.point[1], text, { skipClick: true });
    return true;
  }
  const pick = findUiNode(nodes, {
    role: "searchInput",
    screen,
    platform: "harmony",
    heuristics: ctx.heuristics
  }) ?? (opts?.inputOnly ? null : findUiNode(nodes, {
    role: "searchEntry",
    screen,
    platform: "harmony",
    heuristics: ctx.heuristics
  }));
  if (!pick?.point) return false;
  await typeAtPoint(driver, pick.point[0], pick.point[1], text, {
    skipClick: pick.kind === "input"
  });
  return true;
}
async function typeIntoHarmonyTextField(driver, text, payload) {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const pt = await resolveSearchInputPoint(driver, payload);
  if (pt && await shellInputTextAt((cmd, t) => driver.shell(cmd, t), pt[0], pt[1], text)) return true;
  const mod = await loadHarmonyModule();
  const BY = mod.BY;
  for (const typeName of ["TextInput", "TextField"]) {
    const el = await findHarmonyComponent(
      driver,
      () => driver.findComponent(BY.type(typeName), 1200),
      true
    );
    if (el && await tryElementInputText(el, text, { skipClick: true })) return true;
  }
  if (pt) {
    await typeAtPoint(driver, pt[0], pt[1], text, { skipClick: true });
    return true;
  }
  return false;
}
async function clickViaUiDump(driver, payload) {
  const screen = await resolveDisplay(driver);
  const ctx = buildHarmonyRecipeContext(
    driver,
    payload,
    screen,
    parseUiHeuristicsFromPayload(payload)
  );
  const nodes = await ctx.dumpUi();
  const label = payload.locator?.text?.trim();
  const heuristics = ctx.heuristics;
  if (label && isSearchLabel(label)) {
    const input = findUiNode(nodes, {
      role: "searchInput",
      screen,
      platform: "harmony",
      heuristics
    });
    if (input?.point) {
      await driver.click(input.point[0], input.point[1]);
      return true;
    }
    const entry = findUiNode(nodes, {
      role: "searchEntry",
      screen,
      platform: "harmony",
      heuristics
    });
    if (entry?.point) {
      await driver.click(entry.point[0], entry.point[1]);
      return true;
    }
  }
  if (label) {
    const match = nodes.find(
      (n) => n.text && n.text.includes(label) || n.desc && n.desc.includes(label)
    );
    if (match?.point) {
      await driver.click(match.point[0], match.point[1]);
      return true;
    }
  }
  return false;
}
async function clickWithPayload(driver, payload) {
  return withSuppressedHypiumProbeLogs(async () => {
    const point = asPoint2(payload.point);
    if (point) {
      const p = await normalizeAbsPoint(point, driver);
      await driver.click(p.x, p.y);
      return;
    }
    const label = payload.locator?.text?.trim();
    const optional = isOptionalUiPayload(payload);
    if (label && isSearchLabel(label) && await clickViaUiDump(driver, payload)) {
      return;
    }
    const element = await resolveElement(driver, payload);
    if (element && typeof element.click === "function") {
      try {
        await element.click();
        return;
      } catch {
      }
    }
    const center = element ? await resolveElementCenter(element) : null;
    if (center) {
      await driver.click(center.x, center.y);
      return;
    }
    if (label && isSearchLabel(label) && await clickViaUiDump(driver, payload)) {
      return;
    }
    if (label) {
      throw new Error(
        optional ? `optional click: ${label} not clickable` : `click failed for locator text="${label}"`
      );
    }
    throw new Error("click requires payload.point or payload.locator");
  });
}
async function typeWithPayload(driver, payload) {
  if (payload.inputOp === "clear" || payload.harmonyInputOp === "clear") {
    await clearSearchFieldViaUiDump(driver, payload);
    return;
  }
  const text = String(payload.text ?? "");
  if (!text) {
    throw new Error("type requires payload.text");
  }
  const point = asPoint2(payload.point);
  if (point) {
    const p = await normalizeAbsPoint(point, driver);
    await typeAtPoint(driver, p.x, p.y, text);
    return;
  }
  if (!hasLocator(payload)) {
    if (await typeIntoHarmonyTextField(driver, text, payload)) return;
    if (await typeViaUiDump(driver, payload, text, { inputOnly: true })) return;
    throw new Error("type failed: no focused input field");
  }
  const label = payload.locator?.text?.trim();
  if (label && isSearchLabel(label)) {
    if (await typeIntoHarmonyTextField(driver, text, payload)) return;
    if (await typeViaUiDump(driver, payload, text, { inputOnly: true })) return;
    throw new Error(`type failed for locator text="${label}"`);
  }
  const element = await resolveElement(driver, payload);
  if (element && await tryElementInputText(element, text)) return;
  const center = element ? await resolveElementCenter(element) : null;
  if (center) {
    await typeAtPoint(driver, center.x, center.y, text);
    return;
  }
  if (await pasteTextViaHostClipboard((cmd, timeout) => driver.shell(cmd, timeout), text)) return;
  throw new Error(
    label ? `type failed for locator text="${label}"` : "type failed: could not locate input field"
  );
}
async function swipeWithPayload(driver, payload) {
  const from = asPoint2(payload.from);
  const to = asPoint2(payload.to);
  if (!from || !to) {
    throw new Error("swipe requires payload.from and payload.to");
  }
  const screen = await resolveDisplay(driver);
  const relative = payload.relative === true;
  const durationMs = resolveSwipeDurationMs(payload, {
    envDefaultMs: Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS),
    fallbackMs: 300
  });
  const px = harmonySwipePixels(
    screen,
    from,
    to,
    durationMs,
    { relative }
  );
  const swipeWork = typeof driver.fling === "function" && (payload.fling === true || process.env.ADA_HARMONY_SWIPE_FLING === "1") ? driver.fling(px.from[0], px.from[1], px.to[0], px.to[1], 1, px.durationMs) : driver.swipe(px.from[0], px.from[1], px.to[0], px.to[1], px.durationMs);
  await raceCommandTimeout(swipeWork, opTimeoutMs2(payload, Math.max(5e3, px.durationMs + 3e3)), "harmony.swipe");
}
async function pinchWithPayload(driver, payload) {
  const ends = readPinchEndsFromPayload(payload);
  if (!ends) {
    throw new Error("pinch requires finger1, finger2, finger1End, finger2End");
  }
  const durationMs = resolveSwipeDurationMs(payload, {
    envDefaultMs: Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS),
    fallbackMs: 400
  });
  const mod = await loadHarmonyModule();
  const types = mod;
  return raceCommandTimeout(
    executeHarmonyPinch(driver, ends, durationMs, types),
    opTimeoutMs2(payload, Math.max(8e3, durationMs + 5e3)),
    "harmony.pinch"
  );
}
async function screenshotWithPayload(command, driver, payload) {
  const filePath = payload.screenshotPath ? import_node_path2.default.resolve(payload.screenshotPath) : import_node_path2.default.join(process.cwd(), "artifacts", `${command.requestId}-harmony.png`);
  await import_promises2.default.mkdir(import_node_path2.default.dirname(filePath), { recursive: true });
  return await raceCommandTimeout(driver.screenCap(filePath), opTimeoutMs2(payload, 25e3), "harmony.screenCap");
}
async function getTextFromPayload(driver, payload) {
  const element = await resolveElement(driver, payload);
  if (!element || typeof element.getText !== "function") {
    throw new Error("getText/assertText requires payload.locator");
  }
  return await element.getText();
}
async function invokeWithPayload(driver, payload) {
  const invoke = normalizeInvokePayload(payload, "method");
  if (!invoke?.method) {
    throw new Error("invoke requires payload.method");
  }
  const target = invoke.target === "session" ? driver : driver;
  const methodName = String(invoke.method ?? "");
  const fn = target[methodName];
  if (typeof fn !== "function") {
    throw new Error(`harmony invoke method not found: ${methodName}`);
  }
  const args = Array.isArray(invoke.args) ? invoke.args : [];
  const value = await fn(...args);
  return serializeRpcResult(value);
}
async function executeCustom(command, driver, payload) {
  const rawAction = String(payload.action ?? payload.custom?.action ?? payload.custom?.method ?? "");
  const action = normalizeMobileCustomAction(rawAction, payload.custom?.method);
  if (["dump_ui", "tap_search", "fill_search", "smart_wait"].includes(action)) {
    const screen = await resolveDisplay(driver);
    const ctx = buildHarmonyRecipeContext(driver, payload, screen, parseUiHeuristicsFromPayload(payload));
    const outcome = await runMobileCustomAction(action, ctx, {
      text: String(payload.text ?? payload.custom?.text ?? ""),
      maxBack: typeof payload.custom?.maxBack === "number" ? payload.custom.maxBack : 3,
      payload
    });
    if (outcome.handled) {
      const ok = outcome.recipe?.ok !== false;
      return {
        requestId: command.requestId,
        success: ok,
        ...ok ? {
          data: {
            driver: "harmony",
            mode: "real",
            command: "custom",
            action,
            value: outcome.value,
            recipe: outcome.recipe
          }
        } : {
          errorCode: outcome.errorCode ?? outcome.recipe?.errorCode ?? platformRecipeErrorCode("harmony", action),
          errorMessage: outcome.recipe?.detail ?? "recipe failed"
        }
      };
    }
  }
  if (action === "listapps") {
    if (typeof driver.getInstalledApps !== "function") {
      return failResult(command, "HARMONY_CUSTOM_LIST_APPS_UNSUPPORTED", "hypium-driver does not expose getInstalledApps()");
    }
    const value = await driver.getInstalledApps("");
    return {
      requestId: command.requestId,
      success: true,
      data: { driver: "harmony", mode: "real", command: "custom", action, value, source: "driver.getInstalledApps" }
    };
  }
  if (action === "shell") {
    const cmd = String(payload.custom?.command ?? "");
    if (!cmd) return failResult(command, "HARMONY_CUSTOM_SHELL_MISSING_COMMAND", "custom shell requires payload.custom.command");
    const value = await raceCommandTimeout(
      driver.shell(cmd, numberOr3(payload.custom?.timeoutMs, 12e3)),
      opTimeoutMs2(payload, 12e3),
      "harmony.shell"
    );
    return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", action, value } };
  }
  if (action === "hdc") {
    const cmd = String(payload.custom?.command ?? "");
    if (!cmd) return failResult(command, "HARMONY_CUSTOM_HDC_MISSING_COMMAND", "custom hdc requires payload.custom.command");
    const value = await raceCommandTimeout(
      driver.hdc(cmd, numberOr3(payload.custom?.timeoutMs, 12e3)),
      opTimeoutMs2(payload, 12e3),
      "harmony.hdc"
    );
    return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", action, value } };
  }
  return failResult(command, "HARMONY_CUSTOM_UNSUPPORTED", `Unsupported custom action: ${action || "empty"}`);
}
var harmonyPlugin = {
  manifest: {
    id: "driver-harmony",
    version: "0.1.0",
    engine: "harmony",
    platforms: ["harmony"],
    capabilities: [
      "tap",
      "click",
      "type",
      "swipe",
      "pinch",
      "deviceAdmin",
      "assertVisible",
      "screenshot",
      "wait",
      "getText",
      "assertText",
      "back",
      "pressHome",
      "home",
      "launchApp",
      "exitApp",
      "recipe",
      "custom",
      "invoke"
    ],
    semanticCommands: [
      "tap",
      "click",
      "type",
      "swipe",
      "pinch",
      "deviceAdmin",
      "assertVisible",
      "screenshot",
      "wait",
      "getText",
      "assertText",
      "back",
      "pressHome",
      "home",
      "launchApp",
      "exitApp",
      "recipe",
      "custom"
    ],
    invoke: {
      modes: ["method"],
      targets: ["session"]
    }
  },
  async init() {
    await loadHarmonyModule();
  },
  async createSession(platform) {
    return { id: `harmony-${Date.now()}`, platform };
  },
  async execute(session, command) {
    const payload = command.payload ?? {};
    if (payload.probe === true) {
      try {
        const driver = await getOrCreateDriver(session, payload);
        const size = await resolveDisplay(driver);
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "harmony", platform: "harmony", probe: "ok", display: size }
        };
      } catch (error) {
        return failResult(command, "HARMONY_PROBE_FAILED", error instanceof Error ? error.message : String(error));
      }
    }
    if (command.command === "invoke") {
      const invoke = normalizeInvokePayload(payload, "method");
      if (!invoke?.method) {
        return failResult(command, "INVOKE_INVALID_PAYLOAD", "invoke requires payload.method");
      }
    }
    if (!ensureReal(payload)) {
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "harmony", platform: "harmony", command: command.command, mode: "mock", message: "Mock harmony command executed" }
      };
    }
    try {
      const driver = await getOrCreateDriver(session, payload);
      if (command.command === "click") {
        if (isOptionalUiPayload(payload)) {
          return withSuppressedHypiumProbeLogs(async () => {
            try {
              const point = asPoint2(payload.point);
              if (!point) {
                const element = await resolveElement(driver, payload);
                if (!element) {
                  const label = payload.locator?.text ?? payload.locator?.id ?? "locator";
                  return buildOptionalUiMissResult(command, `optional click: ${label} not found`, {
                    driver: "harmony",
                    mode: "real",
                    locator: payload.locator
                  });
                }
              }
              await clickWithPayload(driver, payload);
            } catch (error) {
              const label = payload.locator?.text ?? payload.locator?.id ?? payload.point ?? "locator";
              return buildOptionalUiMissResult(
                command,
                `optional click: ${label} failed: ${error instanceof Error ? error.message : String(error)}`,
                {
                  driver: "harmony",
                  mode: "real",
                  locator: payload.locator,
                  point: payload.point
                }
              );
            }
            return {
              requestId: command.requestId,
              success: true,
              data: { driver: "harmony", mode: "real", command: "click" }
            };
          });
        }
        try {
          await clickWithPayload(driver, payload);
        } catch (error) {
          return failResult(
            command,
            "HARMONY_CLICK_FAILED",
            error instanceof Error ? error.message : String(error)
          );
        }
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "click" } };
      }
      if (command.command === "type") {
        try {
          await typeWithPayload(driver, payload);
        } catch (error) {
          return failResult(
            command,
            "HARMONY_TYPE_FAILED",
            error instanceof Error ? error.message : String(error)
          );
        }
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "type" } };
      }
      if (command.command === "swipe") {
        await swipeWithPayload(driver, payload);
        const durationMs = resolveSwipeDurationMs(payload, {
          envDefaultMs: Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS),
          fallbackMs: 300
        });
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "harmony", mode: "real", command: "swipe", durationMs, from: payload.from, to: payload.to }
        };
      }
      if (command.command === "deviceAdmin") {
        return executeHarmonyDeviceAdmin(command, driver, payload);
      }
      if (command.command === "pinch") {
        const { mode: pinchMode } = await pinchWithPayload(driver, payload);
        const durationMs = resolveSwipeDurationMs(payload, {
          envDefaultMs: Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS),
          fallbackMs: 400
        });
        return {
          requestId: command.requestId,
          success: true,
          data: {
            driver: "harmony",
            mode: "real",
            command: "pinch",
            durationMs,
            pinchIn: payload.pinchIn,
            pinchMode
          }
        };
      }
      if (command.command === "screenshot") {
        const screenshot = await screenshotWithPayload(command, driver, payload);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "screenshot", screenshot } };
      }
      if (command.command === "wait") {
        const timeoutMs = numberOr3(payload.timeoutMs, 300);
        await new Promise((resolve) => setTimeout(resolve, timeoutMs));
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "wait", timeoutMs } };
      }
      if (command.command === "back") {
        await driver.pressBack();
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "back" } };
      }
      if (command.command === "pressHome" || command.command === "home") {
        await driver.pressHome();
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "harmony", mode: "real", command: "pressHome" }
        };
      }
      if (command.command === "launchApp") {
        const bundleName = String(payload.appId ?? payload.bundleId ?? "");
        if (!bundleName) {
          return failResult(command, "HARMONY_LAUNCH_APP_MISSING_BUNDLE", "launchApp requires payload.appId or payload.bundleId");
        }
        const abilityId = String(payload.abilityId ?? payload.ability ?? "").trim() || "EntryAbility";
        await raceCommandTimeout(
          driver.startApp(bundleName, abilityId),
          opTimeoutMs2(payload, 6e4),
          "harmony.startApp"
        );
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "harmony", mode: "real", command: "launchApp", bundleName, abilityId }
        };
      }
      if (command.command === "exitApp") {
        const bundleName = String(payload.appId ?? payload.bundleId ?? "");
        if (!bundleName) {
          return failResult(command, "HARMONY_EXIT_APP_MISSING_BUNDLE", "exitApp requires payload.appId or payload.bundleId");
        }
        await raceCommandTimeout(driver.stopApp(bundleName), opTimeoutMs2(payload, 2e4), "harmony.stopApp");
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "exitApp", bundleName } };
      }
      if (command.command === "getText") {
        const text = await getTextFromPayload(driver, payload);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "getText", text } };
      }
      if (command.command === "assertText") {
        const text = await getTextFromPayload(driver, payload);
        const expected = String(payload.expectedText ?? payload.text ?? "");
        if (!expected) {
          return failResult(command, "HARMONY_ASSERT_TEXT_MISSING_EXPECTED", "assertText requires payload.expectedText or payload.text");
        }
        if (!text.includes(expected)) {
          return failResult(command, "HARMONY_ASSERT_TEXT_FAILED", `Expected text "${expected}" not found in "${text}"`);
        }
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "assertText", text, expected } };
      }
      if (command.command === "assertVisible") {
        const label = payload.locator?.text?.trim();
        if (label && isSearchLabel(label)) {
          const visible = await isSearchLabelVisibleViaUiDump(driver, payload, label);
          if (!visible) {
            return failResult(command, "HARMONY_ASSERT_VISIBLE_FAILED", `Element not found: text="${label}"`);
          }
          return {
            requestId: command.requestId,
            success: true,
            data: { driver: "harmony", mode: "real", command: "assertVisible", via: "uiDump" }
          };
        }
        const element = await withSuppressedHypiumProbeLogs(() => resolveElement(driver, payload));
        if (!element) {
          return failResult(command, "HARMONY_ASSERT_VISIBLE_FAILED", "Element not found");
        }
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "assertVisible" } };
      }
      if (command.command === "custom") {
        return await executeCustom(command, driver, payload);
      }
      if (command.command === "invoke") {
        const value = await invokeWithPayload(driver, payload);
        return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "invoke", value } };
      }
      return failResult(command, "HARMONY_REAL_UNSUPPORTED_COMMAND", `Real mode does not support command: ${command.command}`);
    } catch (error) {
      return failResult(command, "HARMONY_EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
    }
  },
  async destroySession(session) {
    const state = sessions.get(session.id);
    if (!state) return;
    sessions.delete(session.id);
    await Promise.race([
      state.driver.disconnect(),
      new Promise((resolve) => setTimeout(resolve, 8e3))
    ]).catch(() => void 0);
  },
  async dispose() {
    const all = Array.from(sessions.values());
    sessions.clear();
    await Promise.allSettled(
      all.map(
        (item) => Promise.race([
          item.driver.disconnect(),
          new Promise((resolve) => setTimeout(resolve, 8e3))
        ]).catch(() => void 0)
      )
    );
  },
  forceDispose() {
    const all = Array.from(sessions.values());
    sessions.clear();
    for (const item of all) {
      void item.driver.disconnect().catch(() => void 0);
    }
  }
};
var index_default = harmonyPlugin;
