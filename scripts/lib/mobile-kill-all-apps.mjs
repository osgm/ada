/**
 * killAllApps：结束已启动的应用进程。
 * - 鸿蒙：ps 解析包名 → exitApp / `aa force-stop`（shell `kill` 在设备上通常无权限）
 * - Android：ps 取 PID → kill
 */
import { ada, wait } from "./ada.mjs";

/** @typedef {'APPS_KILLED'|'APPS_PARTIAL'|'APPS_NONE'} KillAllAppsCode */

/**
 * @typedef {object} KillAllAppsResult
 * @property {boolean} success
 * @property {boolean} cleared
 * @property {KillAllAppsCode} businessCode
 * @property {number} killedCount
 * @property {number} failedCount
 * @property {string[]} packages 已 kill 的 pid 列表
 * @property {string} listSource ps-pid | ps-kill-shell | none
 * @property {string[]} hits
 */

const ANDROID_SYSTEM_PREFIXES = [
  "com.android.",
  "com.google.android.",
  "android.",
  "com.qualcomm.",
  "com.samsung.android.",
  "com.sec.android.",
  "com.miui.",
  "com.huawei.android."
];

const HARMONY_SYSTEM_PREFIXES = [
  "com.ohos.",
  "ohos.",
  "com.huawei.hmos.",
  "com.huawei.system",
  "com.huawei.ark",
  "com.huawei.hiview",
  "com.huawei.hidisk",
  "com.huawei.hwid"
];

const BUNDLE_RE = /\b([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\b/gi;

export const PS_GREP_SKIP_DEFAULT = /system_server|zygote/i;

/** 鸿蒙/OpenHarmony `ps` 首列为 PID；传统 `USER PID` 格式 PID 在第二列 */
export function harmonyPsPidColumnIndex(psText) {
  const lines = String(psText ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = lines[0];
  if (header) {
    if (/^PID\s/i.test(header) && !/^USER\s/i.test(header)) return 0;
    if (/^USER\s+PID/i.test(header)) return 1;
  }
  for (const line of lines) {
    if (/^(PID|USER)\s/i.test(line) || PS_GREP_SKIP_DEFAULT.test(line)) continue;
    const cols = line.split(/\s+/);
    if (cols[0] && /^\d+$/.test(cols[0]) && Number(cols[0]) >= 100) return 0;
    if (cols[1] && /^\d+$/.test(cols[1]) && Number(cols[1]) >= 100) return 1;
    break;
  }
  return 0;
}

export const PS_GREP_SKIP_ANDROID =
  /system_server|zygote|zygote64|tombstoned|lmkd|logd|servicemanager|surfaceflinger|vold|installd|keystore|netd|audioserver/i;

/**
 * 设备内管道（adb shell / hdc shell 已进设备）
 * @param {string} psCmd 如 ps 或 ps -A
 */
export function buildKillProcessesShell(psCmd = "ps", skipPattern = "system_server|zygote", pidField = 2) {
  const awkPid = `$${pidField}`;
  return `${psCmd} | grep -vE '${skipPattern}' | awk 'NR>1 && ${awkPid} ~ /^[0-9]+$/ && ${awkPid} >= 100 {print ${awkPid}}' | while read pid; do kill -9 "$pid" 2>/dev/null; done`;
}

/** OpenHarmony：PID 在第 1 列；仅结束 CMD 含用户包名（com.xxx）的进程 */
export const HARMONY_KILL_PROCESSES_SHELL =
  "ps | grep -E 'com\\.' | grep -vE 'system_server|zygote' | awk 'NR>1 && $1 ~ /^[0-9]+$/ && $1 >= 100 {print $1}' | while read pid; do kill -9 \"$pid\" 2>/dev/null; done";
export const HARMONY_KILL_PROCESSES_SHELL_XARGS =
  "ps | grep -E 'com\\.' | grep -vE 'system_server|zygote' | awk 'NR>1 && $1 ~ /^[0-9]+$/ && $1 >= 100 {print $1}' | xargs kill -9 2>/dev/null";

export const ANDROID_KILL_PROCESSES_SHELL = buildKillProcessesShell(
  "ps -A 2>/dev/null || ps",
  "system_server|zygote|zygote64"
);
export const ANDROID_KILL_PROCESSES_SHELL_XARGS =
  "ps -A 2>/dev/null | grep -vE 'system_server|zygote|zygote64' | awk 'NR>1 && $2 ~ /^[0-9]+$/ {print $2}' | xargs kill 2>/dev/null";

/**
 * 从 ps 输出解析待 kill 的 PID（第 2 列）
 * @param {string} psText
 * @param {{ excludePackages?: string[], excludePids?: string[] }} [opts]
 * @param {RegExp} [skipRe]
 */
export function parseKillPids(psText, opts = {}, skipRe = PS_GREP_SKIP_DEFAULT, pidCol = 1) {
  const excludeBundles = (opts.excludePackages ?? []).map(String);
  const excludePids = new Set((opts.excludePids ?? []).map(String));
  const pids = [];
  for (const line of String(psText ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || skipRe.test(trimmed)) continue;
    const cols = trimmed.split(/\s+/);
    const pid = cols[pidCol] ?? cols[1];
    if (!pid || !/^\d+$/.test(pid) || pid === "PID") continue;
    if (Number(pid) < 100) continue;
    if (excludePids.has(pid)) continue;
    if (excludeBundles.some((b) => b && trimmed.includes(b))) continue;
    pids.push(pid);
  }
  return [...new Set(pids)];
}

/** @deprecated 使用 parseKillPids */
export function parseHarmonyKillPids(psText, opts = {}) {
  const pidCol = harmonyPsPidColumnIndex(psText);
  const requireUserBundle = pidCol === 0;
  const excludeBundles = (opts.excludePackages ?? []).map(String);
  const excludePids = new Set((opts.excludePids ?? []).map(String));
  const pids = [];
  for (const line of String(psText ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || PS_GREP_SKIP_DEFAULT.test(trimmed)) continue;
    if (
      requireUserBundle &&
      parseUserBundleIdsFromText(trimmed, "harmony").filter((b) => b.startsWith("com.")).length === 0
    ) {
      continue;
    }
    const cols = trimmed.split(/\s+/);
    const pid = cols[pidCol] ?? cols[1];
    if (!pid || !/^\d+$/.test(pid) || pid === "PID") continue;
    if (Number(pid) < 100) continue;
    if (excludePids.has(pid)) continue;
    if (excludeBundles.some((b) => b && trimmed.includes(b))) continue;
    pids.push(pid);
  }
  return [...new Set(pids)];
}

/** 从 ps 解析正在运行的用户应用包名（OpenHarmony CMD 为 com.xxx） */
export function parseHarmonyRunningBundles(psText, opts = {}) {
  const pidCol = harmonyPsPidColumnIndex(psText);
  const requireUserBundle = pidCol === 0;
  const exclude = new Set((opts.excludePackages ?? []).map(String));
  const bundles = [];
  for (const line of String(psText ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || PS_GREP_SKIP_DEFAULT.test(trimmed)) continue;
    const ids = parseUserBundleIdsFromText(trimmed, "harmony").filter((b) => b.startsWith("com."));
    if (requireUserBundle && ids.length === 0) continue;
    for (const id of ids) {
      if (!exclude.has(id)) bundles.push(id);
    }
  }
  return [...new Set(bundles)];
}

function harmonyForceStopOk(shellOut) {
  return /successfully|success/i.test(String(shellOut ?? ""));
}

export function parseAndroidKillPids(psText, opts = {}) {
  return parseKillPids(psText, opts, PS_GREP_SKIP_ANDROID);
}

/** @param {string} bundle */
export function isSystemBundle(bundle, platform = "harmony") {
  const b = String(bundle).trim();
  if (!b || !b.includes(".")) return true;
  const prefixes = platform === "android" ? ANDROID_SYSTEM_PREFIXES : HARMONY_SYSTEM_PREFIXES;
  return prefixes.some((p) => b.startsWith(p));
}

/** 从 ps / dump 文本中提取用户应用包名（测试 / 其它工具用） */
export function parseUserBundleIdsFromText(text, platform = "harmony") {
  const found = new Set();
  const raw = String(text ?? "");
  for (const m of raw.matchAll(BUNDLE_RE)) {
    const id = m[1];
    if (id.length < 5 || !id.includes(".")) continue;
    if (!isSystemBundle(id, platform)) found.add(id);
  }
  return [...found].sort();
}

function buildResult({ killed, failed, listSource, hits, cleared: clearedOverride }) {
  const killedCount = killed.length;
  const failedCount = failed.length;
  const cleared = clearedOverride ?? killedCount > 0;
  let businessCode = "APPS_NONE";
  if (cleared && failedCount === 0) businessCode = "APPS_KILLED";
  else if (cleared) businessCode = "APPS_PARTIAL";
  return {
    success: true,
    cleared,
    businessCode,
    killedCount,
    failedCount,
    packages: killed,
    listSource,
    hits
  };
}

/**
 * @param {() => Promise<string>} fetchPs
 * @param {(cmd: string) => Promise<unknown>} runShell
 * @param {string[]} pipelineShells
 * @param {(text: string) => string[]} parsePids
 * @param {string[]} exclude
 */
async function killAllByPid({ fetchPs, runShell, pipelineShells, parsePids, exclude, killSignal = "" }) {
  const psText = await fetchPs();
  const pids = parsePids(psText, { excludePackages: exclude });

  if (pids.length > 0) {
    const sig = killSignal ? `${killSignal} ` : "";
    const killCmd = pids.map((pid) => `kill ${sig}${pid} 2>/dev/null`).join("; ");
    await runShell(killCmd);
    return { pids, listSource: "ps-pid", shellUsed: "kill-by-pid" };
  }

  for (const shellCmd of pipelineShells) {
    await runShell(shellCmd);
    return { pids: [], listSource: "ps-kill-shell", shellUsed: shellCmd.slice(0, 56) };
  }
  return { pids: [], listSource: "none", shellUsed: null };
}

function resultFromPidKill(pidKill, hits) {
  hits.push(`shell:${pidKill.shellUsed ?? "none"}`);

  if (pidKill.pids.length > 0) {
    hits.push(`kill:pids:${pidKill.pids.length}`);
    return buildResult({
      killed: pidKill.pids,
      failed: [],
      listSource: pidKill.listSource,
      hits
    });
  }

  if (pidKill.listSource === "ps-kill-shell") {
    hits.push("kill:pipeline");
    return buildResult({
      killed: [],
      failed: [],
      listSource: "ps-kill-shell",
      hits,
      cleared: true
    });
  }

  hits.push("kill:none");
  return buildResult({ killed: [], failed: [], listSource: "none", hits });
}

function resultFromAppKill(appKill, hits) {
  hits.push(`shell:${appKill.shellUsed ?? "none"}`);
  if (appKill.killed.length > 0) {
    hits.push(`stop:bundles:${appKill.killed.length}`);
    return buildResult({
      killed: appKill.killed,
      failed: appKill.failed ?? [],
      listSource: appKill.listSource,
      hits
    });
  }
  hits.push("kill:none");
  return buildResult({
    killed: [],
    failed: appKill.failed ?? [],
    listSource: appKill.listSource ?? "none",
    hits
  });
}

/** 从 MCP / ada 指令返回中提取 shell stdout */
export function shellValueFromRunResult(result) {
  const value = result?.value ?? result?.data?.value;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.stdout === "string") return value.stdout;
  return String(value ?? "");
}

/**
 * 将 ada_mobile_action 的 run 包装为 killAllApps 可用的回调（与 bridge harmonyKillAllApps 一致）
 * @param {(command: string, extra?: object) => Promise<object>} run
 */
export function createMcpActionRun(run) {
  return async (command, extra = {}) => {
    try {
      const data = await run(command, extra);
      const inner = data?.result?.data ?? data?.data ?? {};
      return {
        success: data?.ok !== false && data?.result?.success !== false,
        value: inner?.value ?? data?.value,
        data: inner
      };
    } catch {
      return { success: false };
    }
  };
}

/**
 * Android：adb shell ps → kill PID（同鸿蒙思路）
 * @param {Function} adb 简单 adb shell 参数数组（keyevent 等）
 * @param {{ width: number, height: number }} _screen
 * @param {object} cfg
 */
export async function androidKillAllApps(adb, _screen, cfg = {}) {
  const exclude = cfg.excludePackages ?? cfg.killExclude ?? [];
  const hits = [];
  const udid = cfg.capabilities?.udid ?? "";

  const adbSh = async (script) => {
    const { spawn } = await import("node:child_process");
    return new Promise((resolve) => {
      const c = spawn("adb", [...(udid ? ["-s", udid] : []), "shell", "sh", "-c", script], {
        stdio: ["ignore", "pipe", "ignore"]
      });
      let out = "";
      c.stdout?.on("data", (chunk) => {
        out += chunk.toString("utf8");
      });
      c.on("close", () => resolve(out));
      c.on("error", () => resolve(""));
    });
  };

  await adb(["input", "keyevent", "KEYCODE_HOME"]);
  await wait(200);

  const pidKill = await killAllByPid({
    fetchPs: () => adbSh("ps -A 2>/dev/null || ps"),
    runShell: (cmd) => adbSh(cmd),
    pipelineShells: [ANDROID_KILL_PROCESSES_SHELL, ANDROID_KILL_PROCESSES_SHELL_XARGS],
    parsePids: parseAndroidKillPids,
    exclude
  });

  await adb(["input", "keyevent", "KEYCODE_HOME"]);
  await wait(200);
  return resultFromPidKill(pidKill, hits);
}

/** Android：经 MCP custom shell（与鸿蒙 killAllApps 同构） */
async function androidKillByPid(run, exclude) {
  return killAllByPid({
    fetchPs: async () => {
      const r = await run("custom", {
        custom: { action: "shell", command: "ps -A 2>/dev/null || ps" }
      }).catch(() => ({}));
      return shellValueFromRunResult(r);
    },
    runShell: (cmd) => run("custom", { custom: { action: "shell", command: cmd } }).catch(() => ({})),
    pipelineShells: [ANDROID_KILL_PROCESSES_SHELL, ANDROID_KILL_PROCESSES_SHELL_XARGS],
    parsePids: parseAndroidKillPids,
    exclude
  });
}

/**
 * @param {(cmd: string, extra?: object) => Promise<{success?: boolean, value?: unknown, data?: object}>} run
 * @param {object} cfg
 * @param {{ excludePackages?: string[], killExclude?: string[] }} [opts]
 */
export async function androidKillAllAppsViaRun(run, cfg = {}, opts = {}) {
  const exclude = opts.excludePackages ?? opts.killExclude ?? cfg.excludePackages ?? cfg.killExclude ?? [];
  const hits = [];

  await run("custom", { custom: { action: "shell", command: "input keyevent KEYCODE_HOME" } }).catch(() => ({}));
  await wait(200);

  const pidKill = await androidKillByPid(run, exclude);
  const result = resultFromPidKill(pidKill, hits);

  await run("custom", { custom: { action: "shell", command: "input keyevent KEYCODE_HOME" } }).catch(() => ({}));
  await wait(200);
  return result;
}

/** 鸿蒙：ps 解析包名 → exitApp / aa force-stop */
async function harmonyKillByForceStop(run, exclude) {
  const r = await run("custom", { custom: { action: "shell", command: "ps" } }).catch(() => ({}));
  const psText = shellValueFromRunResult(r);
  const bundles = parseHarmonyRunningBundles(psText, { excludePackages: exclude });
  const killed = [];
  const failed = [];
  for (const bundle of bundles) {
    let stopped = false;
    try {
      const er = await run("exitApp", { appId: bundle });
      stopped = er?.success !== false;
    } catch {
      /* exitApp 不可用时走 shell */
    }
    if (!stopped) {
      const sr = await run("custom", {
        custom: { action: "shell", command: `aa force-stop ${bundle}` }
      }).catch(() => ({}));
      stopped = harmonyForceStopOk(shellValueFromRunResult(sr));
    }
    if (stopped) killed.push(bundle);
    else failed.push(bundle);
    await wait(150);
  }
  return {
    killed,
    failed,
    listSource: killed.length > 0 ? "aa-force-stop" : "none",
    shellUsed: "aa force-stop"
  };
}

/**
 * @param {(cmd: string, extra?: object) => Promise<{success?: boolean, value?: unknown, data?: object}>} run
 * @param {object} cfg
 * @param {{ excludePackages?: string[], killExclude?: string[] }} [opts]
 */
export async function harmonyKillAllApps(run, cfg = {}, opts = {}) {
  const exclude = opts.excludePackages ?? opts.killExclude ?? cfg.excludePackages ?? cfg.killExclude ?? [];
  const hits = [];

  await run("custom", { custom: { action: "shell", command: "uitest uiInput keyEvent Home" } }).catch(() => ({}));
  await wait(200);

  const appKill = await harmonyKillByForceStop(run, exclude);
  const result = resultFromAppKill(appKill, hits);

  await run("custom", { custom: { action: "shell", command: "uitest uiInput keyEvent Home" } }).catch(() => ({}));
  await wait(200);
  return result;
}

/** ada-client：鸿蒙 killAllApps */
export async function harmonyKillAllAppsAda(platform, sessionId, cfg, opts = {}) {
  const run = async (command, extra) => {
    const r = await ada(platform, sessionId, command, { ...cfg, ...extra });
    return { success: r.success, value: r.data?.value, data: r.data };
  };
  return harmonyKillAllApps(run, cfg, opts);
}
