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

// ../../packages/core-runtime/src/ada-home.ts
function isFilesystemRootPath(dir) {
  const resolved = import_node_path.default.resolve(dir);
  const parsed = import_node_path.default.parse(resolved);
  return resolved === parsed.root || import_node_path.default.dirname(resolved) === parsed.root;
}
function resolveUserHomeDirSync() {
  const candidates = [
    import_node_os.default.homedir(),
    process.env.HOME,
    process.env.USERPROFILE,
    process.platform === "win32" && process.env.SystemDrive && process.env.USERNAME ? import_node_path.default.join(process.env.SystemDrive, "Users", process.env.USERNAME) : void 0
  ].filter((x) => typeof x === "string" && x.trim().length > 0);
  for (const candidate of candidates) {
    const resolved = import_node_path.default.resolve(candidate.trim());
    if (!isFilesystemRootPath(resolved)) {
      return resolved;
    }
  }
  return process.platform === "win32" ? import_node_path.default.join("C:", "Users", "Default") : "/tmp";
}
function resolveGlobalAdaHomeSync() {
  const override = process.env.ADA_HOME?.trim();
  if (override) {
    const resolved = import_node_path.default.resolve(override);
    if (!isFilesystemRootPath(resolved)) {
      return resolved;
    }
  }
  return import_node_path.default.join(resolveUserHomeDirSync(), ".ada");
}
var import_node_os, import_node_path;
var init_ada_home = __esm({
  "../../packages/core-runtime/src/ada-home.ts"() {
    "use strict";
    import_node_os = __toESM(require("node:os"), 1);
    import_node_path = __toESM(require("node:path"), 1);
  }
});

// ../../packages/core-runtime/src/ada-env.ts
function firstEnv(...names) {
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return void 0;
}
function uiDumpCacheTtlMsFromEnv(defaultMs = 2e3) {
  const raw = firstEnv("ADA_UI_DUMP_CACHE_MS", "ADA_ANDROID_HIERARCHY_CACHE_MS") ?? String(defaultMs);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : defaultMs;
}
var init_ada_env = __esm({
  "../../packages/core-runtime/src/ada-env.ts"() {
    "use strict";
  }
});

// ../../packages/core-runtime/src/index.ts
async function resolveWorkspaceRoot(configRelativePath, startDir = process.cwd()) {
  const exeDir = import_node_path2.default.dirname(process.execPath);
  if (exeDir && exeDir !== "." && exeDir.length > 1) {
    const besideExe = import_node_path2.default.join(exeDir, configRelativePath);
    try {
      await import_promises.default.access(besideExe);
      return exeDir;
    } catch {
    }
  }
  let current = startDir;
  for (let i = 0; i < 10; i += 1) {
    const candidate = import_node_path2.default.join(current, configRelativePath);
    try {
      await import_promises.default.access(candidate);
      return current;
    } catch {
      const parent = import_node_path2.default.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return startDir;
}
var import_promises, import_node_path2;
var init_src = __esm({
  "../../packages/core-runtime/src/index.ts"() {
    import_promises = __toESM(require("node:fs/promises"));
    import_node_path2 = __toESM(require("node:path"));
    init_ada_home();
    init_ada_env();
  }
});

// ../../packages/install-deps/src/install-progress.ts
var init_install_progress = __esm({
  "../../packages/install-deps/src/install-progress.ts"() {
    "use strict";
  }
});

// ../../packages/install-deps/src/log-locale.ts
var init_log_locale = __esm({
  "../../packages/install-deps/src/log-locale.ts"() {
    "use strict";
    init_install_progress();
  }
});

// ../../packages/install-deps/src/playwright-browsers-discovery.ts
var init_playwright_browsers_discovery = __esm({
  "../../packages/install-deps/src/playwright-browsers-discovery.ts"() {
    "use strict";
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
function resolveGlobalAdaHomeSync2() {
  return resolveGlobalAdaHomeSync();
}
var import_node_path3, DEFAULT_CONFIG_RELATIVE;
var init_deps_install_paths = __esm({
  "../../packages/install-deps/src/deps-install-paths.ts"() {
    "use strict";
    import_node_path3 = __toESM(require("node:path"), 1);
    init_src();
    init_playwright_browsers_discovery();
    init_log_locale();
    init_src();
    DEFAULT_CONFIG_RELATIVE = import_node_path3.default.join("config", "default.yaml");
  }
});

// ../../packages/install-deps/src/tools-paths.ts
function normalizeToolsRelativeSegment(relativeDir) {
  const trimmed = String(relativeDir ?? "").trim();
  if (!trimmed || trimmed === "." || trimmed === "/") {
    return DEFAULT_TOOLS_RELATIVE;
  }
  const withoutLeading = trimmed.replace(/^[/\\]+/, "");
  return withoutLeading || DEFAULT_TOOLS_RELATIVE;
}
function joinWorkspaceToolsDir(baseDir, relativeDir) {
  const rel = normalizeToolsRelativeSegment(relativeDir);
  const base = import_node_path4.default.resolve(baseDir);
  const parsed = import_node_path4.default.parse(base);
  if (base === parsed.root) {
    return import_node_path4.default.join(resolveGlobalAdaHomeSync2(), rel);
  }
  return import_node_path4.default.join(base, rel);
}
function isFilesystemRootToolsDir(dir) {
  const resolved = import_node_path4.default.resolve(dir);
  const parsed = import_node_path4.default.parse(resolved);
  return import_node_path4.default.dirname(resolved) === parsed.root;
}
function resolveAdaHomeToolsDir(relativeDir) {
  return import_node_path4.default.join(resolveGlobalAdaHomeSync2(), normalizeToolsRelativeSegment(relativeDir));
}
async function fileExists(filePath) {
  try {
    await import_promises2.default.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function toolsDirHasHdc(dir) {
  return fileExists(import_node_path4.default.join(dir, HDC_BIN));
}
function uniquePaths(paths) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of paths) {
    const normalized = import_node_path4.default.normalize(raw);
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
    return import_node_path4.default.dirname(import_node_path4.default.resolve(entry));
  } catch {
    return null;
  }
}
function walkUpToolsDirs(startDir, relativeDir, maxDepth = 10) {
  const rel = normalizeToolsRelativeSegment(relativeDir);
  const out = [];
  let dir = import_node_path4.default.resolve(startDir);
  for (let i = 0; i < maxDepth; i += 1) {
    out.push(joinWorkspaceToolsDir(dir, rel));
    const parent = import_node_path4.default.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return out;
}
async function workspaceToolsDirs(relativeDir, startDirs) {
  const rel = normalizeToolsRelativeSegment(relativeDir);
  const out = [];
  for (const start of startDirs) {
    try {
      const root = await resolveWorkspaceRoot2(start);
      out.push(joinWorkspaceToolsDir(root, rel));
    } catch {
    }
  }
  return out;
}
function filterSafeToolsDirCandidates(candidates) {
  return candidates.filter((c) => !isFilesystemRootToolsDir(c));
}
async function collectToolsDirCandidates(options) {
  const relativeDir = normalizeToolsRelativeSegment(options?.relativeDir);
  const startCwd = options?.cwd ?? resolveInstallContextCwd();
  const entryDir = mcpServerEntryDir();
  const execDir = import_node_path4.default.dirname(process.execPath);
  const adaHomeTools = resolveAdaHomeToolsDir(relativeDir);
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
    ...process.env.ADA_TOOLS_DIR?.trim() ? [import_node_path4.default.resolve(process.env.ADA_TOOLS_DIR.trim())] : [],
    ...await workspaceToolsDirs(relativeDir, startDirs),
    ...startDirs.flatMap((dir) => walkUpToolsDirs(dir, relativeDir)),
    adaHomeTools
  ]);
  return filterSafeToolsDirCandidates(candidates);
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
  const safe = filterSafeToolsDirCandidates(candidates);
  return safe[0] ?? adaHomeToolsFromOptions(options);
}
function adaHomeToolsFromOptions(options) {
  return resolveAdaHomeToolsDir(options?.relativeDir);
}
var import_promises2, import_node_path4, HDC_BIN, DEFAULT_TOOLS_RELATIVE;
var init_tools_paths = __esm({
  "../../packages/install-deps/src/tools-paths.ts"() {
    "use strict";
    import_promises2 = __toESM(require("node:fs/promises"), 1);
    import_node_path4 = __toESM(require("node:path"), 1);
    init_deps_install_paths();
    init_deps_install_paths();
    init_deps_install_paths();
    HDC_BIN = process.platform === "win32" ? "hdc.exe" : "hdc";
    DEFAULT_TOOLS_RELATIVE = "tools";
  }
});

// ../../packages/install-deps/src/deps-resolution.ts
var init_deps_resolution = __esm({
  "../../packages/install-deps/src/deps-resolution.ts"() {
    "use strict";
    init_deps_install_paths();
    init_log_locale();
  }
});

// ../../packages/install-deps/src/harmony-hdc-install.ts
var init_harmony_hdc_install = __esm({
  "../../packages/install-deps/src/harmony-hdc-install.ts"() {
    "use strict";
    init_tools_paths();
  }
});

// ../../packages/install-deps/src/platform-support.ts
var init_platform_support = __esm({
  "../../packages/install-deps/src/platform-support.ts"() {
    "use strict";
  }
});

// ../../packages/install-deps/src/install-summary.ts
var init_install_summary = __esm({
  "../../packages/install-deps/src/install-summary.ts"() {
    "use strict";
    init_log_locale();
    init_platform_support();
  }
});

// ../../packages/download-probe/src/log-locale.ts
var init_log_locale2 = __esm({
  "../../packages/download-probe/src/log-locale.ts"() {
    "use strict";
  }
});

// ../../packages/download-probe/src/download-probe.ts
var init_download_probe = __esm({
  "../../packages/download-probe/src/download-probe.ts"() {
    "use strict";
    init_log_locale2();
  }
});

// ../../packages/download-probe/src/mirror-candidates.ts
var DEFAULT_NPM_REGISTRY_CANDIDATES, DEFAULT_PLAYWRIGHT_HOST_CANDIDATES;
var init_mirror_candidates = __esm({
  "../../packages/download-probe/src/mirror-candidates.ts"() {
    "use strict";
    DEFAULT_NPM_REGISTRY_CANDIDATES = [
      "https://registry.npmmirror.com",
      "https://repo.huaweicloud.com/repository/npm",
      "https://registry.npmjs.org"
    ];
    DEFAULT_PLAYWRIGHT_HOST_CANDIDATES = [
      "https://cdn.playwright.dev",
      "https://cdn.npmmirror.com/binaries/playwright",
      "https://npmmirror.com/mirrors/playwright",
      "https://playwright.azureedge.net"
    ];
  }
});

// ../../packages/download-probe/src/index.ts
var init_src2 = __esm({
  "../../packages/download-probe/src/index.ts"() {
    init_download_probe();
    init_mirror_candidates();
  }
});

// ../../packages/install-deps/src/download-probe-persist.ts
var init_download_probe_persist = __esm({
  "../../packages/install-deps/src/download-probe-persist.ts"() {
    "use strict";
    init_src2();
    init_log_locale();
  }
});

// ../../packages/install-deps/src/pinned-playwright-version.ts
var PINNED_PLAYWRIGHT_VERSION;
var init_pinned_playwright_version = __esm({
  "../../packages/install-deps/src/pinned-playwright-version.ts"() {
    "use strict";
    PINNED_PLAYWRIGHT_VERSION = "1.59.1";
  }
});

// ../../packages/install-deps/src/registry-probe.ts
var PINNED_PLAYWRIGHT_VERSION2;
var init_registry_probe = __esm({
  "../../packages/install-deps/src/registry-probe.ts"() {
    "use strict";
    init_src2();
    init_pinned_playwright_version();
    PINNED_PLAYWRIGHT_VERSION2 = process.env.ADA_PLAYWRIGHT_VERSION?.trim() || PINNED_PLAYWRIGHT_VERSION;
  }
});

// ../../packages/install-deps/src/playwright-browser-install.ts
var init_playwright_browser_install = __esm({
  "../../packages/install-deps/src/playwright-browser-install.ts"() {
    "use strict";
    init_src2();
    init_deps_install_paths();
    init_deps_resolution();
    init_pinned_playwright_version();
  }
});

// ../../packages/runtime-probe/src/ios-wda-endpoint.ts
var init_ios_wda_endpoint = __esm({
  "../../packages/runtime-probe/src/ios-wda-endpoint.ts"() {
    "use strict";
  }
});

// ../../packages/runtime-probe/src/ios-wda-probe.ts
var init_ios_wda_probe = __esm({
  "../../packages/runtime-probe/src/ios-wda-probe.ts"() {
    "use strict";
    init_ios_wda_endpoint();
  }
});

// ../../packages/runtime-probe/src/android-uia2-endpoint.ts
function defaultAndroidLocalHost() {
  const fromEnv = process.env.ADA_ANDROID_LOCAL_HOST?.trim();
  if (fromEnv) return fromEnv;
  const uia2 = process.env.ADA_ANDROID_UIA2_SERVER_URL?.trim();
  if (uia2) {
    try {
      const host = new URL(uia2).hostname;
      if (host) return host;
    } catch {
    }
  }
  return "localhost";
}
function hasExplicitUia2ServerUrlEnv() {
  return Boolean(process.env.ADA_ANDROID_UIA2_SERVER_URL?.trim());
}
function uia2ServerUrlForLocalPort(localPort, host) {
  return `http://${host ?? defaultAndroidLocalHost()}:${localPort}`;
}
function defaultUia2ServerUrl() {
  const fromEnv = process.env.ADA_ANDROID_UIA2_SERVER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return uia2ServerUrlForLocalPort(8200);
}
function syncUia2ServerUrlEnv(url) {
  if (!hasExplicitUia2ServerUrlEnv()) {
    process.env.ADA_ANDROID_UIA2_SERVER_URL = url.replace(/\/$/, "");
  }
}
function resolveUia2UrlAfterForward(input, explicitServerUrl) {
  if (explicitServerUrl?.trim()) return explicitServerUrl.replace(/\/$/, "");
  if (hasExplicitUia2ServerUrlEnv()) return defaultUia2ServerUrl();
  return uia2ServerUrlForLocalPort(input.localPort);
}
var init_android_uia2_endpoint = __esm({
  "../../packages/runtime-probe/src/android-uia2-endpoint.ts"() {
    "use strict";
  }
});

// ../../packages/runtime-probe/src/android-uia2-probe.ts
function defaultUia2LocalPort() {
  const fromEnv = process.env.ADA_ANDROID_UIA2_LOCAL_PORT?.trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  try {
    const parsed = new URL(defaultUia2ServerUrl());
    const port = Number(parsed.port || 8200);
    if (Number.isFinite(port) && port > 0) return port;
  } catch {
  }
  return 8200;
}
function defaultUia2DevicePort() {
  const fromEnv = Number(process.env.ADA_ANDROID_UIA2_DEVICE_PORT ?? "6790");
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 6790;
}
function runAdbCapture(serial, args, pipeStdout = true) {
  const adbArgs = serial ? ["-s", serial, ...args] : args;
  return new Promise((resolve) => {
    const child = (0, import_node_child_process2.spawn)("adb", adbArgs, {
      stdio: pipeStdout ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "pipe"],
      shell: false,
      ...process.platform === "win32" ? { windowsHide: true } : {}
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      err += chunk.toString("utf8");
    });
    child.on("exit", (code) => resolve({ ok: code === 0, stdout: out, stderr: err }));
    child.on("error", (error) => resolve({ ok: false, stdout: "", stderr: String(error) }));
  });
}
async function resolveAndroidDeviceSerial(preferred) {
  const serial = preferred?.trim() || process.env.ADA_ANDROID_DEVICE_SN?.trim() || "";
  if (serial) return serial;
  const listed = await runAdbCapture("", ["devices"]);
  if (!listed.ok) return "";
  for (const line of listed.stdout.split(/\r?\n/).slice(1)) {
    const t = line.trim();
    if (!t || t.startsWith("*")) continue;
    const parts = t.split(/\s+/);
    if (parts.length >= 2 && parts[1] === "device") return parts[0];
  }
  return "";
}
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
function androidUia2BootstrapEnabled() {
  const raw = process.env.ADA_ANDROID_UIA2_BOOTSTRAP?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
async function probeAndroidUia2Runtime(options) {
  let serverUrl = (options?.serverUrl ?? defaultUia2ServerUrl()).replace(/\/$/, "");
  let forwarded = false;
  if (options?.ensureForward !== false) {
    const serial = await resolveAndroidDeviceSerial(options?.serial);
    if (serial) {
      const localPort = defaultUia2LocalPort();
      const devicePort = defaultUia2DevicePort();
      const fwd = await runAdbCapture(serial, ["forward", `tcp:${localPort}`, `tcp:${devicePort}`]);
      forwarded = fwd.ok;
      if (forwarded && !options?.serverUrl) {
        serverUrl = resolveUia2UrlAfterForward({ localPort }, options?.serverUrl);
        syncUia2ServerUrlEnv(serverUrl);
      }
    }
  }
  const status = await fetchMobileStatus(serverUrl);
  const reachable = status.ok;
  let detail = reachable ? `UIA2 reachable at ${serverUrl}` : `UIA2 not reachable at ${serverUrl}`;
  if (forwarded && !reachable) {
    detail += " (adb forward applied; server may not be running on device)";
  }
  return {
    serverUrl,
    reachable,
    forwarded,
    detail,
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
var import_node_child_process2;
var init_android_uia2_probe = __esm({
  "../../packages/runtime-probe/src/android-uia2-probe.ts"() {
    "use strict";
    import_node_child_process2 = require("node:child_process");
    init_android_uia2_endpoint();
    init_ios_wda_endpoint();
    init_android_uia2_endpoint();
  }
});

// ../../packages/runtime-probe/src/ios-iproxy.ts
var IPROXY_READY_TIMEOUT_MS;
var init_ios_iproxy = __esm({
  "../../packages/runtime-probe/src/ios-iproxy.ts"() {
    "use strict";
    init_runtime_probe();
    init_ios_wda_endpoint();
    init_ios_wda_probe();
    init_android_uia2_probe();
    init_ios_wda_endpoint();
    IPROXY_READY_TIMEOUT_MS = Number(process.env.ADA_IOS_IPROXY_READY_MS ?? 1e4);
  }
});

// ../../packages/runtime-probe/src/runtime-probe.ts
var init_runtime_probe = __esm({
  "../../packages/runtime-probe/src/runtime-probe.ts"() {
    "use strict";
    init_ios_wda_endpoint();
    init_ios_iproxy();
  }
});

// ../../packages/runtime-probe/src/ios-idevice-probe.ts
var init_ios_idevice_probe = __esm({
  "../../packages/runtime-probe/src/ios-idevice-probe.ts"() {
    "use strict";
    init_runtime_probe();
    init_ios_iproxy();
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

// ../../packages/runtime-probe/src/device-params-guide.ts
var init_device_params_guide = __esm({
  "../../packages/runtime-probe/src/device-params-guide.ts"() {
    "use strict";
    init_device_display();
  }
});

// ../../packages/runtime-probe/src/index.ts
var init_src3 = __esm({
  "../../packages/runtime-probe/src/index.ts"() {
    init_runtime_probe();
    init_android_uia2_endpoint();
    init_android_uia2_probe();
    init_ios_wda_probe();
    init_ios_wda_endpoint();
    init_ios_iproxy();
    init_ios_idevice_probe();
    init_device_scan();
    init_device_registry();
    init_device_display();
    init_device_params_guide();
  }
});

// ../../packages/install-deps/src/android-uia2-bootstrap.ts
function uia2BootstrapEnabled() {
  return androidUia2BootstrapEnabled();
}
function defaultApkUrls() {
  const version = process.env.ADA_ANDROID_UIA2_SERVER_RELEASE?.trim() || PINNED_UIA2_SERVER_VERSION;
  const settingsVersion = process.env.ADA_ANDROID_UIA2_SETTINGS_RELEASE?.trim() || PINNED_SETTINGS_VERSION;
  return {
    settings: process.env.ADA_ANDROID_UIA2_SETTINGS_APK_URL?.trim() || `https://github.com/appium/appium/settings/releases/download/v${settingsVersion}/settings_apk-debug.apk`,
    server: process.env.ADA_ANDROID_UIA2_SERVER_APK_URL?.trim() || `https://github.com/appium/appium-uiautomator2-server/releases/download/v${version}/appium-uiautomator2-server-v${version}.apk`,
    serverTest: process.env.ADA_ANDROID_UIA2_SERVER_TEST_APK_URL?.trim() || `https://github.com/appium/appium-uiautomator2-server/releases/download/v${version}/appium-uiautomator2-server-debug-androidTest.apk`
  };
}
async function pathExists(target) {
  try {
    await import_promises3.default.access(target);
    return true;
  } catch {
    return false;
  }
}
async function downloadFile(url, dest, onLogLine) {
  onLogLine?.(`[android-uia2] download ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed ${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await import_promises3.default.mkdir(import_node_path5.default.dirname(dest), { recursive: true });
  await import_promises3.default.writeFile(dest, buf);
}
async function ensureApkCached(name, url, cacheDir, onLogLine) {
  const fileName = import_node_path5.default.basename(new URL(url).pathname) || `${name}.apk`;
  const dest = import_node_path5.default.join(cacheDir, fileName);
  if (!await pathExists(dest)) {
    await downloadFile(url, dest, onLogLine);
  }
  return dest;
}
async function installApk(serial, apkPath) {
  const res = await runAdbCapture(serial, ["install", "-r", apkPath]);
  if (!res.ok) {
    throw new Error(`adb install failed for ${import_node_path5.default.basename(apkPath)}: ${res.stderr || res.stdout}`);
  }
}
function spawnInstrumentBackground(serial) {
  const args = serial ? [
    "-s",
    serial,
    "shell",
    "am",
    "instrument",
    "-w",
    "io.appium.uiautomator2.server.test/androidx.test.runner.AndroidJUnitRunner"
  ] : [
    "shell",
    "am",
    "instrument",
    "-w",
    "io.appium.uiautomator2.server.test/androidx.test.runner.AndroidJUnitRunner"
  ];
  const child = (0, import_node_child_process3.spawn)("adb", args, {
    stdio: "ignore",
    detached: true,
    shell: false,
    ...process.platform === "win32" ? { windowsHide: true } : {}
  });
  child.unref();
}
async function waitForUia2Ready(serverUrl, timeoutMs, onLogLine) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const probe = await probeAndroidUia2Runtime({ serverUrl, ensureForward: false });
    if (probe.reachable) {
      onLogLine?.(`[android-uia2] server ready at ${serverUrl}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 1e3));
  }
  return false;
}
async function ensureAndroidUia2Bootstrap(options) {
  const onLogLine = options?.onLogLine;
  const serverUrl = defaultUia2ServerUrl();
  const artifact = { id: "android-uia2", status: "skipped", detail: "bootstrap disabled" };
  if (!uia2BootstrapEnabled()) {
    const serial2 = await resolveAndroidDeviceSerial(options?.serial);
    if (!serial2) {
      artifact.status = "skipped";
      artifact.detail = "bootstrap disabled; no adb device (UIA2 deferred)";
      return { outcome: artifact, serverUrl };
    }
    const probe2 = await probeAndroidUia2Runtime({ serverUrl, serial: options?.serial, ensureForward: true });
    artifact.detail = `bootstrap disabled (set ADA_ANDROID_UIA2_BOOTSTRAP=true); ${probe2.detail}`;
    artifact.status = probe2.reachable ? "skipped" : "missing";
    return { outcome: artifact, serverUrl };
  }
  const serial = await resolveAndroidDeviceSerial(options?.serial);
  if (!serial) {
    artifact.status = "skipped";
    artifact.detail = "no adb device for UIA2 bootstrap (deferred until device connected)";
    return { outcome: artifact, serverUrl };
  }
  const localPort = defaultUia2LocalPort();
  const devicePort = defaultUia2DevicePort();
  await runAdbCapture(serial, ["forward", `tcp:${localPort}`, `tcp:${devicePort}`]);
  process.env.ADA_ANDROID_UIA2_SERVER_URL = serverUrl;
  process.env.ADA_ANDROID_DEVICE_SN = serial;
  let probe = await probeAndroidUia2Runtime({ serverUrl, serial, ensureForward: false });
  if (probe.reachable && !options?.force) {
    artifact.status = "skipped";
    artifact.detail = probe.detail;
    return { outcome: artifact, serverUrl };
  }
  const toolsDir = await resolveDefaultToolsDir() ?? import_node_path5.default.join(process.cwd(), "tools");
  const cacheDir = import_node_path5.default.join(toolsDir, "android-uia2");
  const urls = defaultApkUrls();
  try {
    onLogLine?.("[android-uia2] installing UiAutomator2 server APKs");
    const settingsApk = await ensureApkCached("settings", urls.settings, cacheDir, onLogLine);
    const serverApk = await ensureApkCached("server", urls.server, cacheDir, onLogLine);
    const serverTestApk = await ensureApkCached("server-test", urls.serverTest, cacheDir, onLogLine);
    await installApk(serial, settingsApk);
    await installApk(serial, serverApk);
    await installApk(serial, serverTestApk);
    onLogLine?.("[android-uia2] starting instrumentation (background)");
    spawnInstrumentBackground(serial);
    const ready = await waitForUia2Ready(serverUrl, 45e3, onLogLine);
    probe = await probeAndroidUia2Runtime({ serverUrl, serial, ensureForward: false });
    if (ready || probe.reachable) {
      artifact.status = "installed";
      artifact.detail = `UIA2 bootstrapped at ${serverUrl} (device ${serial})`;
    } else {
      artifact.status = "missing";
      artifact.detail = "UIA2 instrumentation started but /status not reachable within timeout";
    }
  } catch (error) {
    artifact.status = "missing";
    artifact.detail = error instanceof Error ? error.message : String(error);
    onLogLine?.(`[android-uia2][warn] ${artifact.detail}`);
  }
  return { outcome: artifact, serverUrl };
}
var import_promises3, import_node_path5, import_node_child_process3, PINNED_SETTINGS_VERSION, PINNED_UIA2_SERVER_VERSION;
var init_android_uia2_bootstrap = __esm({
  "../../packages/install-deps/src/android-uia2-bootstrap.ts"() {
    "use strict";
    import_promises3 = __toESM(require("node:fs/promises"), 1);
    import_node_path5 = __toESM(require("node:path"), 1);
    import_node_child_process3 = require("node:child_process");
    init_tools_paths();
    init_src3();
    PINNED_SETTINGS_VERSION = "5.14.0";
    PINNED_UIA2_SERVER_VERSION = "7.3.0";
  }
});

// ../../packages/install-deps/src/ios-wda-bootstrap.ts
var init_ios_wda_bootstrap = __esm({
  "../../packages/install-deps/src/ios-wda-bootstrap.ts"() {
    "use strict";
    init_tools_paths();
    init_src3();
  }
});

// ../../packages/install-deps/src/ios-libimobiledevice-install.ts
var init_ios_libimobiledevice_install = __esm({
  "../../packages/install-deps/src/ios-libimobiledevice-install.ts"() {
    "use strict";
    init_tools_paths();
    init_tools_paths();
  }
});

// ../../packages/install-deps/src/ios-idevice-bootstrap.ts
var init_ios_idevice_bootstrap = __esm({
  "../../packages/install-deps/src/ios-idevice-bootstrap.ts"() {
    "use strict";
    init_src3();
    init_ios_libimobiledevice_install();
    init_tools_paths();
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
    init_install_progress();
    init_log_locale();
    init_download_probe_persist();
    init_registry_probe();
    init_src2();
    init_src2();
    init_playwright_browser_install();
    init_playwright_browsers_discovery();
    init_src3();
    init_android_uia2_bootstrap();
    init_ios_wda_bootstrap();
    init_ios_libimobiledevice_install();
    init_ios_idevice_bootstrap();
    init_platform_support();
    init_pinned_playwright_version();
    init_deps_install_paths();
    HEALTH_CACHE_OK_MS = Number(process.env.ADA_DEPS_HEALTH_CACHE_MS ?? 9e4);
    PLAYWRIGHT_LAUNCH_OK_MS = Number(process.env.ADA_PLAYWRIGHT_LAUNCH_CACHE_MS ?? 12e4);
  }
});

// ../../plugins/driver-android/src/index.ts
var index_exports = {};
__export(index_exports, {
  androidSessionSignature: () => androidSessionSignature,
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);

// ../../packages/driver-rpc/src/session-defaults.ts
init_src();

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
  const json2 = env.ADA_UI_HEURISTICS_JSON?.trim();
  if (json2) {
    try {
      return JSON.parse(json2);
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

// ../../packages/driver-rpc/src/web-interaction-recipe.ts
function normalizeControlPath(path8) {
  if (!Array.isArray(path8)) return [];
  return path8.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0);
}

// ../../packages/driver-rpc/src/mobile-view-tree.ts
function nodeLabel2(node) {
  const text = node.text?.trim();
  if (text) return text;
  const desc = node.desc?.trim();
  if (desc) return desc;
  const id = node.id?.trim();
  if (id) {
    const short = id.includes("/") ? id.split("/").pop() : id;
    return short;
  }
  return "";
}
function normalizeLabel(value) {
  return value.trim().toLowerCase();
}
function shapeMobileViewTreeFlat(nodes, maxItems = 80) {
  const limit = Math.max(1, Math.floor(maxItems));
  const seen = /* @__PURE__ */ new Set();
  const flat = [];
  for (const node of nodes) {
    const name = nodeLabel2(node);
    if (!name && !node.clickable) continue;
    if (!node.clickable && !name) continue;
    const key = `${name}|${node.point[0]}|${node.point[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flat.push({
      name: name || "(node)",
      text: node.text?.trim() || void 0,
      desc: node.desc?.trim() || void 0,
      resourceId: node.id?.trim() || void 0,
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
function findMobileNodeForSegment(nodes, segment) {
  const target = normalizeLabel(segment);
  if (!target) return void 0;
  const candidates = nodes.filter((node) => node.clickable);
  const scored = candidates.map((node) => {
    const label = normalizeLabel(nodeLabel2(node));
    if (!label) return { node, score: -1 };
    if (label === target) return { node, score: 100 };
    if (label.includes(target) || target.includes(label)) return { node, score: 60 };
    return { node, score: -1 };
  }).filter((item) => item.score >= 0).sort((a, b) => b.score - a.score);
  return scored[0]?.node;
}

// ../../packages/driver-rpc/src/recipe-errors.ts
var RECIPE_ERROR_CODES = {
  TAP_SEARCH_FAILED: "RECIPE_TAP_SEARCH_FAILED",
  FILL_SEARCH_FAILED: "RECIPE_FILL_SEARCH_FAILED",
  FILL_SEARCH_NO_ENTRY: "RECIPE_FILL_SEARCH_NO_ENTRY",
  FILL_SEARCH_NO_INPUT: "RECIPE_FILL_SEARCH_NO_INPUT",
  FILL_SEARCH_TYPE_FAILED: "RECIPE_FILL_SEARCH_TYPE_FAILED",
  DUMP_UI_FAILED: "RECIPE_DUMP_UI_FAILED",
  FILL_SEARCH_MISSING_TEXT: "RECIPE_FILL_SEARCH_MISSING_TEXT",
  TAP_PATH_FAILED: "RECIPE_TAP_PATH_FAILED",
  TAP_PATH_SEGMENT_NOT_FOUND: "RECIPE_TAP_PATH_SEGMENT_NOT_FOUND"
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
    case "tap_path":
      return RECIPE_ERROR_CODES.TAP_PATH_FAILED;
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
  if (input && ctx.typeOnPick) {
    try {
      ctx.invalidateDumpCache?.();
      await ctx.typeOnPick(input, text);
      return "typeOnPick";
    } catch {
    }
  }
  if (ctx.typeFocused) {
    if (input?.kind === "input") {
      ctx.invalidateDumpCache?.();
      await clickUiPick(ctx, input);
      await recipeSettleDelay(ctx, payload, 350);
    }
    try {
      await ctx.typeFocused(text);
      return "typeFocused";
    } catch {
    }
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
    platform: ctx.platform === "android" ? "android" : ctx.platform === "harmony" ? "harmony" : void 0,
    heuristics: heuristics ?? ctx.heuristics
  });
}
function coordinateFallback(screen, kind) {
  const yRatio = kind === "entry" ? 0.11 : 0.12;
  return [Math.round(screen.width / 2), Math.round(screen.height * yRatio)];
}
async function clickUiPick(ctx, pick) {
  if (ctx.clickPick) {
    await ctx.clickPick(pick);
    return;
  }
  await ctx.clickPoint(pick.point);
}
async function tryHintChainFill(ctx, parsed, text, payload) {
  if (parsed.strict || !parsed.entryHints.length && !parsed.inputHints.length) return null;
  let nodes = await ctx.dumpUi();
  for (const hint of parsed.entryHints) {
    const entry = pickNodeByTextHints(nodes, [hint], "searchEntry", ctx.screen);
    if (entry) {
      ctx.invalidateDumpCache?.();
      await clickUiPick(ctx, entry);
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
      await clickUiPick(ctx, input);
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
  const { flat, truncated } = shapeMobileViewTreeFlat(nodes, 80);
  return {
    ok: true,
    phase: "dump_ui",
    detail: `nodes=${nodes.length}`,
    data: { nodeCount: nodes.length, flat, flatTruncated: truncated || void 0 }
  };
}
async function recipeTapPath(ctx, options) {
  const path8 = normalizeControlPath(options?.payload?.path);
  if (path8.length === 0) {
    return {
      ok: false,
      phase: "tap_path",
      detail: "tap_path requires non-empty path array",
      errorCode: RECIPE_ERROR_CODES.TAP_PATH_FAILED
    };
  }
  for (let i = 0; i < path8.length; i += 1) {
    const segment = path8[i] ?? "";
    const nodes = await dumpWithRetry(ctx);
    const target = findMobileNodeForSegment(nodes, segment);
    if (!target) {
      return {
        ok: false,
        phase: "tap_path",
        detail: `segment not found: ${segment}`,
        errorCode: RECIPE_ERROR_CODES.TAP_PATH_SEGMENT_NOT_FOUND,
        data: { path: path8, segment, index: i }
      };
    }
    await ctx.clickPoint(target.point);
    if (i < path8.length - 1) {
      ctx.invalidateDumpCache?.();
      await recipeSettleDelay(ctx, options?.payload, 350);
    }
  }
  const finalNodes = await safeDumpUi(ctx);
  const { flat, truncated } = shapeMobileViewTreeFlat(finalNodes, 40);
  return {
    ok: true,
    phase: "tap_path",
    detail: `path=${path8.join(">")}`,
    data: { path: path8, flat, flatTruncated: truncated || void 0 }
  };
}
async function recipeTapSearch(ctx, options) {
  const parsed = parseFillSearchPayload(options?.payload);
  const h = mergedHeuristics(ctx, parsed);
  const nodes = await dumpWithRetry(ctx);
  let input = findRole(nodes, ctx, "searchInput", h);
  if (input) {
    ctx.invalidateDumpCache?.();
    await clickUiPick(ctx, input);
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
  await clickUiPick(ctx, entry);
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

// ../../packages/driver-rpc/src/mobile-dismiss-popups.ts
var MOBILE_DISMISS_LABELS = [
  "\u5173\u95ED",
  "\u8DF3\u8FC7",
  "\u6211\u77E5\u9053\u4E86",
  "\u77E5\u9053\u4E86",
  "\u6682\u4E0D",
  "\u4E0D\u518D\u63D0\u793A",
  "\u53D6\u6D88",
  "\xD7",
  "Close",
  "Got it"
];
var DISMISS_HIT_SLEEP_MS = 200;
var DISMISS_ROUND_SLEEP_MS = 200;
var DEFAULT_DISMISS_TIMEOUT_MS = 1e4;
function numberOr2(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function matchDismissLabel(node, label) {
  if (!node.clickable) return false;
  const needle = label.trim().toLowerCase();
  if (!needle) return false;
  const hay = `${node.text} ${node.desc}`.toLowerCase();
  return hay.includes(needle) || node.text === label || node.desc === label;
}
function findDismissNode(nodes, label) {
  for (const node of nodes) {
    if (matchDismissLabel(node, label)) return node;
  }
  return null;
}
async function dismissRound(ctx, deadline, hitLog) {
  if (Date.now() >= deadline) return false;
  ctx.invalidateDumpCache?.();
  let nodes = [];
  try {
    nodes = await ctx.dumpUi();
  } catch {
    nodes = [];
  }
  for (const label of MOBILE_DISMISS_LABELS) {
    if (Date.now() >= deadline) break;
    const node = findDismissNode(nodes, label);
    if (!node) continue;
    try {
      await ctx.clickPoint(node.point);
      hitLog.push(`text:${label}`);
      await recipeSettleDelay(ctx, void 0, DISMISS_HIT_SLEEP_MS);
      return true;
    } catch {
    }
  }
  if (Date.now() >= deadline) return false;
  const x = Math.round(ctx.screen.width * 0.92);
  const y = Math.round(ctx.screen.height * 0.08);
  try {
    await ctx.clickPoint([x, y]);
    hitLog.push(`point:${x},${y}`);
    return true;
  } catch {
    return false;
  }
}
async function executeMobileDismissPopups(ctx, payload) {
  const timeoutMs = Math.max(0, numberOr2(payload?.timeoutMs, DEFAULT_DISMISS_TIMEOUT_MS));
  const attempts = Math.max(1, Math.floor(numberOr2(payload?.attempts, Number.POSITIVE_INFINITY)));
  const started = Date.now();
  const deadline = started + timeoutMs;
  let dismissActions = 0;
  let rounds = 0;
  let idleStreak = 0;
  const hitLog = [];
  while (Date.now() < deadline && rounds < attempts) {
    rounds += 1;
    let roundOk = false;
    try {
      roundOk = await dismissRound(ctx, deadline, hitLog);
    } catch {
      roundOk = false;
    }
    if (roundOk) {
      dismissActions += 1;
      idleStreak = 0;
    } else {
      idleStreak += 1;
      if (idleStreak >= 2) break;
    }
    if (Date.now() >= deadline) break;
    await recipeSettleDelay(ctx, void 0, DISMISS_ROUND_SLEEP_MS);
  }
  const endedAt = Date.now();
  const dismissed = dismissActions > 0;
  const timedOut = endedAt >= deadline;
  return {
    businessCode: dismissed ? "POPUP_DISMISSED" : timedOut ? "POPUP_DISMISS_TIMEOUT" : "POPUP_NOT_FOUND",
    dismissed,
    reason: dismissed ? "dismissed" : timedOut ? "timed_out" : "no_popup",
    dismissActions,
    rounds,
    timedOut,
    elapsedMs: endedAt - started,
    timeoutMs,
    hits: hitLog
  };
}

// ../../packages/driver-rpc/src/mobile-custom.ts
function normalizeMobileCustomAction(action, method) {
  const a = String(action || method || "").toLowerCase();
  if (a === "dump_hierarchy" || a === "dump_layout") return "dump_ui";
  if (a === "dismisspopups" || a === "dismiss_popups") return "dismiss_popups";
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
  if (action === "tap_path") {
    const recipe = await recipeTapPath(ctx, recipeOpts);
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
  if (action === "dismiss_popups") {
    const result = await executeMobileDismissPopups(ctx, options?.payload);
    return {
      handled: true,
      value: result.reason,
      recipe: { ok: true, phase: "dismiss_popups", detail: result.reason, data: result }
    };
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
  "reboot",
  "killAllApps",
  "wake"
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
    currentapp: "currentApp",
    killallapps: "killAllApps",
    killall: "killAllApps",
    wake: "wake",
    wakeup: "wake"
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
function parsePackageList(stdout, userOnly) {
  const out = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^package:(\S+)/);
    if (m?.[1]) out.push(m[1]);
  }
  if (!userOnly) return [...new Set(out)];
  return [...new Set(out.filter((p) => !p.startsWith("com.android.") && p !== "android"))];
}
function parseAndroidAppInfo(stdout, appId) {
  const versionName = stdout.match(/versionName=([^\s]+)/)?.[1];
  const versionCode = stdout.match(/versionCode=(\d+)/)?.[1];
  const enabled = !/enabled=0/.test(stdout) && /enabled=1/.test(stdout);
  return {
    appId,
    package: appId,
    versionName: versionName ?? null,
    versionCode: versionCode ? Number(versionCode) : null,
    enabled
  };
}
function parseAndroidCurrentApp(stdout) {
  const focus = stdout.match(/mCurrentFocus=Window\{[^}]+\s+([^\s/]+)\/([^\s}]+)/) ?? stdout.match(/mFocusedApp=ActivityRecord\{[^}]+\s+([^\s/]+)\/([^\s}]+)/);
  if (!focus) return null;
  return { package: focus[1], activity: focus[2], appId: focus[1] };
}

// ../../packages/driver-rpc/src/ui-dump-cache.ts
init_src();
function readUiDumpCacheTtlMs() {
  return uiDumpCacheTtlMsFromEnv(2e3);
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
  async getOrLoad(loader2) {
    const cached = this.get();
    if (cached !== void 0) return cached;
    const raw = await loader2();
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
function resolveMobileHttpPath(baseUrl, path8, sessionId) {
  const trimmed = path8.trim();
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
async function executeAndroidMethodInvoke(command, opts) {
  const target = (opts.invoke.target ?? "adb").toLowerCase();
  if (target !== "adb" && target !== "device" && target !== "session") {
    return invokeFail(command, "INVOKE_TARGET_UNSUPPORTED", `unsupported invoke target: ${target}`);
  }
  const method = opts.invoke.method;
  const args = Array.isArray(opts.invoke.args) ? opts.invoke.args : [];
  try {
    if (method === "shell") {
      const cmd = String(args[0] ?? "");
      if (!cmd) return invokeFail(command, "INVOKE_INVALID_ARGS", "adb.shell requires args[0] command string");
      const shellArgs = args.slice(1).map(String);
      const res = await opts.runAdb(opts.serial, ["shell", cmd, ...shellArgs]);
      if (!res.ok) return invokeFail(command, "INVOKE_ADB_FAILED", res.stderr || "adb shell failed");
      return methodSuccess(command, target, method, { stdout: res.stdout.trim(), stderr: res.stderr.trim() });
    }
    if (method === "tap") {
      const x = Number(args[0]);
      const y = Number(args[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return invokeFail(command, "INVOKE_INVALID_ARGS", "adb.tap requires args [x, y]");
      }
      const res = await opts.runAdb(opts.serial, ["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))]);
      if (!res.ok) return invokeFail(command, "INVOKE_ADB_FAILED", res.stderr || "adb tap failed");
      return methodSuccess(command, target, method, { tapped: [x, y] });
    }
    if (method === "swipe") {
      const [x1, y1, x2, y2, durationMs = 300] = args.map(Number);
      if (![x1, y1, x2, y2].every(Number.isFinite)) {
        return invokeFail(command, "INVOKE_INVALID_ARGS", "adb.swipe requires args [x1,y1,x2,y2,durationMs?]");
      }
      const res = await opts.runAdb(opts.serial, [
        "shell",
        "input",
        "swipe",
        String(Math.round(x1)),
        String(Math.round(y1)),
        String(Math.round(x2)),
        String(Math.round(y2)),
        String(Math.round(durationMs) || 300)
      ]);
      if (!res.ok) return invokeFail(command, "INVOKE_ADB_FAILED", res.stderr || "adb swipe failed");
      return methodSuccess(command, target, method, { from: [x1, y1], to: [x2, y2] });
    }
    if (method === "dumpHierarchy") {
      if (!opts.dumpHierarchy) {
        return invokeFail(command, "INVOKE_METHOD_NOT_FOUND", "dumpHierarchy not available");
      }
      const xml = await opts.dumpHierarchy();
      return methodSuccess(command, target, method, { xml });
    }
    if (method === "getState") {
      const res = await opts.runAdb(opts.serial, ["get-state"]);
      if (!res.ok) return invokeFail(command, "INVOKE_ADB_FAILED", res.stderr || "adb get-state failed");
      return methodSuccess(command, target, method, { state: res.stdout.trim() });
    }
    if (method === "screenshot") {
      const res = await opts.runAdb(opts.serial, ["exec-out", "screencap", "-p"], true);
      if (!res.ok || !res.stdout) return invokeFail(command, "INVOKE_ADB_FAILED", res.stderr || "screencap failed");
      return methodSuccess(command, target, method, {
        encoding: "base64",
        data: Buffer.from(res.stdout, "binary").toString("base64")
      });
    }
    return invokeFail(command, "INVOKE_METHOD_NOT_FOUND", `Method not found: ${target}.${method}`);
  } catch (error) {
    return invokeFail(command, "INVOKE_FAILED", error instanceof Error ? error.message : String(error));
  }
}
function methodSuccess(command, target, method, value) {
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "android",
      platform: "android",
      command: "invoke",
      mode: "real",
      rpcMode: "method",
      target,
      method,
      value: safeJson(value)
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

// ../../packages/driver-rpc/src/pinch-gesture.ts
function buildDualPointerPinchActions(ends, durationMs) {
  const ms = Math.max(50, Math.round(durationMs));
  return [
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: ends.finger1Start[0], y: ends.finger1Start[1] },
        { type: "pointerDown", button: 0 },
        { type: "pointerMove", duration: ms, x: ends.finger1End[0], y: ends.finger1End[1] },
        { type: "pointerUp", button: 0 }
      ]
    },
    {
      type: "pointer",
      id: "finger2",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: ends.finger2Start[0], y: ends.finger2Start[1] },
        { type: "pointerDown", button: 0 },
        { type: "pointerMove", duration: ms, x: ends.finger2End[0], y: ends.finger2End[1] },
        { type: "pointerUp", button: 0 }
      ]
    }
  ];
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
  const httpBlock = asRecord(payload.http);
  const httpMethod = getString(httpBlock.method);
  const httpPath = getString(httpBlock.path);
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
        body: httpBlock.body
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

// ../../plugins/driver-android/src/session-signature.ts
function deviceSerialOf(payload) {
  const caps = payload.capabilities ?? {};
  return String(
    caps["ada:udid"] ?? caps.udid ?? caps.deviceName ?? process.env.ADA_ANDROID_DEVICE_SN ?? ""
  ).trim();
}
function uia2ServerUrlOf(payload) {
  const caps = payload.capabilities ?? {};
  return String(
    payload.serverUrl ?? caps["appium:serverUrl"] ?? caps.serverUrl ?? process.env.ADA_ANDROID_UIA2_SERVER_URL ?? ""
  ).trim();
}
function androidSessionSignature(payload) {
  const httpUrl = uia2ServerUrlOf(payload);
  if (isHttpServerUrl(httpUrl)) {
    return JSON.stringify({ transport: "http", serverUrl: httpUrl.replace(/\/$/, ""), capabilities: payload.capabilities ?? {} });
  }
  return JSON.stringify({ transport: "adb", deviceSerial: deviceSerialOf(payload) });
}

// ../../plugins/driver-android/src/adb-runner.ts
var import_node_child_process = require("node:child_process");
var serialQueues = /* @__PURE__ */ new Map();
function queueKey(serial) {
  return serial.trim() || "__default__";
}
function runQueued(serial, task) {
  const key = queueKey(serial);
  const prev = serialQueues.get(key) ?? Promise.resolve({ ok: true, stdout: "", stderr: "" });
  const next = prev.catch(() => void 0).then(task);
  serialQueues.set(
    key,
    next.then(
      () => ({ ok: true, stdout: "", stderr: "" }),
      () => ({ ok: false, stdout: "", stderr: "" })
    )
  );
  return next;
}
async function spawnAdb(serial, args, pipeStdout = false) {
  const adbArgs = serial ? ["-s", serial, ...args] : args;
  return new Promise((resolve) => {
    const child = (0, import_node_child_process.spawn)("adb", adbArgs, {
      stdio: pipeStdout ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "pipe"],
      shell: false,
      ...process.platform === "win32" ? { windowsHide: true } : {}
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (c) => {
      out += c.toString("utf8");
    });
    child.stderr?.on("data", (c) => {
      err += c.toString("utf8");
    });
    child.on("exit", (code) => resolve({ ok: code === 0, stdout: out, stderr: err }));
    child.on("error", (error) => resolve({ ok: false, stdout: "", stderr: String(error) }));
  });
}
async function runAdb(serial, args, pipeStdout = false) {
  return runQueued(serial, () => spawnAdb(serial, args, pipeStdout));
}

// ../../plugins/driver-android/src/recipe-context.ts
function buildAndroidRecipeContext(serial, observe, control, screen, _payload, heuristics, cacheHooks) {
  const localCache = cacheHooks ? void 0 : new UiDumpCache();
  return {
    platform: "android",
    screen,
    heuristics,
    invalidateDumpCache() {
      cacheHooks?.invalidate();
      localCache?.invalidate();
    },
    async getDumpRaw() {
      if (cacheHooks) {
        return cacheHooks.getCachedRaw();
      }
      if (!observe.dumpHierarchy) throw new Error("dumpHierarchy not available");
      return localCache.getOrLoad(async () => observe.dumpHierarchy());
    },
    async dumpUi() {
      const raw = await this.getDumpRaw();
      return parseAndroidHierarchy(raw);
    },
    async clickPoint(point) {
      this.invalidateDumpCache?.();
      await control.click(point);
    },
    async typeFocused(text) {
      this.invalidateDumpCache?.();
      await control.type(text);
    },
    async typeAt(point, text) {
      this.invalidateDumpCache?.();
      await control.click(point);
      await control.type(text);
    },
    async pressEnter() {
      const res = await runAdb(serial, ["shell", "input", "keyevent", "KEYCODE_ENTER"]);
      if (!res.ok) throw new Error(res.stderr || "KEYCODE_ENTER failed");
    },
    async pressBack() {
      const res = await runAdb(serial, ["shell", "input", "keyevent", "KEYCODE_BACK"]);
      if (!res.ok) throw new Error(res.stderr || "KEYCODE_BACK failed");
    }
  };
}

// ../../packages/install-deps/src/index.ts
init_log_locale();
init_install_progress();
init_dependency_installer();

// ../../packages/install-deps/src/agent-effective-config.ts
init_deps_install_paths();

// ../../packages/install-deps/src/default-install-deps-config.ts
init_src2();
var DEFAULT_INSTALL_DEPS_CONFIG = {
  dependencies: {
    autoInstallOnStart: true,
    playwrightBrowser: "chromium",
    playwrightInstallTargets: ["chromium"],
    playwrightDownloadHost: DEFAULT_PLAYWRIGHT_HOST_CANDIDATES[0],
    npmRegistryCandidates: [...DEFAULT_NPM_REGISTRY_CANDIDATES],
    playwrightHostCandidates: [...DEFAULT_PLAYWRIGHT_HOST_CANDIDATES],
    toolsDir: "tools"
  }
};

// ../../node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = (function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  })();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");

// ../../packages/install-deps/src/mcp-bootstrap-deps.ts
init_src2();
init_dependency_installer();
init_log_locale();
init_install_progress();
init_tools_paths();
init_deps_install_paths();
var PREINSTALL_PLAYWRIGHT_HOST_ALLOW = /* @__PURE__ */ new Set([...DEFAULT_PLAYWRIGHT_HOST_CANDIDATES]);

// ../../packages/install-deps/src/index.ts
init_deps_install_paths();
init_playwright_browsers_discovery();
init_deps_resolution();
init_tools_paths();
init_registry_probe();
init_download_probe_persist();
init_install_summary();
init_playwright_browser_install();
init_harmony_hdc_install();
init_android_uia2_bootstrap();
init_ios_wda_bootstrap();
init_ios_idevice_bootstrap();
init_ios_libimobiledevice_install();
init_platform_support();

// ../../packages/install-deps/src/mobile-server-restart.ts
init_src3();
init_android_uia2_bootstrap();
init_ios_wda_bootstrap();
async function restartAndroidUia2Server(options) {
  if (!androidUia2BootstrapEnabled()) return false;
  await ensureAndroidUia2Bootstrap({
    force: options?.force ?? true,
    serial: options?.serial,
    onLogLine: options?.onLogLine
  });
  const probe = await probeAndroidUia2Runtime({
    serial: options?.serial,
    ensureForward: true
  });
  return probe.reachable;
}

// ../../packages/install-deps/src/task-runtime-probe.ts
init_src3();

// ../../plugins/driver-android/src/uia2-adb-adapter.ts
init_src3();
var import_promises5 = __toESM(require("node:fs/promises"), 1);
var import_node_path7 = __toESM(require("node:path"), 1);

// ../../plugins/driver-android/src/resolve-transport.ts
var httpProbeCache = /* @__PURE__ */ new Map();
var PROBE_TTL_MS = 5e3;
async function probeHttpServer(baseUrl) {
  const cached = httpProbeCache.get(baseUrl);
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) {
    return cached.reachable;
  }
  const res = await fetchWebDriverJson("GET", `${baseUrl}/status`);
  const reachable = res.ok || res.status === 200;
  httpProbeCache.set(baseUrl, { reachable, at: Date.now() });
  return reachable;
}
async function resolveAndroidTransport(payload) {
  const configured = uia2ServerUrlOf(payload);
  if (isHttpServerUrl(configured)) {
    return { transport: "http", serverUrl: configured.replace(/\/$/, "") };
  }
  const autoDisabled = process.env.ADA_ANDROID_UIA2_AUTO_HTTP === "false";
  if (!autoDisabled) {
    const envUrl = process.env.ADA_ANDROID_UIA2_SERVER_URL?.trim();
    if (envUrl && isHttpServerUrl(envUrl)) {
      const base = envUrl.replace(/\/$/, "");
      if (await probeHttpServer(base)) {
        return { transport: "http", serverUrl: base };
      }
    }
  }
  return { transport: "adb", serverUrl: deviceSerialOf(payload) };
}

// ../../plugins/driver-android/src/device-admin.ts
var import_promises4 = __toESM(require("node:fs/promises"), 1);
var import_node_path6 = __toESM(require("node:path"), 1);
var screenRecordJobs = /* @__PURE__ */ new Map();
function serialOf(payload) {
  return deviceSerialOf(payload);
}
async function shell(payload, cmd) {
  const serial = serialOf(payload);
  if (!serial) return { ok: false, stdout: "", stderr: "device serial missing" };
  return runAdb(serial, ["shell", "sh", "-c", cmd]);
}
function requireSerial(command, payload) {
  const serial = serialOf(payload);
  if (!serial) return deviceAdminFail(command, "ANDROID_SERIAL_MISSING", "capabilities.udid required");
  return serial;
}
async function executeAndroidDeviceAdmin(command, payload) {
  const action = readDeviceAdminAction(payload);
  if (!action) {
    return deviceAdminFail(command, "DEVICE_ADMIN_ACTION_MISSING", "payload.action required");
  }
  const serialCheck = requireSerial(command, payload);
  if (typeof serialCheck !== "string") return serialCheck;
  const serial = serialCheck;
  const appId = String(payload.appId ?? "").trim();
  switch (action) {
    case "listApps": {
      const userOnly = payload.userOnly === true || payload.thirdPartyOnly === true;
      const res = await runAdb(serial, ["shell", "pm", "list", "packages"]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_LIST_APPS_FAILED", res.stderr || res.stdout);
      const packages = parsePackageList(res.stdout, userOnly);
      return deviceAdminSuccess(command, action, { packages, count: packages.length });
    }
    case "appInfo": {
      if (!appId) return deviceAdminFail(command, "ANDROID_APP_ID_MISSING", "appId required");
      const res = await shell(payload, `dumpsys package ${appId}`);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_APP_INFO_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, parseAndroidAppInfo(res.stdout, appId));
    }
    case "isInstalled": {
      if (!appId) return deviceAdminFail(command, "ANDROID_APP_ID_MISSING", "appId required");
      const res = await runAdb(serial, ["shell", "pm", "path", appId]);
      const installed = res.ok && res.stdout.includes("package:");
      return deviceAdminSuccess(command, action, { appId, installed });
    }
    case "installApp": {
      const localPath = import_node_path6.default.resolve(String(payload.path ?? payload.localPath ?? ""));
      if (!localPath) return deviceAdminFail(command, "ANDROID_INSTALL_PATH_MISSING", "path required");
      const res = await runAdb(serial, ["install", "-r", localPath]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_INSTALL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { path: localPath, output: (res.stdout + res.stderr).trim() });
    }
    case "uninstallApp": {
      if (!appId) return deviceAdminFail(command, "ANDROID_APP_ID_MISSING", "appId required");
      const res = await runAdb(serial, ["uninstall", appId]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_UNINSTALL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { appId, output: (res.stdout + res.stderr).trim() });
    }
    case "pushFile": {
      const localPath = import_node_path6.default.resolve(String(payload.localPath ?? payload.path ?? ""));
      const remotePath = String(payload.remotePath ?? "").trim();
      if (!localPath || !remotePath) {
        return deviceAdminFail(command, "ANDROID_PUSH_PATHS_MISSING", "localPath and remotePath required");
      }
      const res = await runAdb(serial, ["push", localPath, remotePath]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_PUSH_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { localPath, remotePath });
    }
    case "pullFile": {
      const localPath = import_node_path6.default.resolve(String(payload.localPath ?? payload.path ?? ""));
      const remotePath = String(payload.remotePath ?? "").trim();
      if (!localPath || !remotePath) {
        return deviceAdminFail(command, "ANDROID_PULL_PATHS_MISSING", "localPath and remotePath required");
      }
      await import_promises4.default.mkdir(import_node_path6.default.dirname(localPath), { recursive: true });
      const res = await runAdb(serial, ["pull", remotePath, localPath]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_PULL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { localPath, remotePath });
    }
    case "shell": {
      const cmd = String(payload.command ?? "").trim();
      if (!cmd) return deviceAdminFail(command, "ANDROID_SHELL_COMMAND_MISSING", "command required");
      const res = await shell(payload, cmd);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_SHELL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { output: res.stdout.trim() });
    }
    case "hdc":
      return deviceAdminFail(command, "ANDROID_HDC_UNSUPPORTED", "hdc is Harmony-only");
    case "currentApp": {
      const res = await shell(payload, "dumpsys window displays | grep -E mCurrentFocus");
      const fallback = res.ok ? res.stdout : "";
      const res2 = res.ok && parseAndroidCurrentApp(fallback) ? { ok: true, stdout: fallback } : await shell(payload, "dumpsys activity activities | grep mResumedActivity");
      const info = parseAndroidCurrentApp(res2.stdout);
      if (!info) return deviceAdminFail(command, "ANDROID_CURRENT_APP_UNKNOWN", "could not parse foreground app");
      return deviceAdminSuccess(command, action, info);
    }
    case "clearAppData": {
      if (!appId) return deviceAdminFail(command, "ANDROID_APP_ID_MISSING", "appId required");
      const res = await runAdb(serial, ["shell", "pm", "clear", appId]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_CLEAR_DATA_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { appId, cleared: true });
    }
    case "openUrl": {
      const url = String(payload.url ?? "").trim();
      if (!url) return deviceAdminFail(command, "ANDROID_URL_MISSING", "url required");
      const res = await shell(
        payload,
        `am start -a android.intent.action.VIEW -d '${url.replace(/'/g, "'\\''")}'`
      );
      if (!res.ok) return deviceAdminFail(command, "ANDROID_OPEN_URL_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { url, output: res.stdout.trim() });
    }
    case "pressKey": {
      const key = payload.key ?? payload.keyCode;
      if (key == null || key === "") return deviceAdminFail(command, "ANDROID_KEY_MISSING", "key required");
      const code = String(key).startsWith("KEYCODE_") ? String(key) : String(key);
      const res = await runAdb(serial, ["shell", "input", "keyevent", code]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_PRESS_KEY_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { key: code });
    }
    case "longPress": {
      const ms = Math.max(300, Number(payload.durationMs ?? payload.ms ?? 800));
      const point = payload.point;
      if (!point || point.length !== 2) {
        return deviceAdminFail(command, "ANDROID_LONG_PRESS_POINT", "longPress requires payload.point [x,y]");
      }
      const [x, y] = [Math.round(point[0]), Math.round(point[1])];
      const res = await runAdb(serial, ["shell", "input", "swipe", String(x), String(y), String(x), String(y), String(ms)]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_LONG_PRESS_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { point: [x, y], durationMs: ms });
    }
    case "setClipboard": {
      const text = String(payload.text ?? "");
      const escaped = text.replace(/'/g, "'\\''");
      const res = await shell(payload, `cmd clipboard set text '${escaped}'`);
      if (!res.ok) {
        const legacy = await shell(payload, `am broadcast -a clipper.set -e text '${escaped}'`);
        if (!legacy.ok) return deviceAdminFail(command, "ANDROID_SET_CLIPBOARD_FAILED", res.stderr || legacy.stderr);
      }
      return deviceAdminSuccess(command, action, { length: text.length });
    }
    case "getClipboard": {
      const res = await shell(payload, "cmd clipboard get");
      if (!res.ok) return deviceAdminFail(command, "ANDROID_GET_CLIPBOARD_FAILED", res.stderr || res.stdout);
      const text = res.stdout.replace(/^.*?:\s*/m, "").trim();
      return deviceAdminSuccess(command, action, { text });
    }
    case "deviceInfo": {
      const model = await shell(payload, "getprop ro.product.model");
      const release = await shell(payload, "getprop ro.build.version.release");
      const sdk = await shell(payload, "getprop ro.build.version.sdk");
      const size = await shell(payload, "wm size");
      const density = await shell(payload, "wm density");
      const w = size.stdout.match(/Physical size:\s*(\d+)x(\d+)/);
      return deviceAdminSuccess(command, action, {
        platform: "android",
        serial,
        model: model.stdout.trim(),
        osVersion: release.stdout.trim(),
        sdk: sdk.stdout.trim(),
        screenWidth: w ? Number(w[1]) : void 0,
        screenHeight: w ? Number(w[2]) : void 0,
        display: size.stdout.trim(),
        density: density.stdout.trim()
      });
    }
    case "grantPermission": {
      if (!appId) return deviceAdminFail(command, "ANDROID_APP_ID_MISSING", "appId required");
      const perm = String(payload.permission ?? "").trim();
      if (!perm) return deviceAdminFail(command, "ANDROID_PERMISSION_MISSING", "permission required");
      const res = await runAdb(serial, ["shell", "pm", "grant", appId, perm]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_GRANT_PERMISSION_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { appId, permission: perm });
    }
    case "setOrientation": {
      const orientation = String(payload.orientation ?? "portrait").toLowerCase();
      const deg = orientation.includes("land") ? 1 : 0;
      const res = await shell(payload, `settings put system user_rotation ${deg}`);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_ORIENTATION_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { orientation });
    }
    case "startScreenRecord": {
      const remote = String(payload.remotePath ?? "/sdcard/ada-screenrecord.mp4");
      screenRecordJobs.set(serial, { remote });
      const res = await shell(payload, `screenrecord --time-limit 180 ${remote} &`);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_SCREEN_RECORD_START_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { remotePath: remote, started: true });
    }
    case "stopScreenRecord": {
      await shell(payload, "pkill -l SIGINT screenrecord");
      const job = screenRecordJobs.get(serial);
      screenRecordJobs.delete(serial);
      return deviceAdminSuccess(command, action, { stopped: true, remotePath: job?.remote });
    }
    case "reboot": {
      const res = await runAdb(serial, ["reboot"]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_REBOOT_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { rebooting: true });
    }
    default:
      return deviceAdminFail(command, "DEVICE_ADMIN_UNSUPPORTED", `unsupported action: ${action}`);
  }
}

// ../../plugins/driver-android/src/uia2-adb-adapter.ts
function fail(command, code, message) {
  return { requestId: command.requestId, success: false, errorCode: code, errorMessage: message };
}
async function runAndroidDeviceShell(payload, cmd) {
  const serial = deviceSerialOf(payload);
  if (!serial) {
    return { ok: false, stdout: "", stderr: "device serial missing (capabilities.udid)" };
  }
  return runAdb(serial, ["shell", "sh", "-c", cmd]);
}
function customShellSuccess(command, value) {
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "android", mode: "real", command: "custom", action: "shell", value }
  };
}
var HIERARCHY_CACHE_MS = Number(process.env.ADA_ANDROID_HIERARCHY_CACHE_MS ?? 2e3);
function ensureElementCache(session) {
  if (!session.elementCache) {
    session.elementCache = new ElementIdCache();
  }
  return session.elementCache;
}
function invalidateUiCaches(session) {
  session.hierarchyCache = void 0;
  session.elementCache?.clear();
}
function hierarchyCacheTtlMs() {
  const n = HIERARCHY_CACHE_MS;
  return Number.isFinite(n) && n > 0 ? n : 2e3;
}
function ensurePoint2(v) {
  if (!v || v.length !== 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(x), Math.round(y)];
}
function decodeXmlAttr(value) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function parseBounds(raw) {
  const m = raw.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}
function centerOf(bounds) {
  const [x1, y1, x2, y2] = bounds;
  return [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)];
}
function parseUiNodes(xml) {
  const nodes = [];
  const tagRe = /<node\s+[^>]*\/?>/g;
  const attrRe = /([a-zA-Z0-9:_-]+)="([^"]*)"/g;
  for (const tag of xml.match(tagRe) ?? []) {
    const attrs = {};
    for (const m of tag.matchAll(attrRe)) {
      attrs[m[1]] = decodeXmlAttr(m[2]);
    }
    nodes.push({
      text: attrs.text ?? "",
      contentDesc: attrs["content-desc"] ?? "",
      resourceId: attrs["resource-id"] ?? "",
      bounds: parseBounds(attrs.bounds ?? "")
    });
  }
  return nodes;
}
function nodeText(node) {
  return node.text || node.contentDesc || "";
}
function escapeXpathLiteral(value) {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return `concat(${value.split('"').map((part, i) => i === 0 ? `"${part}"` : `, '"', "${part}"`).join("")})`;
}
function findNode(nodes, payload) {
  const locator = payload.locator;
  if (!locator) return null;
  if (locator.text) {
    const label = String(locator.text);
    return nodes.find((n) => n.text && n.text.includes(label) || n.contentDesc && n.contentDesc.includes(label)) ?? null;
  }
  if (locator.id) {
    return nodes.find((n) => n.resourceId === locator.id || n.resourceId.endsWith(`:${locator.id}`)) ?? null;
  }
  if (locator.accessibilityId) {
    return nodes.find((n) => n.contentDesc === locator.accessibilityId) ?? null;
  }
  if (locator.xpath) {
    const textEq = locator.xpath.match(/@text=['"](.+?)['"]/);
    if (textEq?.[1]) return nodes.find((n) => n.text === textEq[1]) ?? null;
    const ridEq = locator.xpath.match(/@resource-id=['"](.+?)['"]/);
    if (ridEq?.[1]) return nodes.find((n) => n.resourceId === ridEq[1]) ?? null;
    const descEq = locator.xpath.match(/@content-desc=['"](.+?)['"]/);
    if (descEq?.[1]) return nodes.find((n) => n.contentDesc === descEq[1]) ?? null;
  }
  return null;
}
var AdbControlChannel = class {
  constructor(serial) {
    this.serial = serial;
  }
  async click(point) {
    const [x, y] = point;
    const res = await runAdb(this.serial, ["shell", "input", "tap", String(x), String(y)]);
    if (!res.ok) throw new Error(res.stderr || "adb tap failed");
  }
  async type(text) {
    const escaped = text.replace(/ /g, "%s");
    const res = await runAdb(this.serial, ["shell", "input", "text", escaped]);
    if (!res.ok) throw new Error(res.stderr || "adb input text failed");
  }
  async swipe(from, to, durationMs = 300) {
    const res = await runAdb(this.serial, [
      "shell",
      "input",
      "swipe",
      String(from[0]),
      String(from[1]),
      String(to[0]),
      String(to[1]),
      String(durationMs)
    ]);
    if (!res.ok) throw new Error(res.stderr || "adb swipe failed");
  }
  async back() {
    const res = await runAdb(this.serial, ["shell", "input", "keyevent", "4"]);
    if (!res.ok) throw new Error(res.stderr || "adb back failed");
  }
  async home() {
    const res = await runAdb(this.serial, ["shell", "input", "keyevent", "3"]);
    if (!res.ok) throw new Error(res.stderr || "adb home failed");
  }
  async launchApp(appId) {
    const res = await runAdb(this.serial, ["shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]);
    if (!res.ok) throw new Error(res.stderr || "adb launch app failed");
  }
  async exitApp(appId) {
    const res = await runAdb(this.serial, ["shell", "am", "force-stop", appId]);
    if (!res.ok) throw new Error(res.stderr || "adb exit app failed");
  }
};
var AdbObserveChannel = class {
  constructor(serial) {
    this.serial = serial;
  }
  async screenshot(outputPath) {
    await import_promises5.default.mkdir(import_node_path7.default.dirname(outputPath), { recursive: true });
    const res = await runAdb(this.serial, ["exec-out", "screencap", "-p"], true);
    if (!res.ok || !res.stdout) {
      throw new Error(res.stderr || "adb screencap failed");
    }
    await import_promises5.default.writeFile(outputPath, Buffer.from(res.stdout, "binary"));
    return outputPath;
  }
  async dumpHierarchy() {
    const res = await runAdb(this.serial, ["shell", "uiautomator", "dump", "/sdcard/ada-uix.xml"]);
    if (!res.ok) throw new Error(res.stderr || "uiautomator dump failed");
    const pull = await runAdb(this.serial, ["exec-out", "cat", "/sdcard/ada-uix.xml"], true);
    if (!pull.ok) throw new Error(pull.stderr || "cat hierarchy failed");
    return pull.stdout;
  }
};
async function loadHierarchyWithRetry(observe) {
  if (!observe.dumpHierarchy) return null;
  try {
    return await retryAsync(() => observe.dumpHierarchy(), { attempts: 3, delayMs: 500 });
  } catch {
    return null;
  }
}
async function getCachedHierarchy(session, observe) {
  const ttl = hierarchyCacheTtlMs();
  const cached = session.hierarchyCache;
  if (cached && Date.now() - cached.at < ttl) {
    return cached.xml;
  }
  const xml = await loadHierarchyWithRetry(observe);
  if (xml) {
    session.hierarchyCache = { xml, at: Date.now() };
  }
  return xml;
}
function locatorToUsing(payload) {
  const locator = payload.locator;
  if (!locator) return null;
  if (locator.id) return { using: "id", value: locator.id };
  if (locator.accessibilityId) return { using: "accessibility id", value: locator.accessibilityId };
  if (locator.xpath) return { using: "xpath", value: locator.xpath };
  if (locator.text) {
    const lit = escapeXpathLiteral(String(locator.text));
    return {
      using: "xpath",
      value: `//*[contains(@text, ${lit}) or contains(@content-desc, ${lit})]`
    };
  }
  return null;
}
function isAndroidClearOp(payload) {
  return payload.inputOp === "clear" || payload.androidInputOp === "clear";
}
async function clearAndroidInputAdb(serial, control, observe, session, payload) {
  let point = ensurePoint2(payload.point);
  if (!point && payload.locator) {
    const xml = await getCachedHierarchy(session, observe);
    const node = xml ? findNode(parseUiNodes(xml), payload) : null;
    if (node?.bounds) point = centerOf(node.bounds);
  }
  if (point) {
    await control.click(point);
    await new Promise((r) => setTimeout(r, 400));
  }
  for (let i = 0; i < 16; i++) {
    await runAdb(serial, ["shell", "input", "keyevent", "67"]);
    await new Promise((r) => setTimeout(r, 40));
  }
}
async function findHttpElement(session, base, payload, httpFetch) {
  if (payload.elementId) return payload.elementId;
  const cacheKey = locatorCacheKey(payload.locator);
  if (cacheKey) {
    const cached = ensureElementCache(session).get(cacheKey);
    if (cached) return cached;
  }
  const using = locatorToUsing(payload);
  if (!using) return null;
  const el = await retryAsync(() => httpFetch("POST", `${base}/element`, using), { attempts: 3, delayMs: 500 }).catch(
    () => ({ ok: false, status: 0, value: void 0, raw: {} })
  );
  if (!el.ok) return null;
  const elementId = extractWebDriverElementId(el.value);
  if (elementId && cacheKey) {
    ensureElementCache(session).set(cacheKey, elementId);
  }
  return elementId;
}
var Uia2AdbAdapter = class _Uia2AdbAdapter {
  name = "adb-uia2-adapter";
  static lastServerRestartAt = { value: 0 };
  async createSession(payload) {
    const signature = androidSessionSignature(payload);
    if (payload.mock === true) {
      const resolved2 = await resolveAndroidTransport(payload).catch(() => ({
        transport: "adb",
        serverUrl: deviceSerialOf(payload) || "mock"
      }));
      return {
        sessionId: `mock-${deviceSerialOf(payload) || "default"}-${Date.now()}`,
        serverUrl: resolved2.transport === "http" ? resolved2.serverUrl : deviceSerialOf(payload) || "mock",
        signature,
        transport: resolved2.transport,
        elementCache: new ElementIdCache()
      };
    }
    const resolved = await resolveAndroidTransport(payload);
    if (resolved.transport === "http") {
      const baseUrl = resolved.serverUrl;
      const res = await withMobileHttpRecovery(
        () => fetchWebDriverJson("POST", `${baseUrl}/session`, {
          capabilities: payload.capabilities ?? { platformName: "Android", automationName: "UiAutomator2" }
        }),
        {
          recoverSession: async () => void 0,
          restartServer: () => restartAndroidUia2Server({ serial: deviceSerialOf(payload) }),
          lastServerRestartAt: _Uia2AdbAdapter.lastServerRestartAt
        }
      );
      const value = res.value ?? {};
      const sessionId = value.sessionId;
      if (!res.ok || typeof sessionId !== "string") {
        throw new Error(`UIA2 create session failed: ${JSON.stringify(res.raw ?? {})}`);
      }
      return {
        sessionId,
        serverUrl: baseUrl,
        signature,
        transport: "http",
        elementCache: new ElementIdCache()
      };
    }
    const serial = resolved.serverUrl;
    const check = await runAdb(serial, ["get-state"]);
    if (!check.ok) {
      throw new Error(`adb device unavailable: ${check.stderr || "no device"}`);
    }
    return {
      sessionId: `${serial || "default"}-${Date.now()}`,
      serverUrl: serial,
      signature,
      transport: "adb",
      elementCache: new ElementIdCache()
    };
  }
  async recoverHttpSession(session, payload) {
    await fetchWebDriverJson("DELETE", `${session.serverUrl}/session/${session.sessionId}`).catch(() => void 0);
    invalidateUiCaches(session);
    const fresh = await this.createSession(payload);
    session.sessionId = fresh.sessionId;
    session.serverUrl = fresh.serverUrl;
    session.signature = fresh.signature;
    session.transport = fresh.transport;
    session.elementCache = fresh.elementCache;
    session.hierarchyCache = fresh.hierarchyCache;
  }
  bindHttpFetch(session, payload) {
    const serial = deviceSerialOf(payload);
    return (method, url, body) => withMobileHttpRecovery(() => fetchWebDriverJson(method, url, body), {
      recoverSession: () => this.recoverHttpSession(session, payload),
      restartServer: () => restartAndroidUia2Server({ serial }),
      lastServerRestartAt: _Uia2AdbAdapter.lastServerRestartAt
    });
  }
  async executeInvoke(session, command, payload) {
    const normalized = normalizeInvokePayload(payload, "http");
    if (normalized?.mode === "http" && normalized.http?.method && normalized.http.path) {
      if (session.transport !== "http") {
        return fail(
          command,
          "ANDROID_INVOKE_HTTP_REQUIRES_UIA2",
          "http invoke requires payload.serverUrl or ADA_ANDROID_UIA2_SERVER_URL (UiAutomator2/Appium server)"
        );
      }
      return executeMobileHttpInvoke(command, {
        baseUrl: session.serverUrl,
        sessionId: session.sessionId,
        invoke: normalized.http,
        driver: "android",
        platform: "android",
        recoverSession: () => this.recoverHttpSession(session, payload),
        restartServer: () => restartAndroidUia2Server({ serial: deviceSerialOf(payload) }),
        lastServerRestartAt: _Uia2AdbAdapter.lastServerRestartAt
      });
    }
    const methodInvoke = normalizeInvokePayload(payload, "method");
    if (!methodInvoke?.method) {
      return fail(
        command,
        "INVOKE_INVALID_PAYLOAD",
        "invoke requires http.method/path or method (adb: shell|tap|swipe|dumpHierarchy|getState|screenshot)"
      );
    }
    if (session.transport === "http") {
      return fail(command, "ANDROID_INVOKE_METHOD_REQUIRES_ADB", "method invoke is only available in adb transport mode");
    }
    const observe = new AdbObserveChannel(session.serverUrl);
    return executeAndroidMethodInvoke(command, {
      serial: session.serverUrl,
      invoke: {
        target: methodInvoke.target,
        method: methodInvoke.method,
        args: methodInvoke.args
      },
      runAdb,
      dumpHierarchy: () => observe.dumpHierarchy()
    });
  }
  async execute(session, command, payload) {
    if (payload.mock === true) {
      if (command.command === "invoke") {
        const normalized = normalizeInvokePayload(payload, "http");
        const methodInvoke = normalizeInvokePayload(payload, "method");
        if (normalized?.http?.method && normalized.http.path) {
          return {
            requestId: command.requestId,
            success: true,
            data: {
              driver: "android",
              platform: "android",
              command: "invoke",
              mode: "mock",
              rpcMode: "http",
              http: normalized.http
            }
          };
        }
        if (methodInvoke?.method) {
          return {
            requestId: command.requestId,
            success: true,
            data: {
              driver: "android",
              platform: "android",
              command: "invoke",
              mode: "mock",
              rpcMode: "method",
              target: methodInvoke.target ?? "adb",
              method: methodInvoke.method
            }
          };
        }
        return fail(command, "INVOKE_INVALID_PAYLOAD", "invoke requires http.method/path or method");
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "android", platform: "android", command: command.command, mode: "mock" }
      };
    }
    if (session.transport === "http") {
      return this.executeHttpSession(session, command, payload);
    }
    const control = new AdbControlChannel(session.serverUrl);
    const observe = new AdbObserveChannel(session.serverUrl);
    if (command.command === "wait") {
      const timeoutMs = typeof payload.timeoutMs === "number" ? Math.max(0, payload.timeoutMs) : 300;
      await new Promise((r) => setTimeout(r, timeoutMs));
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "wait", timeoutMs } };
    }
    if (command.command === "back") {
      await control.back();
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "back" } };
    }
    if (command.command === "pressHome" || command.command === "home") {
      await control.home();
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "home" } };
    }
    if (command.command === "screenshot") {
      const output = payload.screenshotPath ?? import_node_path7.default.join(process.cwd(), "artifacts", `${command.requestId}-android.png`);
      await observe.screenshot(output);
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "screenshot", screenshot: output } };
    }
    if (command.command === "swipe") {
      const from = ensurePoint2(payload.from);
      const to = ensurePoint2(payload.to);
      if (!from || !to) return fail(command, "ANDROID_SWIPE_MISSING_POINTS", "swipe requires from/to");
      const screen = {
        width: Number(payload.screenWidth ?? 1080),
        height: Number(payload.screenHeight ?? 2400)
      };
      const relative = payload.relative === true;
      const norm = normalizedSwipePoints2(screen, from, to, { relative });
      const durationMs = resolveSwipeDurationMs(payload, { fallbackMs: 300 });
      invalidateUiCaches(session);
      await control.swipe(norm.from, norm.to, durationMs);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "android", command: "swipe", durationMs }
      };
    }
    if (command.command === "pinch") {
      const ends = readPinchEndsFromPayload(payload);
      if (!ends) return fail(command, "ANDROID_PINCH_MISSING_POINTS", "pinch requires finger1/finger2/finger1End/finger2End");
      const durationMs = resolveSwipeDurationMs(payload, { fallbackMs: 400 });
      invalidateUiCaches(session);
      await Promise.all([
        control.swipe(ends.finger1Start, ends.finger1End, durationMs),
        control.swipe(ends.finger2Start, ends.finger2End, durationMs)
      ]);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "android", command: "pinch", durationMs, pinchIn: payload.pinchIn }
      };
    }
    if (command.command === "launchApp" || command.command === "exitApp") {
      const appId = String(payload.appId ?? payload.packageId ?? "");
      if (!appId) return fail(command, "ANDROID_APP_ID_MISSING", "launch/exit requires appId");
      invalidateUiCaches(session);
      if (command.command === "launchApp") {
        await control.launchApp(appId);
      } else {
        await control.exitApp(appId);
      }
      return { requestId: command.requestId, success: true, data: { driver: "android", command: command.command, appId } };
    }
    if (command.command === "deviceAdmin") {
      return executeAndroidDeviceAdmin(command, payload);
    }
    if (command.command === "invoke") {
      return this.executeInvoke(session, command, payload);
    }
    if (command.command === "custom") {
      const rawAction = String(payload.custom?.action ?? payload.custom?.method ?? "").toLowerCase();
      if (rawAction === "shell") {
        const cmd = String(payload.custom?.command ?? "");
        if (!cmd) {
          return fail(command, "ANDROID_CUSTOM_SHELL_MISSING_COMMAND", "custom shell requires payload.custom.command");
        }
        const res = await runAndroidDeviceShell(payload, cmd);
        if (!res.ok) {
          return fail(command, "ANDROID_CUSTOM_SHELL_FAILED", res.stderr || "adb shell failed");
        }
        return customShellSuccess(command, res.stdout.trim());
      }
      const action = normalizeMobileCustomAction(rawAction, payload.custom?.method);
      if (["dump_ui", "tap_search", "fill_search", "tap_path", "smart_wait", "dismiss_popups"].includes(action)) {
        const screen = {
          width: Number(payload.screenWidth ?? 1080),
          height: Number(payload.screenHeight ?? 2400)
        };
        const ctx = buildAndroidRecipeContext(
          session.serverUrl,
          observe,
          control,
          screen,
          payload,
          parseUiHeuristicsFromPayload(payload),
          {
            getCachedRaw: async () => {
              const xml = await getCachedHierarchy(session, observe);
              if (!xml) throw new Error("hierarchy unavailable");
              return xml;
            },
            invalidate: () => invalidateUiCaches(session)
          }
        );
        const outcome = await runMobileCustomAction(action, ctx, {
          text: String(payload.text ?? payload.custom?.text ?? ""),
          maxBack: typeof payload.custom?.maxBack === "number" ? payload.custom.maxBack : 3,
          payload
        });
        if (outcome.handled && action === "dismiss_popups" && outcome.recipe?.data) {
          return {
            requestId: command.requestId,
            success: true,
            data: {
              driver: "android",
              command: "custom",
              action: "dismissPopups",
              ...outcome.recipe.data
            }
          };
        }
        if (outcome.handled) {
          const ok = outcome.recipe?.ok !== false;
          return {
            requestId: command.requestId,
            success: ok,
            ...ok ? {
              data: {
                driver: "android",
                command: "custom",
                action,
                value: outcome.value,
                recipe: outcome.recipe
              }
            } : {
              errorCode: outcome.errorCode ?? outcome.recipe?.errorCode ?? platformRecipeErrorCode("android", action),
              errorMessage: outcome.recipe?.detail ?? "recipe failed"
            }
          };
        }
      }
      return fail(
        command,
        "ANDROID_CUSTOM_UNSUPPORTED",
        "supported custom: shell|dump_ui|tap_search|fill_search|tap_path|smart_wait|dismissPopups"
      );
    }
    if (command.command === "click") {
      let point = ensurePoint2(payload.point);
      if (!point && payload.locator) {
        const xml = await getCachedHierarchy(session, observe);
        const node = xml ? findNode(parseUiNodes(xml), payload) : null;
        if (node?.bounds) {
          point = centerOf(node.bounds);
        }
      }
      if (!point) return fail(command, "ANDROID_CLICK_REQUIRES_POINT", "click requires payload.point or a resolvable locator");
      invalidateUiCaches(session);
      await control.click(point);
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "click" } };
    }
    if (command.command === "type") {
      if (isAndroidClearOp(payload)) {
        invalidateUiCaches(session);
        await clearAndroidInputAdb(session.serverUrl, control, observe, session, payload);
        return { requestId: command.requestId, success: true, data: { driver: "android", command: "type", inputOp: "clear" } };
      }
      const text = String(payload.text ?? "");
      if (!text) return fail(command, "ANDROID_TYPE_REQUIRES_TEXT", "type requires payload.text");
      invalidateUiCaches(session);
      await control.type(text);
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "type" } };
    }
    if (command.command === "assertVisible" || command.command === "getText" || command.command === "assertText") {
      const xml = await getCachedHierarchy(session, observe);
      if (!xml) return fail(command, "ANDROID_DUMP_HIERARCHY_FAILED", "cannot load ui hierarchy");
      const node = findNode(parseUiNodes(xml), payload);
      if (!node) return fail(command, "ANDROID_ELEMENT_NOT_FOUND", "element not found by locator");
      const actualText = nodeText(node);
      if (command.command === "assertVisible") {
        return { requestId: command.requestId, success: true, data: { driver: "android", command: "assertVisible", visible: true } };
      }
      if (command.command === "getText") {
        return { requestId: command.requestId, success: true, data: { driver: "android", command: "getText", text: actualText } };
      }
      const expected = String(payload.expectedText ?? payload.text ?? "");
      if (!actualText.includes(expected)) {
        return fail(command, "ANDROID_ASSERT_TEXT_FAILED", `expected "${expected}", got "${actualText}"`);
      }
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "assertText", text: actualText } };
    }
    return fail(command, "ANDROID_UNSUPPORTED_COMMAND", `unsupported command: ${command.command}`);
  }
  async executeHttpSession(session, command, payload) {
    const base = `${session.serverUrl}/session/${session.sessionId}`;
    const httpFetch = this.bindHttpFetch(session, payload);
    if (command.command === "invoke") {
      return this.executeInvoke(session, command, payload);
    }
    if (command.command === "wait") {
      const timeoutMs = typeof payload.timeoutMs === "number" ? Math.max(0, payload.timeoutMs) : 300;
      await new Promise((r) => setTimeout(r, timeoutMs));
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "wait", timeoutMs } };
    }
    if (command.command === "back") {
      const res = await httpFetch("POST", `${base}/back`);
      if (!res.ok) return fail(command, "ANDROID_BACK_FAILED", JSON.stringify(res.raw ?? {}));
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "back" } };
    }
    if (command.command === "screenshot") {
      const output = payload.screenshotPath ?? import_node_path7.default.join(process.cwd(), "artifacts", `${command.requestId}-android.png`);
      const res = await httpFetch("GET", `${base}/screenshot`);
      if (!res.ok || typeof res.value !== "string") return fail(command, "ANDROID_SCREENSHOT_FAILED", JSON.stringify(res.raw ?? {}));
      await import_promises5.default.mkdir(import_node_path7.default.dirname(output), { recursive: true });
      await import_promises5.default.writeFile(output, Buffer.from(res.value, "base64"));
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "screenshot", screenshot: output } };
    }
    if (command.command === "click") {
      let point = ensurePoint2(payload.point);
      if (!point) {
        const elementId = await findHttpElement(session, base, payload, httpFetch);
        if (elementId) {
          const clickRes = await httpFetch("POST", `${base}/element/${elementId}/click`);
          if (!clickRes.ok) return fail(command, "ANDROID_CLICK_FAILED", JSON.stringify(clickRes.raw ?? {}));
          invalidateUiCaches(session);
          return { requestId: command.requestId, success: true, data: { driver: "android", command: "click" } };
        }
      }
      if (!point) return fail(command, "ANDROID_CLICK_REQUIRES_POINT", "click requires payload.point or resolvable locator");
      const tapRes = await httpFetch("POST", `${base}/actions`, {
        actions: [
          {
            type: "pointer",
            id: "finger1",
            parameters: { pointerType: "touch" },
            actions: [
              { type: "pointerMove", duration: 0, x: point[0], y: point[1] },
              { type: "pointerDown", button: 0 },
              { type: "pointerUp", button: 0 }
            ]
          }
        ]
      });
      if (!tapRes.ok) return fail(command, "ANDROID_CLICK_FAILED", JSON.stringify(tapRes.raw ?? {}));
      invalidateUiCaches(session);
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "click", point } };
    }
    if (command.command === "type") {
      if (isAndroidClearOp(payload)) {
        const elementId2 = await findHttpElement(session, base, payload, httpFetch);
        if (elementId2) {
          const clickRes = await httpFetch("POST", `${base}/element/${elementId2}/click`);
          if (!clickRes.ok) return fail(command, "ANDROID_CLEAR_FAILED", JSON.stringify(clickRes.raw ?? {}));
          await new Promise((r) => setTimeout(r, 400));
        } else {
          let point = ensurePoint2(payload.point);
          if (point) {
            const tapRes = await httpFetch("POST", `${base}/actions`, {
              actions: [
                {
                  type: "pointer",
                  id: "finger1",
                  parameters: { pointerType: "touch" },
                  actions: [
                    { type: "pointerMove", duration: 0, x: point[0], y: point[1] },
                    { type: "pointerDown", button: 0 },
                    { type: "pointerUp", button: 0 }
                  ]
                }
              ]
            });
            if (!tapRes.ok) return fail(command, "ANDROID_CLEAR_FAILED", JSON.stringify(tapRes.raw ?? {}));
            await new Promise((r) => setTimeout(r, 400));
          }
        }
        for (let i = 0; i < 16; i++) {
          await httpFetch("POST", `${base}/appium/device/press_keycode`, { keycode: 67 });
        }
        invalidateUiCaches(session);
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "android", command: "type", inputOp: "clear" }
        };
      }
      const text = String(payload.text ?? "");
      if (!text) return fail(command, "ANDROID_TYPE_REQUIRES_TEXT", "type requires payload.text");
      const elementId = await findHttpElement(session, base, payload, httpFetch);
      if (!elementId) return fail(command, "ANDROID_LOCATOR_MISSING", "type requires locator in http mode");
      const typeRes = await httpFetch("POST", `${base}/element/${elementId}/value`, { text });
      if (!typeRes.ok) return fail(command, "ANDROID_TYPE_FAILED", JSON.stringify(typeRes.raw ?? {}));
      invalidateUiCaches(session);
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "type" } };
    }
    if (command.command === "swipe") {
      const from = ensurePoint2(payload.from);
      const to = ensurePoint2(payload.to);
      if (!from || !to) return fail(command, "ANDROID_SWIPE_MISSING_POINTS", "swipe requires from/to");
      const screen = {
        width: Number(payload.screenWidth ?? 1080),
        height: Number(payload.screenHeight ?? 2400)
      };
      const relative = payload.relative === true;
      const norm = normalizedSwipePoints2(screen, from, to, { relative });
      const swipePayload = payload;
      const hasSwipeDuration = swipePayload.durationMs != null || swipePayload.speed != null || swipePayload.swipePreset != null || swipePayload.swipeSpeed != null;
      const durationMs = hasSwipeDuration ? resolveSwipeDurationMs(swipePayload, { fallbackMs: 300 }) : typeof payload.timeoutMs === "number" ? Math.max(100, payload.timeoutMs) : resolveSwipeDurationMs(swipePayload, { fallbackMs: 300 });
      const swipeRes = await httpFetch("POST", `${base}/actions`, {
        actions: [
          {
            type: "pointer",
            id: "finger1",
            parameters: { pointerType: "touch" },
            actions: [
              { type: "pointerMove", duration: 0, x: norm.from[0], y: norm.from[1] },
              { type: "pointerDown", button: 0 },
              { type: "pointerMove", duration: durationMs, x: norm.to[0], y: norm.to[1] },
              { type: "pointerUp", button: 0 }
            ]
          }
        ]
      });
      if (!swipeRes.ok) return fail(command, "ANDROID_SWIPE_FAILED", JSON.stringify(swipeRes.raw ?? {}));
      invalidateUiCaches(session);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "android", command: "swipe", from: norm.from, to: norm.to, durationMs }
      };
    }
    if (command.command === "pinch") {
      const ends = readPinchEndsFromPayload(payload);
      if (!ends) return fail(command, "ANDROID_PINCH_MISSING_POINTS", "pinch requires finger1/finger2/finger1End/finger2End");
      const durationMs = resolveSwipeDurationMs(payload, { fallbackMs: 400 });
      const pinchRes = await httpFetch("POST", `${base}/actions`, {
        actions: buildDualPointerPinchActions(ends, durationMs)
      });
      if (!pinchRes.ok) return fail(command, "ANDROID_PINCH_FAILED", JSON.stringify(pinchRes.raw ?? {}));
      invalidateUiCaches(session);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "android", command: "pinch", durationMs, pinchIn: payload.pinchIn }
      };
    }
    if (command.command === "pressHome" || command.command === "home") {
      const keyRes = await httpFetch("POST", `${base}/appium/device/press_keycode`, { keycode: 3 });
      if (!keyRes.ok) return fail(command, "ANDROID_HOME_FAILED", JSON.stringify(keyRes.raw ?? {}));
      return { requestId: command.requestId, success: true, data: { driver: "android", command: "home" } };
    }
    if (command.command === "launchApp" || command.command === "exitApp") {
      const appId = String(payload.appId ?? payload.packageId ?? "");
      if (!appId) return fail(command, "ANDROID_APP_ID_MISSING", "launch/exit requires appId");
      if (command.command === "launchApp") {
        const res = await httpFetch("POST", `${base}/appium/device/activate_app`, { appId });
        if (!res.ok) {
          const fallback = await httpFetch("POST", `${session.serverUrl}/session/${session.sessionId}/appium/device/activate_app`, {
            appId
          });
          if (!fallback.ok) return fail(command, "ANDROID_LAUNCH_FAILED", JSON.stringify(res.raw ?? {}));
        }
      } else {
        const res = await httpFetch("POST", `${base}/appium/device/terminate_app`, { appId });
        if (!res.ok) return fail(command, "ANDROID_EXIT_APP_FAILED", JSON.stringify(res.raw ?? {}));
      }
      return { requestId: command.requestId, success: true, data: { driver: "android", command: command.command, appId } };
    }
    if (command.command === "custom") {
      const rawAction = String(payload.custom?.action ?? payload.custom?.method ?? "").toLowerCase();
      if (rawAction === "shell") {
        const cmd = String(payload.custom?.command ?? "");
        if (!cmd) {
          return fail(command, "ANDROID_CUSTOM_SHELL_MISSING_COMMAND", "custom shell requires payload.custom.command");
        }
        const res = await runAndroidDeviceShell(payload, cmd);
        if (!res.ok) {
          return fail(command, "ANDROID_CUSTOM_SHELL_FAILED", res.stderr || "adb shell failed");
        }
        return customShellSuccess(command, res.stdout.trim());
      }
      const method = String(payload.custom?.method ?? "").toLowerCase();
      if (method === "dump_hierarchy" || method === "page_source") {
        const res = await httpFetch("GET", `${base}/source`);
        if (!res.ok) return fail(command, "ANDROID_SOURCE_FAILED", JSON.stringify(res.raw ?? {}));
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "android", command: "custom", action: method, value: String(res.value ?? "") }
        };
      }
      return fail(
        command,
        "ANDROID_CUSTOM_UNSUPPORTED",
        "supported custom: shell|method=dump_hierarchy|page_source"
      );
    }
    if (command.command === "assertVisible" || command.command === "getText" || command.command === "assertText") {
      const elementId = await findHttpElement(session, base, payload, httpFetch);
      if (!elementId) return fail(command, "ANDROID_ELEMENT_NOT_FOUND", "element not found by locator");
      if (command.command === "assertVisible") {
        const res2 = await httpFetch("GET", `${base}/element/${elementId}/displayed`);
        if (!res2.ok || !res2.value) return fail(command, "ANDROID_ASSERT_VISIBLE_FAILED", JSON.stringify(res2.raw ?? {}));
        return { requestId: command.requestId, success: true, data: { driver: "android", command: "assertVisible", visible: true } };
      }
      const res = await httpFetch("GET", `${base}/element/${elementId}/text`);
      if (!res.ok) return fail(command, "ANDROID_GET_TEXT_FAILED", JSON.stringify(res.raw ?? {}));
      const text = String(res.value ?? "");
      if (command.command === "assertText") {
        const expected = String(payload.expectedText ?? payload.text ?? "");
        if (!text.includes(expected)) {
          return fail(command, "ANDROID_ASSERT_TEXT_FAILED", `expected "${expected}", got "${text}"`);
        }
      }
      return { requestId: command.requestId, success: true, data: { driver: "android", command: command.command, text } };
    }
    return fail(command, "ANDROID_UNSUPPORTED_COMMAND", `unsupported command in http mode: ${command.command}`);
  }
  async destroySession(session) {
    if (session.transport === "http" && session.serverUrl !== "mock") {
      await fetchWebDriverJson("DELETE", `${session.serverUrl}/session/${session.sessionId}`).catch(() => void 0);
    }
  }
};

// ../../plugins/driver-android/src/index.ts
var adapter = new Uia2AdbAdapter();
var sessions = /* @__PURE__ */ new Map();
var androidPlugin = {
  manifest: {
    id: "driver-android",
    version: "1.0.0",
    engine: "android",
    platforms: ["android"],
    capabilities: ["click", "type", "swipe", "pinch", "assertVisible", "screenshot", "wait", "getText", "assertText", "back", "pressHome", "home", "launchApp", "exitApp", "recipe", "custom", "deviceAdmin", "invoke"],
    semanticCommands: ["click", "type", "swipe", "pinch", "assertVisible", "screenshot", "wait", "getText", "assertText", "back", "pressHome", "home", "launchApp", "exitApp", "recipe", "custom", "deviceAdmin"],
    invoke: { modes: ["http", "method"], targets: ["session", "adb", "device"] }
  },
  async init() {
  },
  async createSession(platform) {
    return { id: `android-${Date.now()}`, platform: platform === "android" ? platform : "android" };
  },
  async execute(session, command) {
    const payload = command.payload ?? {};
    const nextSignature = androidSessionSignature(payload);
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
var index_default = androidPlugin;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  androidSessionSignature
});
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
