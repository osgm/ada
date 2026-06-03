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
function defaultUia2ServerUrl() {
  return (process.env.ADA_ANDROID_UIA2_SERVER_URL?.trim() || "http://127.0.0.1:8200").replace(/\/$/, "");
}
function defaultUia2LocalPort() {
  const fromEnv = Number(process.env.ADA_ANDROID_UIA2_LOCAL_PORT ?? "8200");
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 8200;
}
function defaultUia2DevicePort() {
  const fromEnv = Number(process.env.ADA_ANDROID_UIA2_DEVICE_PORT ?? "6790");
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 6790;
}
function runAdbCapture(serial, args, pipeStdout = false) {
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
  const serverUrl = (options?.serverUrl ?? defaultUia2ServerUrl()).replace(/\/$/, "");
  let forwarded = false;
  if (options?.ensureForward !== false) {
    const serial = await resolveAndroidDeviceSerial(options?.serial);
    if (serial) {
      const localPort = defaultUia2LocalPort();
      const devicePort = defaultUia2DevicePort();
      const fwd = await runAdbCapture(serial, ["forward", `tcp:${localPort}`, `tcp:${devicePort}`]);
      forwarded = fwd.ok;
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
  }
});

// ../../packages/runtime-probe/src/ios-wda-probe.ts
var init_ios_wda_probe = __esm({
  "../../packages/runtime-probe/src/ios-wda-probe.ts"() {
    "use strict";
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
  await import_promises3.default.mkdir(import_node_path4.default.dirname(dest), { recursive: true });
  await import_promises3.default.writeFile(dest, buf);
}
async function ensureApkCached(name, url, cacheDir, onLogLine) {
  const fileName = import_node_path4.default.basename(new URL(url).pathname) || `${name}.apk`;
  const dest = import_node_path4.default.join(cacheDir, fileName);
  if (!await pathExists(dest)) {
    await downloadFile(url, dest, onLogLine);
  }
  return dest;
}
async function installApk(serial, apkPath) {
  const res = await runAdbCapture(serial, ["install", "-r", apkPath]);
  if (!res.ok) {
    throw new Error(`adb install failed for ${import_node_path4.default.basename(apkPath)}: ${res.stderr || res.stdout}`);
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
    const probe2 = await probeAndroidUia2Runtime({ serverUrl, serial: options?.serial, ensureForward: true });
    artifact.detail = uia2BootstrapEnabled() ? probe2.detail : `bootstrap disabled (set ADA_ANDROID_UIA2_BOOTSTRAP=true); ${probe2.detail}`;
    artifact.status = probe2.reachable ? "skipped" : "missing";
    return { outcome: artifact, serverUrl };
  }
  const serial = await resolveAndroidDeviceSerial(options?.serial);
  if (!serial) {
    artifact.status = "missing";
    artifact.detail = "no adb device for UIA2 bootstrap";
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
  const toolsDir = await resolveDefaultToolsDir() ?? import_node_path4.default.join(process.cwd(), "tools");
  const cacheDir = import_node_path4.default.join(toolsDir, "android-uia2");
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
var import_promises3, import_node_path4, import_node_child_process3, PINNED_SETTINGS_VERSION, PINNED_UIA2_SERVER_VERSION;
var init_android_uia2_bootstrap = __esm({
  "../../packages/install-deps/src/android-uia2-bootstrap.ts"() {
    "use strict";
    import_promises3 = __toESM(require("node:fs/promises"), 1);
    import_node_path4 = __toESM(require("node:path"), 1);
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

// ../../plugins/driver-android/src/index.ts
var index_exports = {};
__export(index_exports, {
  androidSessionSignature: () => androidSessionSignature,
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);

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
var import_node_path6 = __toESM(require("node:path"), 1);

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
var import_node_path5 = __toESM(require("node:path"), 1);
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
      const localPath = import_node_path5.default.resolve(String(payload.path ?? payload.localPath ?? ""));
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
      const localPath = import_node_path5.default.resolve(String(payload.localPath ?? payload.path ?? ""));
      const remotePath = String(payload.remotePath ?? "").trim();
      if (!localPath || !remotePath) {
        return deviceAdminFail(command, "ANDROID_PUSH_PATHS_MISSING", "localPath and remotePath required");
      }
      const res = await runAdb(serial, ["push", localPath, remotePath]);
      if (!res.ok) return deviceAdminFail(command, "ANDROID_PUSH_FAILED", res.stderr || res.stdout);
      return deviceAdminSuccess(command, action, { localPath, remotePath });
    }
    case "pullFile": {
      const localPath = import_node_path5.default.resolve(String(payload.localPath ?? payload.path ?? ""));
      const remotePath = String(payload.remotePath ?? "").trim();
      if (!localPath || !remotePath) {
        return deviceAdminFail(command, "ANDROID_PULL_PATHS_MISSING", "localPath and remotePath required");
      }
      await import_promises4.default.mkdir(import_node_path5.default.dirname(localPath), { recursive: true });
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
    await import_promises5.default.mkdir(import_node_path6.default.dirname(outputPath), { recursive: true });
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
      const output = payload.screenshotPath ?? import_node_path6.default.join(process.cwd(), "artifacts", `${command.requestId}-android.png`);
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
      if (["dump_ui", "tap_search", "fill_search"].includes(action)) {
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
        "supported custom: shell|dump_ui|tap_search|fill_search"
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
      const output = payload.screenshotPath ?? import_node_path6.default.join(process.cwd(), "artifacts", `${command.requestId}-android.png`);
      const res = await httpFetch("GET", `${base}/screenshot`);
      if (!res.ok || typeof res.value !== "string") return fail(command, "ANDROID_SCREENSHOT_FAILED", JSON.stringify(res.raw ?? {}));
      await import_promises5.default.mkdir(import_node_path6.default.dirname(output), { recursive: true });
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
