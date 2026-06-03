var __ada_import_meta_url=require("url").pathToFileURL(__filename).href;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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

// ../../packages/core-runtime/src/index.ts
async function resolveWorkspaceRoot(configRelativePath, startDir = process.cwd()) {
  const exeDir = import_node_path.default.dirname(process.execPath);
  if (exeDir && exeDir !== "." && exeDir.length > 1) {
    const besideExe = import_node_path.default.join(exeDir, configRelativePath);
    try {
      await import_promises.default.access(besideExe);
      return exeDir;
    } catch {
    }
  }
  let current = startDir;
  for (let i = 0; i < 10; i += 1) {
    const candidate = import_node_path.default.join(current, configRelativePath);
    try {
      await import_promises.default.access(candidate);
      return current;
    } catch {
      const parent = import_node_path.default.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return startDir;
}
var import_promises, import_node_path;
var init_src = __esm({
  "../../packages/core-runtime/src/index.ts"() {
    import_promises = __toESM(require("node:fs/promises"));
    import_node_path = __toESM(require("node:path"));
  }
});

// ../../packages/install-deps/src/deps-install-paths.ts
async function resolveWorkspaceRoot2(startDir = process.cwd()) {
  return resolveWorkspaceRoot(DEFAULT_CONFIG_RELATIVE, startDir);
}
function resolveInstallContextCwd() {
  const init = process.env.INIT_CWD?.trim();
  if (init) {
    return init;
  }
  return process.cwd();
}
function resolveGlobalAdaHomeSync() {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    return import_node_path2.default.resolve(override);
  }
  return import_node_path2.default.join(import_node_os.default.homedir(), ".ada");
}
var import_node_os, import_node_path2, DEFAULT_CONFIG_RELATIVE;
var init_deps_install_paths = __esm({
  "../../packages/install-deps/src/deps-install-paths.ts"() {
    "use strict";
    import_node_os = __toESM(require("node:os"), 1);
    import_node_path2 = __toESM(require("node:path"), 1);
    init_src();
    DEFAULT_CONFIG_RELATIVE = import_node_path2.default.join("config", "default.yaml");
  }
});

// ../../packages/install-deps/src/tools-paths.ts
async function fileExists(filePath) {
  try {
    await import_promises2.default.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function toolsDirHasHdc(dir) {
  return fileExists(import_node_path3.default.join(dir, HDC_BIN));
}
function uniquePaths(paths) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of paths) {
    const normalized = import_node_path3.default.normalize(raw);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
function mcpServerEntryDir() {
  const entry = process.env.ADA_MCP_SERVER_ENTRY?.trim();
  if (!entry) {
    return null;
  }
  try {
    return import_node_path3.default.dirname(import_node_path3.default.resolve(entry));
  } catch {
    return null;
  }
}
function walkUpToolsDirs(startDir, relativeDir, maxDepth = 10) {
  const out = [];
  let dir = import_node_path3.default.resolve(startDir);
  for (let i = 0; i < maxDepth; i += 1) {
    out.push(import_node_path3.default.join(dir, relativeDir));
    const parent = import_node_path3.default.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return out;
}
async function workspaceToolsDirs(relativeDir, startDirs) {
  const out = [];
  for (const start of startDirs) {
    try {
      const root = await resolveWorkspaceRoot2(start);
      out.push(import_node_path3.default.join(root, relativeDir));
    } catch {
    }
  }
  return out;
}
async function collectToolsDirCandidates(options) {
  const relativeDir = options?.relativeDir?.trim() || "tools";
  const startCwd = options?.cwd ?? resolveInstallContextCwd();
  const entryDir = mcpServerEntryDir();
  const execDir = import_node_path3.default.dirname(process.execPath);
  const adaHomeTools = import_node_path3.default.join(resolveGlobalAdaHomeSync(), relativeDir);
  const startDirs = uniquePaths(
    [
      process.env.ADA_TOOLS_DIR?.trim(),
      startCwd,
      process.env.INIT_CWD?.trim(),
      entryDir,
      process.cwd(),
      execDir && !execDir.includes("node") ? execDir : void 0
    ].filter((x) => typeof x === "string" && x.length > 0)
  );
  const candidates = uniquePaths([
    ...process.env.ADA_TOOLS_DIR?.trim() ? [import_node_path3.default.resolve(process.env.ADA_TOOLS_DIR.trim())] : [],
    ...await workspaceToolsDirs(relativeDir, startDirs),
    ...startDirs.flatMap((dir) => walkUpToolsDirs(dir, relativeDir)),
    adaHomeTools
  ]);
  return candidates;
}
async function resolveAdaToolsDir(options) {
  for (const candidate of await collectToolsDirCandidates(options)) {
    if (await toolsDirHasHdc(candidate)) {
      return candidate;
    }
  }
  return null;
}
async function resolveDefaultToolsDir(options) {
  const withHdc = await resolveAdaToolsDir(options);
  if (withHdc) {
    return withHdc;
  }
  const candidates = await collectToolsDirCandidates(options);
  for (const candidate of candidates) {
    try {
      const stat = await import_promises2.default.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
    }
  }
  return candidates[0] ?? null;
}
var import_promises2, import_node_path3, HDC_BIN;
var init_tools_paths = __esm({
  "../../packages/install-deps/src/tools-paths.ts"() {
    "use strict";
    import_promises2 = __toESM(require("node:fs/promises"), 1);
    import_node_path3 = __toESM(require("node:path"), 1);
    init_deps_install_paths();
    init_deps_install_paths();
    init_deps_install_paths();
    HDC_BIN = process.platform === "win32" ? "hdc.exe" : "hdc";
  }
});

// ../../packages/install-deps/src/deps-resolution.ts
var init_deps_resolution = __esm({
  "../../packages/install-deps/src/deps-resolution.ts"() {
    "use strict";
    init_deps_install_paths();
  }
});

// ../../packages/install-deps/src/harmony-hdc-install.ts
var init_harmony_hdc_install = __esm({
  "../../packages/install-deps/src/harmony-hdc-install.ts"() {
    "use strict";
    init_tools_paths();
  }
});

// ../../packages/install-deps/src/install-summary.ts
var init_install_summary = __esm({
  "../../packages/install-deps/src/install-summary.ts"() {
    "use strict";
  }
});

// ../../packages/download-probe/src/download-probe.ts
var init_download_probe = __esm({
  "../../packages/download-probe/src/download-probe.ts"() {
    "use strict";
  }
});

// ../../packages/download-probe/src/mirror-candidates.ts
var init_mirror_candidates = __esm({
  "../../packages/download-probe/src/mirror-candidates.ts"() {
    "use strict";
  }
});

// ../../packages/download-probe/src/index.ts
var init_src2 = __esm({
  "../../packages/download-probe/src/index.ts"() {
    init_download_probe();
    init_mirror_candidates();
  }
});

// ../../packages/install-deps/src/registry-probe.ts
var PINNED_PLAYWRIGHT_VERSION;
var init_registry_probe = __esm({
  "../../packages/install-deps/src/registry-probe.ts"() {
    "use strict";
    init_src2();
    PINNED_PLAYWRIGHT_VERSION = process.env.ADA_PLAYWRIGHT_VERSION?.trim() || "1.59.1";
  }
});

// ../../packages/install-deps/src/playwright-browser-install.ts
var init_playwright_browser_install = __esm({
  "../../packages/install-deps/src/playwright-browser-install.ts"() {
    "use strict";
    init_src2();
    init_deps_install_paths();
    init_deps_resolution();
  }
});

// ../../packages/runtime-probe/src/runtime-probe.ts
var init_runtime_probe = __esm({
  "../../packages/runtime-probe/src/runtime-probe.ts"() {
    "use strict";
  }
});

// ../../packages/runtime-probe/src/android-uia2-probe.ts
async function fetchMobileStatus(url, timeoutMs = 3e3) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url.replace(/\/$/, "")}/status`, { signal: controller.signal });
    clearTimeout(timer);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, body };
  } catch {
    return { ok: false };
  }
}
async function probeWdaStatus(serverUrl) {
  const wdaUrl = (serverUrl ?? (process.env.ADA_WDA_SERVER_URL?.trim() || "http://127.0.0.1:8100")).replace(/\/$/, "");
  const status = await fetchMobileStatus(wdaUrl);
  const value = status.body?.value ?? status.body;
  const ready = Boolean(status.ok && (value?.ready === true || value?.state === "success" || status.ok));
  return {
    wdaUrl,
    reachable: status.ok,
    ready,
    detail: status.ok ? `WDA reachable at ${wdaUrl}` : `WDA not reachable at ${wdaUrl}`,
    status: status.body
  };
}
async function retryAsync(fn, options) {
  const attempts = Math.max(1, options?.attempts ?? 3);
  const delayMs = Math.max(0, options?.delayMs ?? 400);
  const shouldRetry = options?.shouldRetry ?? (() => true);
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i >= attempts - 1 || !shouldRetry(error)) break;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}
var init_android_uia2_probe = __esm({
  "../../packages/runtime-probe/src/android-uia2-probe.ts"() {
    "use strict";
  }
});

// ../../packages/runtime-probe/src/ios-wda-probe.ts
function runCommandCapture(command, args, timeoutMs = 15e3) {
  return new Promise((resolve) => {
    const child = (0, import_node_child_process.spawn)(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      ...process.platform === "win32" ? { windowsHide: true } : {}
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: -1, stdout, stderr: stderr || "timeout" });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 1, stdout: "", stderr: "" });
    });
  });
}
function defaultWdaServerUrl() {
  return (process.env.ADA_WDA_SERVER_URL?.trim() || "http://127.0.0.1:8100").replace(/\/$/, "");
}
function wdaBootstrapEnabled() {
  const raw = process.env.ADA_IOS_WDA_BOOTSTRAP?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
async function resolveIosDeviceUdid(preferred) {
  const fromEnv = preferred?.trim() || process.env.ADA_IOS_DEVICE_UDID?.trim() || "";
  if (fromEnv) return fromEnv;
  const useSimulator = ["1", "true", "yes"].includes(
    (process.env.ADA_IOS_USE_SIMULATOR ?? "").trim().toLowerCase()
  );
  if (useSimulator || process.platform === "darwin") {
    const sim = await runCommandCapture("xcrun", ["simctl", "list", "devices", "booted"]);
    if (sim.code === 0) {
      const match = sim.stdout.match(/\(([A-F0-9-]{36})\)\s+\(Booted\)/i);
      if (match?.[1]) return match[1];
    }
  }
  if (process.platform !== "darwin") return "";
  const trace = await runCommandCapture("xcrun", ["xctrace", "list", "devices"]);
  if (trace.code !== 0) return "";
  for (const line of trace.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("==") || /simulator/i.test(trimmed)) continue;
    const match = trimmed.match(/\(([A-F0-9-]{36})\)\s*$/i);
    if (match?.[1]) return match[1];
  }
  return "";
}
function buildWdaXcodeDestination(udid) {
  if (udid) return `id=${udid}`;
  const simName = process.env.ADA_IOS_SIMULATOR_NAME?.trim() || "iPhone 15";
  return `platform=iOS Simulator,name=${simName}`;
}
var import_node_child_process;
var init_ios_wda_probe = __esm({
  "../../packages/runtime-probe/src/ios-wda-probe.ts"() {
    "use strict";
    import_node_child_process = require("node:child_process");
  }
});

// ../../packages/runtime-probe/src/device-scan.ts
var init_device_scan = __esm({
  "../../packages/runtime-probe/src/device-scan.ts"() {
    "use strict";
    init_android_uia2_probe();
  }
});

// ../../packages/runtime-probe/src/device-registry.ts
var init_device_registry = __esm({
  "../../packages/runtime-probe/src/device-registry.ts"() {
    "use strict";
    init_device_scan();
  }
});

// ../../packages/runtime-probe/src/device-display.ts
var init_device_display = __esm({
  "../../packages/runtime-probe/src/device-display.ts"() {
    "use strict";
  }
});

// ../../packages/runtime-probe/src/index.ts
var init_src3 = __esm({
  "../../packages/runtime-probe/src/index.ts"() {
    init_runtime_probe();
    init_android_uia2_probe();
    init_ios_wda_probe();
    init_device_scan();
    init_device_registry();
    init_device_display();
  }
});

// ../../packages/install-deps/src/android-uia2-bootstrap.ts
var init_android_uia2_bootstrap = __esm({
  "../../packages/install-deps/src/android-uia2-bootstrap.ts"() {
    "use strict";
    init_tools_paths();
    init_src3();
  }
});

// ../../packages/install-deps/src/ios-wda-bootstrap.ts
async function pathExists(target) {
  try {
    await import_promises3.default.access(target);
    return true;
  } catch {
    return false;
  }
}
async function runCommand(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = (0, import_node_child_process2.spawn)(command, args, {
      cwd,
      stdio: "ignore",
      shell: process.platform === "win32",
      ...process.platform === "win32" ? { windowsHide: true } : {}
    });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exit=${code}`)));
    child.on("error", reject);
  });
}
async function ensureWdaSources(toolsDir, onLogLine) {
  const dir = import_node_path4.default.join(toolsDir, "wda", "WebDriverAgent");
  const project = import_node_path4.default.join(dir, "WebDriverAgent.xcodeproj");
  if (await pathExists(project)) return project;
  const cloneEnabled = ["1", "true", "yes"].includes(
    (process.env.ADA_IOS_WDA_CLONE ?? "").trim().toLowerCase()
  );
  if (!cloneEnabled) {
    throw new Error(
      "WebDriverAgent project not found; set ADA_WDA_PROJECT_PATH or ADA_IOS_WDA_CLONE=true to clone into tools/wda"
    );
  }
  onLogLine?.(`[ios-wda] cloning ${PINNED_WDA_REPO}`);
  await import_promises3.default.mkdir(import_node_path4.default.dirname(dir), { recursive: true });
  await runCommand("git", ["clone", "--depth", "1", PINNED_WDA_REPO, dir]);
  if (!await pathExists(project)) {
    throw new Error("WebDriverAgent clone completed but WebDriverAgent.xcodeproj missing");
  }
  return project;
}
function spawnXcodebuildWda(projectPath, destination, onLogLine) {
  const projectDir = import_node_path4.default.dirname(projectPath);
  const args = [
    "-project",
    projectPath,
    "-scheme",
    process.env.ADA_WDA_XCODE_SCHEME?.trim() || "WebDriverAgentRunner",
    "-destination",
    destination,
    "-allowProvisioningUpdates",
    "test"
  ];
  onLogLine?.(`[ios-wda] xcodebuild ${args.join(" ")}`);
  const child = (0, import_node_child_process2.spawn)("xcodebuild", args, {
    cwd: projectDir,
    stdio: "ignore",
    detached: true,
    shell: false
  });
  child.unref();
}
async function waitForWdaReady(serverUrl, timeoutMs, onLogLine) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const probe = await probeWdaStatus(serverUrl);
    if (probe.reachable && probe.ready) {
      onLogLine?.(`[ios-wda] ready at ${serverUrl}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 2e3));
  }
  return false;
}
async function ensureIosWdaBootstrap(options) {
  const onLogLine = options?.onLogLine;
  const wdaUrl = defaultWdaServerUrl();
  const artifact = { id: "ios-wda", status: "skipped", detail: "bootstrap disabled" };
  if (process.platform !== "darwin") {
    artifact.detail = "iOS WDA bootstrap requires macOS host";
    artifact.status = "missing";
    return { outcome: artifact, wdaUrl };
  }
  const probe = await probeWdaStatus(wdaUrl);
  if (!wdaBootstrapEnabled()) {
    artifact.detail = `bootstrap disabled (set ADA_IOS_WDA_BOOTSTRAP=true); ${probe.detail}`;
    artifact.status = probe.ready ? "skipped" : "missing";
    return { outcome: artifact, wdaUrl };
  }
  if (probe.ready && !options?.force) {
    artifact.detail = probe.detail;
    return { outcome: artifact, wdaUrl };
  }
  try {
    const toolsDir = await resolveDefaultToolsDir() ?? import_node_path4.default.join(process.cwd(), "tools");
    const projectPath = await ensureWdaSources(toolsDir, onLogLine);
    const udid = await resolveIosDeviceUdid();
    const destination = buildWdaXcodeDestination(udid);
    onLogLine?.(`[ios-wda] destination=${destination}`);
    spawnXcodebuildWda(projectPath, destination, onLogLine);
    process.env.ADA_WDA_SERVER_URL = wdaUrl;
    const ready = await waitForWdaReady(wdaUrl, 12e4, onLogLine);
    const after = await probeWdaStatus(wdaUrl);
    if (ready || after.ready) {
      artifact.status = "installed";
      artifact.detail = `WDA bootstrapped at ${wdaUrl}`;
    } else {
      artifact.status = "missing";
      artifact.detail = "xcodebuild started but WDA /status not ready within timeout";
    }
  } catch (error) {
    artifact.status = "missing";
    artifact.detail = error instanceof Error ? error.message : String(error);
    onLogLine?.(`[ios-wda][warn] ${artifact.detail}`);
  }
  return { outcome: artifact, wdaUrl };
}
var import_promises3, import_node_path4, import_node_child_process2, PINNED_WDA_REPO;
var init_ios_wda_bootstrap = __esm({
  "../../packages/install-deps/src/ios-wda-bootstrap.ts"() {
    "use strict";
    import_promises3 = __toESM(require("node:fs/promises"), 1);
    import_node_path4 = __toESM(require("node:path"), 1);
    import_node_child_process2 = require("node:child_process");
    init_tools_paths();
    init_src3();
    PINNED_WDA_REPO = "https://github.com/appium/WebDriverAgent.git";
  }
});

// ../../packages/install-deps/src/dependency-installer.ts
var HEALTH_CACHE_OK_MS, PLAYWRIGHT_LAUNCH_OK_MS;
var init_dependency_installer = __esm({
  "../../packages/install-deps/src/dependency-installer.ts"() {
    "use strict";
    init_deps_install_paths();
    init_deps_install_paths();
    init_tools_paths();
    init_deps_resolution();
    init_harmony_hdc_install();
    init_install_summary();
    init_registry_probe();
    init_src2();
    init_playwright_browser_install();
    init_src3();
    init_android_uia2_bootstrap();
    init_ios_wda_bootstrap();
    init_deps_install_paths();
    HEALTH_CACHE_OK_MS = Number(process.env.ADA_DEPS_HEALTH_CACHE_MS ?? 9e4);
    PLAYWRIGHT_LAUNCH_OK_MS = Number(process.env.ADA_PLAYWRIGHT_LAUNCH_CACHE_MS ?? 12e4);
  }
});

// ../../plugins/driver-ios/src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default,
  iosSessionSignature: () => iosSessionSignature
});
module.exports = __toCommonJS(index_exports);

// ../../plugins/driver-ios/src/session-signature.ts
function serverUrlOf(payload) {
  return String(payload.serverUrl ?? process.env.ADA_WDA_SERVER_URL ?? "http://127.0.0.1:8100").replace(/\/$/, "");
}
function capsOf(payload) {
  return payload.capabilities ?? {
    platformName: "iOS",
    automationName: "XCUITest"
  };
}
function iosSessionSignature(payload) {
  return JSON.stringify({
    serverUrl: serverUrlOf(payload),
    capabilities: capsOf(payload)
  });
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

// ../../packages/mobile-ui/src/android.ts
function parseAndroidHierarchy(xml) {
  const nodes = [];
  const tagRe = /<node\b[^>]*>/g;
  let m;
  while ((m = tagRe.exec(xml)) !== null) {
    const tag = m[0];
    const bounds = tag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bounds) continue;
    const b = parseBoundsString(`[${bounds[1]},${bounds[2]}][${bounds[3]},${bounds[4]}]`);
    if (!b) continue;
    const text = (tag.match(/\btext="([^"]*)"/) || [])[1] ?? "";
    const desc = (tag.match(/\bcontent-desc="([^"]*)"/) || [])[1] ?? "";
    const id = (tag.match(/\bresource-id="([^"]*)"/) || [])[1] ?? "";
    const clickable = /clickable="true"/.test(tag);
    nodes.push({
      text,
      desc,
      id,
      type: "",
      clickable,
      focused: /focused="true"/.test(tag),
      point: [b.cx, b.cy],
      bounds: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, w: b.w, h: b.h }
    });
  }
  return nodes;
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
function normalizedSwipePoints2(screen, from, to, options) {
  if (options?.relative === true) {
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

// ../../packages/driver-rpc/src/fill-search-transition.ts
var FILL_SEARCH_DIRECT_INPUT_SETTLE_MS = 1200;
var FILL_SEARCH_PAGE_TRANSITION_SETTLE_MS = 800;
var FILL_SEARCH_DEFAULT_SETTLE_MS = 600;
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
    await recipeSettleDelay(ctx, void 0, 1200);
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
  await recipeSettleDelay(ctx, options?.payload, options?.settleMs ?? 1200);
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
  await recipeSettleDelay(ctx, mergedOpts.payload, resolveFillSearchSettleMs(tap.detail, mergedOpts.settleMs));
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
function normalizeOrientation(input) {
  const v = input.trim().toLowerCase();
  if (v === "landscape" || v === "landscapeleft" || v === "landscaperight" || v === "horizontal") {
    return "LANDSCAPE";
  }
  return "PORTRAIT";
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

// ../../packages/driver-rpc/src/mobile-element-cache.ts
function locatorCacheKey(locator) {
  if (!locator) {
    return null;
  }
  const parts = [];
  if (locator.id) parts.push(`id:${locator.id}`);
  if (locator.text) parts.push(`text:${locator.text}`);
  if (locator.accessibilityId) parts.push(`a11y:${locator.accessibilityId}`);
  if (locator.xpath) parts.push(`xpath:${locator.xpath}`);
  if (locator.uiautomator) parts.push(`uia:${locator.uiautomator}`);
  return parts.length > 0 ? parts.join("|") : null;
}
var ElementIdCache = class {
  constructor(ttlMs = 1e4) {
    this.ttlMs = ttlMs;
  }
  entries = /* @__PURE__ */ new Map();
  get(key) {
    const hit = this.entries.get(key);
    if (!hit) {
      return void 0;
    }
    if (Date.now() - hit.at > this.ttlMs) {
      this.entries.delete(key);
      return void 0;
    }
    return hit.elementId;
  }
  set(key, elementId) {
    this.entries.set(key, { elementId, at: Date.now() });
  }
  clear() {
    this.entries.clear();
  }
};

// ../../packages/driver-rpc/src/mobile-invoke.ts
function isHttpServerUrl(value) {
  return /^https?:\/\//i.test(value.trim());
}
function resolveMobileHttpPath(baseUrl, path7, sessionId) {
  const trimmed = path7.trim();
  if (isHttpServerUrl(trimmed)) {
    return trimmed;
  }
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  let resolved = normalizedPath;
  if (sessionId) {
    resolved = resolved.replace(/\{sessionId\}/g, sessionId);
    const globalPrefixes = ["/wda/", "/status", "/health"];
    const isGlobal = globalPrefixes.some((prefix) => resolved.startsWith(prefix));
    if (!isGlobal && !resolved.includes("/session/")) {
      resolved = `/session/${sessionId}${resolved}`;
    }
  }
  return `${baseUrl.replace(/\/$/, "")}${resolved}`;
}
async function fetchWebDriverJson(method, url, body) {
  const upper = method.toUpperCase();
  const hasBody = body !== void 0 && upper !== "GET" && upper !== "HEAD";
  try {
    const res = await fetch(url, {
      method: upper,
      headers: hasBody ? { "Content-Type": "application/json" } : void 0,
      body: hasBody ? JSON.stringify(body) : void 0
    });
    const text = await res.text().catch(() => "");
    let raw = {};
    if (text) {
      try {
        raw = JSON.parse(text);
      } catch {
        raw = { raw: text };
      }
    }
    return { ok: res.ok, status: res.status, value: raw.value, raw, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, value: void 0, raw: {}, text: message };
  }
}
function extractWebDriverElementId(value) {
  const record = typeof value === "object" && value !== null ? value : {};
  const elementId = record["element-6066-11e4-a52e-4f735466cecf"] ?? record.ELEMENT;
  return typeof elementId === "string" ? elementId : null;
}
function shouldRecoverMobileServer(res) {
  if (res.status === 0) return true;
  if (res.status === 502 || res.status === 503 || res.status === 504) return true;
  const blob = `${res.text ?? ""}`.toLowerCase();
  return blob.includes("econnrefused") || blob.includes("connection refused") || blob.includes("fetch failed") || blob.includes("network") || blob.includes("socket hang up") || blob.includes("econnreset") || blob.includes("enotfound");
}
function shouldRecoverWebDriverSession(res) {
  if (shouldRecoverMobileServer(res)) return false;
  if (res.status === 404) return true;
  const blob = `${res.text ?? ""} ${JSON.stringify(res.raw ?? {})}`.toLowerCase();
  return blob.includes("invalid session") || blob.includes("session does not exist") || blob.includes("session not created") || blob.includes("no such session");
}
async function withMobileHttpRecovery(attempt, opts) {
  let res = await attempt();
  const cooldown = opts.restartCooldownMs ?? 3e4;
  const canRestart = !opts.lastServerRestartAt || Date.now() - opts.lastServerRestartAt.value >= cooldown;
  if (opts.restartServer && shouldRecoverMobileServer(res) && canRestart) {
    const restarted = await opts.restartServer();
    if (restarted) {
      if (opts.lastServerRestartAt) opts.lastServerRestartAt.value = Date.now();
      res = await attempt();
    }
  }
  if (shouldRecoverWebDriverSession(res)) {
    await opts.recoverSession();
    res = await attempt();
  }
  return res;
}
function invokeFail(command, code, message) {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}
function safeJson(value) {
  if (value === void 0) return { __undefined: true };
  if (value === null || typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}
async function executeMobileHttpInvoke(command, opts) {
  let requestUrl = resolveMobileHttpPath(opts.baseUrl, opts.invoke.path, opts.sessionId);
  const res = await withMobileHttpRecovery(
    () => {
      requestUrl = resolveMobileHttpPath(opts.baseUrl, opts.invoke.path, opts.sessionId);
      return fetchWebDriverJson(opts.invoke.method, requestUrl, opts.invoke.body);
    },
    {
      recoverSession: async () => {
        await opts.recoverSession?.();
      },
      restartServer: opts.restartServer,
      restartCooldownMs: opts.restartCooldownMs,
      lastServerRestartAt: opts.lastServerRestartAt
    }
  );
  if (!res.ok) {
    const detail = res.text || JSON.stringify(res.raw ?? {});
    return invokeFail(command, "INVOKE_HTTP_FAILED", `HTTP ${res.status} ${requestUrl}: ${detail}`);
  }
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: opts.driver,
      platform: opts.platform,
      command: "invoke",
      mode: "real",
      rpcMode: "http",
      http: { method: opts.invoke.method, path: opts.invoke.path, url: requestUrl },
      status: res.status,
      value: safeJson(res.value ?? res.raw)
    }
  };
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

// ../../plugins/driver-ios/src/recipe-context.ts
function buildIosRecipeContext(observe, control, screen, hooks) {
  const dumpCache = new UiDumpCache();
  return {
    platform: "ios",
    screen,
    heuristics: hooks.heuristics,
    invalidateDumpCache() {
      dumpCache.invalidate();
    },
    async getDumpRaw() {
      if (!observe.pageSource) throw new Error("pageSource not available");
      return dumpCache.getOrLoad(() => observe.pageSource());
    },
    async dumpUi() {
      const raw = await this.getDumpRaw();
      return parseAndroidHierarchy(raw);
    },
    async clickPoint(point) {
      dumpCache.invalidate();
      await hooks.tapAt(point);
    },
    async typeAt(point, text) {
      dumpCache.invalidate();
      await hooks.tapAt(point);
      await hooks.sendKeys(text);
    },
    async typeFocused(text) {
      dumpCache.invalidate();
      await hooks.sendKeys(text);
    },
    async pressEnter() {
      await hooks.sendKeys("\n");
    },
    async pressBack() {
      dumpCache.invalidate();
      await control.back();
    }
  };
}

// ../../packages/install-deps/src/index.ts
init_dependency_installer();
init_deps_install_paths();
init_deps_resolution();
init_tools_paths();
init_registry_probe();
init_install_summary();
init_playwright_browser_install();
init_harmony_hdc_install();
init_android_uia2_bootstrap();
init_ios_wda_bootstrap();

// ../../packages/install-deps/src/mobile-server-restart.ts
init_src3();
init_android_uia2_bootstrap();
init_ios_wda_bootstrap();
async function restartIosWdaServer(options) {
  if (!wdaBootstrapEnabled()) return false;
  await ensureIosWdaBootstrap({ force: options?.force ?? true, onLogLine: options?.onLogLine });
  const probe = await probeWdaStatus();
  return probe.reachable;
}

// ../../packages/install-deps/src/task-runtime-probe.ts
init_src3();

// ../../plugins/driver-ios/src/wda-http-adapter.ts
init_src3();
var import_promises4 = __toESM(require("node:fs/promises"), 1);
var import_node_path6 = __toESM(require("node:path"), 1);

// ../../plugins/driver-ios/src/device-admin.ts
var import_node_child_process3 = require("node:child_process");
var import_node_path5 = __toESM(require("node:path"), 1);
async function wdaGet(session, wdaFetch, subPath) {
  return wdaFetch("GET", `${session.serverUrl}/session/${session.sessionId}${subPath}`);
}
async function wdaPost(session, wdaFetch, subPath, body) {
  return wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}${subPath}`, body);
}
async function runHostTool(bin, args) {
  return new Promise((resolve) => {
    const child = (0, import_node_child_process3.spawn)(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => resolve({ ok: code === 0, stdout, stderr }));
    child.on("error", (e) => resolve({ ok: false, stdout: "", stderr: String(e) }));
  });
}
async function executeIosDeviceAdmin(command, session, payload, wdaFetch, tapAt) {
  const action = readDeviceAdminAction(payload);
  if (!action) return deviceAdminFail(command, "DEVICE_ADMIN_ACTION_MISSING", "payload.action required");
  const appId = String(payload.appId ?? payload.bundleId ?? "").trim();
  switch (action) {
    case "listApps": {
      const res = await wdaGet(session, wdaFetch, "/wda/apps/list");
      if (res.ok && res.value) {
        const apps = Array.isArray(res.value) ? res.value : res.value.apps;
        const packages = Array.isArray(apps) ? apps.map((a) => typeof a === "string" ? a : String(a.bundleId ?? "")).filter(Boolean) : [];
        return deviceAdminSuccess(command, action, { packages, count: packages.length });
      }
      const idevice = await runHostTool("ideviceinstaller", ["-l", "-o", "list_user"]);
      if (idevice.ok) {
        const packages = idevice.stdout.split(/\r?\n/).map((l) => l.split(",")[0]?.trim()).filter((p) => p && !p.startsWith("CFBundle"));
        return deviceAdminSuccess(command, action, { packages, count: packages.length, source: "ideviceinstaller" });
      }
      return deviceAdminFail(command, "IOS_LIST_APPS_UNSUPPORTED", "WDA /wda/apps/list and ideviceinstaller unavailable");
    }
    case "appInfo": {
      if (!appId) return deviceAdminFail(command, "IOS_APP_ID_MISSING", "appId required");
      const res = await runHostTool("ideviceinstaller", ["-l", "-o", "lookup", appId]);
      if (!res.ok) {
        return deviceAdminSuccess(command, action, { appId, bundleId: appId, note: "limited info without ideviceinstaller" });
      }
      return deviceAdminSuccess(command, action, { appId, bundleId: appId, raw: res.stdout.slice(0, 2e3) });
    }
    case "isInstalled": {
      if (!appId) return deviceAdminFail(command, "IOS_APP_ID_MISSING", "appId required");
      const list = await executeIosDeviceAdmin(
        { ...command, command: "deviceAdmin" },
        session,
        { ...payload, action: "listApps" },
        wdaFetch,
        tapAt
      );
      if (!list.success) return list;
      const packages = list.data?.packages ?? [];
      return deviceAdminSuccess(command, action, { appId, installed: packages.includes(appId) });
    }
    case "installApp": {
      const localPath = import_node_path5.default.resolve(String(payload.path ?? payload.localPath ?? ""));
      if (!localPath) return deviceAdminFail(command, "IOS_INSTALL_PATH_MISSING", "path required");
      const res = await runHostTool("ideviceinstaller", ["-i", localPath]);
      if (!res.ok) return deviceAdminFail(command, "IOS_INSTALL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { path: localPath, output: res.stdout.trim() });
    }
    case "uninstallApp": {
      if (!appId) return deviceAdminFail(command, "IOS_APP_ID_MISSING", "appId required");
      const res = await runHostTool("ideviceinstaller", ["-U", appId]);
      if (!res.ok) {
        const term = await wdaPost(session, wdaFetch, "/wda/apps/terminate", { bundleId: appId });
        if (!term.ok) return deviceAdminFail(command, "IOS_UNINSTALL_FAILED", res.stderr || res.stdout);
        return deviceAdminSuccess(command, action, { appId, terminated: true });
      }
      return deviceAdminSuccess(command, action, { appId, output: res.stdout.trim() });
    }
    case "pushFile":
    case "pullFile":
      return deviceAdminFail(
        command,
        "IOS_FILE_TRANSFER_UNSUPPORTED",
        "use host tools (ifuse/devicectl) or MCP invoke; not in deviceAdmin yet"
      );
    case "shell":
    case "hdc":
      return deviceAdminFail(command, "IOS_SHELL_UNSUPPORTED", "iOS has no adb/hdc shell; use WDA invoke");
    case "currentApp": {
      const res = await wdaFetch("GET", `${session.serverUrl}/wda/activeAppInfo`);
      if (!res.ok || !res.value) {
        return deviceAdminFail(command, "IOS_CURRENT_APP_FAILED", JSON.stringify(res.raw ?? {}));
      }
      const v = res.value;
      const bundleId = String(v.bundleId ?? v.bundleID ?? "");
      return deviceAdminSuccess(command, action, {
        appId: bundleId,
        package: bundleId,
        name: v.name,
        pid: v.pid
      });
    }
    case "clearAppData":
      return deviceAdminFail(command, "IOS_CLEAR_DATA_UNSUPPORTED", "reinstall app or use host tools");
    case "openUrl": {
      const url = String(payload.url ?? "").trim();
      if (!url) return deviceAdminFail(command, "IOS_URL_MISSING", "url required");
      const res = await wdaPost(session, wdaFetch, "/url", { url });
      if (!res.ok) return deviceAdminFail(command, "IOS_OPEN_URL_FAILED", JSON.stringify(res.raw ?? {}));
      return deviceAdminSuccess(command, action, { url });
    }
    case "pressKey": {
      const key = String(payload.key ?? "").toLowerCase();
      const map = {
        home: "/wda/homescreen",
        volumeup: "/wda/pressButton",
        volumedown: "/wda/pressButton"
      };
      if (key === "home") {
        const res = await wdaFetch("POST", `${session.serverUrl}/wda/homescreen`);
        if (!res.ok) return deviceAdminFail(command, "IOS_PRESS_KEY_FAILED", JSON.stringify(res.raw ?? {}));
        return deviceAdminSuccess(command, action, { key });
      }
      if (key === "volumeup" || key === "volumedown") {
        const res = await wdaPost(session, wdaFetch, "/wda/pressButton", {
          name: key === "volumeup" ? "volumeUp" : "volumeDown"
        });
        if (!res.ok) return deviceAdminFail(command, "IOS_PRESS_KEY_FAILED", JSON.stringify(res.raw ?? {}));
        return deviceAdminSuccess(command, action, { key });
      }
      return deviceAdminFail(command, "IOS_PRESS_KEY_UNSUPPORTED", `key=${key}`);
    }
    case "longPress": {
      const ms = Math.max(300, Number(payload.durationMs ?? payload.ms ?? 800));
      const sec = ms / 1e3;
      const point = payload.point;
      const elementId = String(payload.elementId ?? "");
      if (elementId) {
        const res = await wdaPost(session, wdaFetch, `/element/${elementId}/touchAndHold`, { duration: sec });
        if (!res.ok) {
          return deviceAdminFail(command, "IOS_LONG_PRESS_FAILED", JSON.stringify(res.raw ?? {}));
        }
        return deviceAdminSuccess(command, action, { elementId, durationMs: ms });
      }
      if (point) {
        const res = await wdaPost(session, wdaFetch, "/wda/touchAndHold", { x: point[0], y: point[1], duration: sec });
        if (!res.ok) {
          await tapAt([Math.round(point[0]), Math.round(point[1])]);
          return deviceAdminSuccess(command, action, { point, durationMs: ms, fallback: "tap" });
        }
        return deviceAdminSuccess(command, action, { point, durationMs: ms });
      }
      return deviceAdminFail(command, "IOS_LONG_PRESS_TARGET", "point or elementId required");
    }
    case "setClipboard": {
      const text = String(payload.text ?? "");
      const res = await wdaPost(session, wdaFetch, "/wda/setPasteboard", { content: text });
      if (!res.ok) return deviceAdminFail(command, "IOS_SET_CLIPBOARD_FAILED", JSON.stringify(res.raw ?? {}));
      return deviceAdminSuccess(command, action, { length: text.length });
    }
    case "getClipboard": {
      const res = await wdaGet(session, wdaFetch, "/wda/getPasteboard");
      if (!res.ok) return deviceAdminFail(command, "IOS_GET_CLIPBOARD_FAILED", JSON.stringify(res.raw ?? {}));
      return deviceAdminSuccess(command, action, { text: String(res.value ?? "") });
    }
    case "deviceInfo": {
      const screen = await wdaFetch("GET", `${session.serverUrl}/wda/screen`);
      const active = await wdaFetch("GET", `${session.serverUrl}/wda/activeAppInfo`);
      return deviceAdminSuccess(command, action, {
        platform: "ios",
        screen: screen.value,
        activeApp: active.value,
        sessionId: session.sessionId
      });
    }
    case "grantPermission":
      return deviceAdminFail(command, "IOS_GRANT_PERMISSION_UNSUPPORTED", "manual or XCTest only");
    case "setOrientation": {
      const orientation = normalizeOrientation(String(payload.orientation ?? "portrait"));
      const res = await wdaPost(session, wdaFetch, "/orientation", { orientation });
      if (!res.ok) return deviceAdminFail(command, "IOS_ORIENTATION_FAILED", JSON.stringify(res.raw ?? {}));
      return deviceAdminSuccess(command, action, { orientation });
    }
    case "startScreenRecord":
    case "stopScreenRecord":
      return deviceAdminFail(command, "IOS_SCREEN_RECORD_UNSUPPORTED", "use host QuickTime/simctl for simulators");
    case "reboot":
      return deviceAdminFail(command, "IOS_REBOOT_UNSUPPORTED", "not supported via WDA");
    default:
      return deviceAdminFail(command, "DEVICE_ADMIN_UNSUPPORTED", `unsupported action: ${action}`);
  }
}

// ../../plugins/driver-ios/src/wda-http-adapter.ts
function fail(command, code, message) {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}
function ensurePoint2(v) {
  if (!v || v.length !== 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(x), Math.round(y)];
}
function ensureElementCache(session) {
  if (!session.elementCache) {
    session.elementCache = new ElementIdCache();
  }
  return session.elementCache;
}
function invalidateElementCache(session) {
  session.elementCache?.clear();
}
async function findElement(session, payload, wdaFetch) {
  if (payload.elementId) return { ok: true, elementId: payload.elementId };
  const cacheKey = locatorCacheKey(payload.locator);
  if (cacheKey) {
    const cached = ensureElementCache(session).get(cacheKey);
    if (cached) return { ok: true, elementId: cached };
  }
  const locator = payload.locator;
  if (!locator) return { ok: false, code: "IOS_LOCATOR_MISSING", message: "missing locator or point" };
  let using = "";
  let value = "";
  if (locator.id) {
    using = "id";
    value = locator.id;
  } else if (locator.accessibilityId) {
    using = "accessibility id";
    value = locator.accessibilityId;
  } else if (locator.xpath) {
    using = "xpath";
    value = locator.xpath;
  } else {
    return { ok: false, code: "IOS_LOCATOR_UNSUPPORTED", message: "unsupported locator type" };
  }
  const res = await retryAsync(
    () => wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/element`, { using, value }),
    { attempts: 3, delayMs: 500 }
  ).catch(() => ({ ok: false, status: 0, value: void 0, raw: {} }));
  if (!res.ok) return { ok: false, code: "IOS_LOCATOR_LOOKUP_FAILED", message: JSON.stringify(res.raw ?? {}) };
  const elementId = extractWebDriverElementId(res.value);
  if (!elementId) return { ok: false, code: "IOS_ELEMENT_NOT_FOUND", message: "element id missing" };
  if (cacheKey) {
    ensureElementCache(session).set(cacheKey, elementId);
  }
  return { ok: true, elementId };
}
async function tapAtPoint(session, point, wdaFetch) {
  const [x, y] = point;
  const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/wda/tap/0`, { x, y });
  if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
}
async function executeInvoke(session, command, payload, recoverSession) {
  const invoke = normalizeInvokePayload(payload, "http");
  if (!invoke?.http?.method || !invoke.http.path) {
    return fail(
      command,
      "INVOKE_INVALID_PAYLOAD",
      "invoke requires http.method and http.path (or legacy custom.method/path)"
    );
  }
  return executeMobileHttpInvoke(command, {
    baseUrl: session.serverUrl,
    sessionId: session.sessionId,
    invoke: invoke.http,
    driver: "ios",
    platform: "ios",
    recoverSession,
    restartServer: () => restartIosWdaServer(),
    lastServerRestartAt: WdaClientAdapter.lastServerRestartAt
  });
}
var WdaClientAdapter = class _WdaClientAdapter {
  name = "wda-http-adapter";
  static lastServerRestartAt = { value: 0 };
  async recoverWdaSession(session, payload) {
    await this.destroySession(session).catch(() => void 0);
    invalidateElementCache(session);
    const fresh = await this.createSession(payload);
    session.sessionId = fresh.sessionId;
    session.serverUrl = fresh.serverUrl;
    session.signature = fresh.signature;
    session.elementCache = fresh.elementCache;
  }
  bindWdaFetch(session, payload) {
    const recoverSession = () => this.recoverWdaSession(session, payload);
    const restartServer = () => restartIosWdaServer();
    return (method, url, body) => withMobileHttpRecovery(() => fetchWebDriverJson(method, url, body), {
      recoverSession,
      restartServer,
      lastServerRestartAt: _WdaClientAdapter.lastServerRestartAt
    });
  }
  async createWdaSession(serverUrl, payload) {
    const res = await withMobileHttpRecovery(
      () => fetchWebDriverJson("POST", `${serverUrl}/session`, { capabilities: capsOf(payload) }),
      {
        recoverSession: async () => void 0,
        restartServer: () => restartIosWdaServer(),
        lastServerRestartAt: _WdaClientAdapter.lastServerRestartAt
      }
    );
    const value = res.value ?? {};
    const sessionId = value.sessionId;
    if (!res.ok || typeof sessionId !== "string") {
      throw new Error(`create session failed: ${JSON.stringify(res.raw ?? {})}`);
    }
    return { sessionId, serverUrl, signature: iosSessionSignature(payload), elementCache: new ElementIdCache() };
  }
  async createSession(payload) {
    if (payload.mock === true) {
      return {
        sessionId: `mock-ios-${Date.now()}`,
        serverUrl: "mock",
        signature: iosSessionSignature(payload),
        elementCache: new ElementIdCache()
      };
    }
    const serverUrl = serverUrlOf(payload);
    return this.createWdaSession(serverUrl, payload);
  }
  async execute(session, command, payload) {
    if (payload.mock === true) {
      if (command.command === "invoke") {
        const invoke = normalizeInvokePayload(payload, "http");
        if (!invoke?.http?.method || !invoke.http.path) {
          return fail(command, "INVOKE_INVALID_PAYLOAD", "invoke requires http.method and http.path");
        }
        return {
          requestId: command.requestId,
          success: true,
          data: {
            driver: "ios",
            platform: "ios",
            command: "invoke",
            mode: "mock",
            rpcMode: "http",
            http: invoke.http
          }
        };
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "ios", platform: "ios", command: command.command, mode: "mock" }
      };
    }
    const wdaFetch = this.bindWdaFetch(session, payload);
    const recoverSession = () => this.recoverWdaSession(session, payload);
    const control = {
      click: async (elementId) => {
        const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/element/${elementId}/click`);
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      type: async (elementId, text) => {
        const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/element/${elementId}/value`, {
          value: Array.from(text)
        });
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      swipe: async (from, to, durationSec = 0.3) => {
        const res = await wdaFetch(
          "POST",
          `${session.serverUrl}/session/${session.sessionId}/wda/dragfromtoforduration`,
          { fromX: from[0], fromY: from[1], toX: to[0], toY: to[1], duration: durationSec }
        );
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      back: async () => {
        const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/back`);
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      home: async () => {
        const res = await wdaFetch("POST", `${session.serverUrl}/wda/homescreen`);
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      launchApp: async (bundleId) => {
        const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/wda/apps/launch`, { bundleId });
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      },
      exitApp: async (bundleId) => {
        const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/wda/apps/terminate`, { bundleId });
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
      }
    };
    const observe = {
      screenshot: async (outputPath) => {
        const res = await wdaFetch("GET", `${session.serverUrl}/session/${session.sessionId}/screenshot`);
        if (!res.ok || typeof res.value !== "string") throw new Error(JSON.stringify(res.raw ?? {}));
        await import_promises4.default.mkdir(import_node_path6.default.dirname(outputPath), { recursive: true });
        await import_promises4.default.writeFile(outputPath, Buffer.from(res.value, "base64"));
        return outputPath;
      },
      pageSource: async () => {
        const res = await wdaFetch("GET", `${session.serverUrl}/session/${session.sessionId}/source`);
        if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
        return String(res.value ?? "");
      }
    };
    if (command.command === "wait") {
      const timeoutMs = typeof payload.timeoutMs === "number" ? Math.max(0, payload.timeoutMs) : 300;
      await new Promise((r) => setTimeout(r, timeoutMs));
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "wait", timeoutMs } };
    }
    if (command.command === "back") {
      await control.back();
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "back" } };
    }
    if (command.command === "pressHome" || command.command === "home") {
      await control.home();
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "pressHome" } };
    }
    if (command.command === "screenshot") {
      const output = payload.screenshotPath ?? import_node_path6.default.join(process.cwd(), "artifacts", `${command.requestId}-ios.png`);
      await observe.screenshot(output);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "screenshot", screenshot: output } };
    }
    if (command.command === "swipe") {
      const from = ensurePoint2(payload.from);
      const to = ensurePoint2(payload.to);
      if (!from || !to) return fail(command, "IOS_SWIPE_MISSING_POINTS", "swipe requires from/to");
      const screen = {
        width: Number(payload.screenWidth ?? 390),
        height: Number(payload.screenHeight ?? 844)
      };
      const relative = payload.relative === true;
      const norm = normalizedSwipePoints2(screen, from, to, { relative });
      const durationMs = resolveSwipeDurationMs(payload, { fallbackMs: 300 });
      const legacyMs = typeof payload.timeoutMs === "number" && payload.durationMs === void 0 && payload.swipePreset === void 0 ? Math.max(100, payload.timeoutMs) : durationMs;
      await control.swipe(norm.from, norm.to, Math.max(0.1, legacyMs / 1e3));
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "swipe", from: norm.from, to: norm.to } };
    }
    if (command.command === "pinch") {
      const ends = readPinchEndsFromPayload(payload);
      if (!ends) return fail(command, "IOS_PINCH_MISSING_POINTS", "pinch requires finger1/finger2/finger1End/finger2End");
      const durationMs = resolveSwipeDurationMs(payload, { fallbackMs: 400 });
      const legacySec = Math.max(0.1, durationMs / 1e3);
      await Promise.all([
        control.swipe(ends.finger1Start, ends.finger1End, legacySec),
        control.swipe(ends.finger2Start, ends.finger2End, legacySec)
      ]);
      invalidateElementCache(session);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "ios", command: "pinch", durationMs, pinchIn: payload.pinchIn }
      };
    }
    if (command.command === "deviceAdmin") {
      return executeIosDeviceAdmin(
        command,
        session,
        payload,
        wdaFetch,
        (point) => tapAtPoint(session, point, wdaFetch)
      );
    }
    if (command.command === "launchApp" || command.command === "exitApp") {
      const appId = String(payload.bundleId ?? payload.appId ?? "");
      if (!appId) return fail(command, "IOS_BUNDLE_ID_MISSING", "launch/exit requires bundleId");
      if (command.command === "launchApp") {
        await control.launchApp(appId);
      } else {
        await control.exitApp(appId);
      }
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: command.command, bundleId: appId } };
    }
    if (command.command === "invoke") {
      return executeInvoke(session, command, payload, recoverSession);
    }
    if (command.command === "custom") {
      const rawAction = String(payload.custom?.action ?? payload.custom?.method ?? "");
      const action = normalizeMobileCustomAction(rawAction, payload.custom?.method);
      if (["dump_ui", "tap_search", "fill_search"].includes(action)) {
        const screen = {
          width: Number(payload.screenWidth ?? 390),
          height: Number(payload.screenHeight ?? 844)
        };
        const ctx = buildIosRecipeContext(observe, control, screen, {
          tapAt: (point) => tapAtPoint(session, point, wdaFetch),
          sendKeys: async (text) => {
            const res = await wdaFetch("POST", `${session.serverUrl}/session/${session.sessionId}/wda/keys`, {
              value: Array.from(text)
            });
            if (!res.ok) throw new Error(JSON.stringify(res.raw ?? {}));
          },
          heuristics: parseUiHeuristicsFromPayload(payload)
        });
        const outcome = await runMobileCustomAction(action, ctx, {
          text: String(payload.text ?? payload.custom?.text ?? ""),
          maxBack: typeof payload.custom?.maxBack === "number" ? payload.custom.maxBack : 3,
          payload
        });
        if (outcome.handled) {
          const ok = outcome.recipe?.ok !== false;
          invalidateElementCache(session);
          return {
            requestId: command.requestId,
            success: ok,
            ...ok ? {
              data: {
                driver: "ios",
                command: "custom",
                action,
                value: outcome.value,
                recipe: outcome.recipe
              }
            } : {
              errorCode: outcome.errorCode ?? outcome.recipe?.errorCode ?? platformRecipeErrorCode("ios", action),
              errorMessage: outcome.recipe?.detail ?? "recipe failed"
            }
          };
        }
      }
      const method = String(payload.custom?.method ?? "").toLowerCase();
      if (method === "page_source") {
        const source = await observe.pageSource?.();
        return { requestId: command.requestId, success: true, data: { driver: "ios", command: "custom", action: "page_source", value: source ?? "" } };
      }
      return fail(
        command,
        "IOS_CUSTOM_UNSUPPORTED",
        "supported custom: dump_ui|tap_search|fill_search|method=page_source"
      );
    }
    if (command.command === "click") {
      const point = ensurePoint2(payload.point);
      if (point) {
        await tapAtPoint(session, point, wdaFetch);
        invalidateElementCache(session);
        return { requestId: command.requestId, success: true, data: { driver: "ios", command: "click", point } };
      }
    }
    const el = await findElement(session, payload, wdaFetch);
    if (!el.ok) return fail(command, el.code, el.message);
    if (command.command === "click") {
      await control.click(el.elementId);
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "click" } };
    }
    if (command.command === "type") {
      const text = String(payload.text ?? "");
      await control.type(el.elementId, text);
      invalidateElementCache(session);
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "type" } };
    }
    if (command.command === "getText" || command.command === "assertText") {
      const res = await wdaFetch("GET", `${session.serverUrl}/session/${session.sessionId}/element/${el.elementId}/text`);
      if (!res.ok) return fail(command, "IOS_GET_TEXT_FAILED", JSON.stringify(res.raw ?? {}));
      const text = String(res.value ?? "");
      if (command.command === "assertText") {
        const expected = String(payload.expectedText ?? payload.text ?? "");
        if (!text.includes(expected)) return fail(command, "IOS_ASSERT_TEXT_FAILED", `expected "${expected}", got "${text}"`);
      }
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: command.command, text } };
    }
    if (command.command === "assertVisible") {
      const res = await wdaFetch("GET", `${session.serverUrl}/session/${session.sessionId}/element/${el.elementId}/displayed`);
      if (!res.ok || !res.value) return fail(command, "IOS_ASSERT_VISIBLE_FAILED", JSON.stringify(res.raw ?? {}));
      return { requestId: command.requestId, success: true, data: { driver: "ios", command: "assertVisible" } };
    }
    return fail(command, "IOS_UNSUPPORTED_COMMAND", `unsupported command: ${command.command}`);
  }
  async destroySession(session) {
    if (session.serverUrl === "mock") return;
    await fetchWebDriverJson("DELETE", `${session.serverUrl}/session/${session.sessionId}`).catch(() => void 0);
  }
};

// ../../plugins/driver-ios/src/index.ts
var adapter = new WdaClientAdapter();
var sessions = /* @__PURE__ */ new Map();
var iosPlugin = {
  manifest: {
    id: "driver-ios",
    version: "1.0.0",
    engine: "ios",
    platforms: ["ios"],
    capabilities: ["click", "type", "swipe", "pinch", "assertVisible", "screenshot", "wait", "getText", "assertText", "back", "pressHome", "home", "launchApp", "exitApp", "recipe", "custom", "deviceAdmin", "invoke"],
    semanticCommands: ["click", "type", "swipe", "pinch", "assertVisible", "screenshot", "wait", "getText", "assertText", "back", "pressHome", "home", "launchApp", "exitApp", "recipe", "custom", "deviceAdmin"],
    invoke: { modes: ["http"], targets: ["session"] }
  },
  async init() {
  },
  async createSession(platform) {
    return { id: `ios-${Date.now()}`, platform: platform === "ios" ? platform : "ios" };
  },
  async execute(session, command) {
    const payload = command.payload ?? {};
    const nextSignature = iosSessionSignature(payload);
    let state = sessions.get(session.id);
    if (!state || state.signature !== nextSignature) {
      if (state) {
        await adapter.destroySession(state).catch(() => void 0);
      }
      state = await adapter.createSession(payload);
      sessions.set(session.id, state);
    }
    return adapter.execute(state, command, payload);
  },
  async destroySession(session) {
    const state = sessions.get(session.id);
    if (!state) return;
    sessions.delete(session.id);
    await adapter.destroySession(state).catch(() => void 0);
  },
  async dispose() {
    const all = Array.from(sessions.values());
    sessions.clear();
    await Promise.allSettled(all.map((s) => adapter.destroySession(s)));
  },
  forceDispose() {
    const all = Array.from(sessions.values());
    sessions.clear();
    for (const s of all) {
      void adapter.destroySession(s).catch(() => void 0);
    }
  }
};
var index_default = iosPlugin;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  iosSessionSignature
});
