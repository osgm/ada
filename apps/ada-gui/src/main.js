import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const logsEl = document.querySelector("#logs");

const LS = {
  remoteUrl: "ada.console.remoteUrl",
  apiKey: "ada.console.apiKey",
  androidHome: "ada.console.androidHome",
  mcpRemoteHost: "ada.console.mcpRemoteHost",
  mcpRemotePort: "ada.console.mcpRemotePort",
  mcpRemoteApiKey: "ada.console.mcpRemoteApiKey",
  mcpRemoteAllowRisky: "ada.console.mcpRemoteAllowRisky",
  mcpRemoteRiskyMode: "ada.console.mcpRemoteRiskyMode",
  mcpRemoteRiskyCommands: "ada.console.mcpRemoteRiskyCommands"
};

function generateUuidWithoutHyphen() {
  try {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID().replace(/-/g, "");
    }
  } catch {
    /* ignore */
  }
  const template = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";
  return template.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function addLog(line) {
  enqueueLogLines([String(line ?? "")]);
}

/** 日志队列：批量刷新 + 行数上限，兼顾实时性与界面流畅度 */
const LOG_FLUSH_INTERVAL_MS = 80;
const LOG_FLUSH_BATCH_LINES = 120;
const LOG_MAX_LINES = 4000;
const pendingLines = [];
let logFlushTimer = 0;
let totalLogLines = 0;

function flushPendingLogs() {
  logFlushTimer = 0;
  if (pendingLines.length === 0) return;
  const chunk = pendingLines.splice(0, LOG_FLUSH_BATCH_LINES);
  logsEl.value += chunk.join("\n") + "\n";
  totalLogLines += chunk.length;
  if (totalLogLines > LOG_MAX_LINES) {
    const trimmed = logsEl.value.split(/\r?\n/).filter((x) => x.length > 0).slice(-LOG_MAX_LINES);
    logsEl.value = trimmed.join("\n") + (trimmed.length > 0 ? "\n" : "");
    totalLogLines = trimmed.length;
  }
  logsEl.scrollTop = logsEl.scrollHeight;
  if (pendingLines.length > 0) {
    scheduleLogFlush();
  }
}

function scheduleLogFlush() {
  if (logFlushTimer) return;
  logFlushTimer = window.setTimeout(flushPendingLogs, LOG_FLUSH_INTERVAL_MS);
}

function enqueueLogLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  const now = new Date().toLocaleTimeString();
  for (const line of lines) {
    pendingLines.push(`[${now}] ${line}`);
  }
  scheduleLogFlush();
}

function clearLogs() {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = 0;
  }
  pendingLines.length = 0;
  totalLogLines = 0;
  logsEl.value = "";
}

function loadStore() {
  try {
    const u = localStorage.getItem(LS.remoteUrl);
    const k = localStorage.getItem(LS.apiKey);
    const a = localStorage.getItem(LS.androidHome);
    const mrh = localStorage.getItem(LS.mcpRemoteHost);
    const mrp = localStorage.getItem(LS.mcpRemotePort);
    const mrk = localStorage.getItem(LS.mcpRemoteApiKey);
    const mrr = localStorage.getItem(LS.mcpRemoteAllowRisky);
    const mrm = localStorage.getItem(LS.mcpRemoteRiskyMode);
    const mrc = localStorage.getItem(LS.mcpRemoteRiskyCommands);
    if (u) document.querySelector("#remoteUrl").value = u;
    if (k) document.querySelector("#apiKey").value = k;
    if (a) document.querySelector("#androidHome").value = a;
    if (mrh) document.querySelector("#mcpRemoteHost").value = mrh;
    if (mrp) document.querySelector("#mcpRemotePort").value = mrp;
    if (mrk) document.querySelector("#mcpRemoteApiKey").value = mrk;
    if (mrr) document.querySelector("#mcpRemoteAllowRisky").checked = mrr === "true";
    if (mrm) document.querySelector("#mcpRemoteRiskyMode").value = mrm;
    if (mrc) document.querySelector("#mcpRemoteRiskyCommands").value = mrc;
  } catch {
    /* ignore */
  }
}

function saveStore() {
  try {
    localStorage.setItem(LS.remoteUrl, document.querySelector("#remoteUrl").value.trim());
    localStorage.setItem(LS.apiKey, document.querySelector("#apiKey").value);
    localStorage.setItem(LS.androidHome, document.querySelector("#androidHome").value.trim());
    localStorage.setItem(LS.mcpRemoteHost, document.querySelector("#mcpRemoteHost").value.trim());
    localStorage.setItem(LS.mcpRemotePort, document.querySelector("#mcpRemotePort").value.trim());
    localStorage.setItem(LS.mcpRemoteApiKey, document.querySelector("#mcpRemoteApiKey").value);
    localStorage.setItem(LS.mcpRemoteAllowRisky, document.querySelector("#mcpRemoteAllowRisky").checked ? "true" : "false");
    localStorage.setItem(LS.mcpRemoteRiskyMode, document.querySelector("#mcpRemoteRiskyMode").value);
    localStorage.setItem(LS.mcpRemoteRiskyCommands, document.querySelector("#mcpRemoteRiskyCommands").value.trim());
  } catch {
    /* ignore */
  }
}

function ensureDefaultMcpRemoteApiKey() {
  const keyInput = document.querySelector("#mcpRemoteApiKey");
  if (!keyInput) return;
  if (String(keyInput.value ?? "").trim()) return;
  const generated = generateUuidWithoutHyphen();
  keyInput.value = generated;
  saveStore();
  addLog("已自动生成默认 MCP 鉴权 Token（UUID 无横线）。");
}

function getRemoteConfigSnapshot() {
  return {
    host: document.querySelector("#mcpRemoteHost").value.trim(),
    port: document.querySelector("#mcpRemotePort").value.trim(),
    allowRisky: document.querySelector("#mcpRemoteAllowRisky").checked,
    riskyMode: document.querySelector("#mcpRemoteRiskyMode").value,
    riskyCommands: document.querySelector("#mcpRemoteRiskyCommands").value.trim()
  };
}

let mcpRemoteLastStartedConfig = null;

function buildMcpRemoteConfigText() {
  const host = document.querySelector("#mcpRemoteHost").value.trim() || "127.0.0.1";
  const port = Number(document.querySelector("#mcpRemotePort").value.trim() || "8787");
  const apiKey = document.querySelector("#mcpRemoteApiKey").value.trim();
  const url = `http://${host}:${port}`;
  return JSON.stringify(
    {
      mcpServers: {
        "ada-mcp-remote": {
          url: `${url}/mcp`,
          headers: {
            "x-api-key": apiKey || "<your_token>"
          }
        }
      }
    },
    null,
    2
  );
}

async function fetchRemoteHttpStatus(host, port) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`http://${host}:${port}/status`, { method: "GET", signal: controller.signal });
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: String(error) };
  } finally {
    window.clearTimeout(timer);
  }
}

document.querySelector("#btnMcpRemoteStart").addEventListener("click", async () => {
  await withAgent(async () => {
    saveStore();
    const host = document.querySelector("#mcpRemoteHost").value.trim();
    const port = Number(document.querySelector("#mcpRemotePort").value.trim());
    const apiKey = document.querySelector("#mcpRemoteApiKey").value.trim();
    const allowRisky = document.querySelector("#mcpRemoteAllowRisky").checked;
    const riskyMode = document.querySelector("#mcpRemoteRiskyMode").value;
    const riskyCommands = document.querySelector("#mcpRemoteRiskyCommands").value.trim();
    if (!host) {
      addLog("启动失败：监听地址不能为空");
      return;
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      addLog("启动失败：端口不合法");
      return;
    }
    if (!apiKey) {
      addLog("启动失败：鉴权 Token（api-key）不能为空");
      return;
    }
    await invoke("start_mcp_remote_server", {
      agentPath: null,
      input: { host, port, apiKey, allowRisky, riskyMode, riskyCommands }
    });
    mcpRemoteLastStartedConfig = getRemoteConfigSnapshot();
    addLog(`MCP 远程服务启动成功：http://${host}:${port}`);
  });
});

document.querySelector("#btnMcpRemoteStop").addEventListener("click", async () => {
  await withAgent(async () => {
    await invoke("stop_mcp_remote_server");
    addLog("MCP 远程服务已停止");
  });
});

document.querySelector("#btnMcpRemoteStatus").addEventListener("click", async () => {
  await withAgent(async () => {
    const host = document.querySelector("#mcpRemoteHost").value.trim() || "127.0.0.1";
    const port = Number(document.querySelector("#mcpRemotePort").value.trim() || "8787");
    const status = await invoke("get_mcp_remote_status", { host, port });
    addLog(
      `MCP 远程状态: running=${Boolean(status?.running)} host=${status?.host ?? host} port=${status?.port ?? port} pid=${status?.pid ?? "-"}`
    );
    const nowCfg = getRemoteConfigSnapshot();
    if (
      mcpRemoteLastStartedConfig &&
      (nowCfg.host !== mcpRemoteLastStartedConfig.host ||
        nowCfg.port !== mcpRemoteLastStartedConfig.port ||
        nowCfg.allowRisky !== mcpRemoteLastStartedConfig.allowRisky ||
        nowCfg.riskyMode !== mcpRemoteLastStartedConfig.riskyMode ||
        nowCfg.riskyCommands !== mcpRemoteLastStartedConfig.riskyCommands)
    ) {
      addLog("提示：远程服务配置已变更，重启 MCP 远程服务后生效。");
    }
    const httpState = await fetchRemoteHttpStatus(host, port);
    if (httpState.ok) {
      const data = httpState.data ?? {};
      addLog(
        `远程HTTP状态: requests=${data.totalRequests ?? "-"} toolCalls=${data.toolCalls ?? "-"} authFails=${data.authFailures ?? "-"} sessions=${data.onlineSessions ?? "-"} riskyMode=${data.riskyMode ?? "-"}`
      );
    } else {
      addLog(`远程HTTP状态不可用: ${httpState.message}`);
    }
  });
});

document.querySelector("#btnMcpRemoteCopyConfig").addEventListener("click", async () => {
  await withAgent(async () => {
    saveStore();
    const text = buildMcpRemoteConfigText();
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      addLog("远程接入配置已复制到剪贴板。");
      return;
    }
    addLog("当前环境不支持剪贴板写入，以下为配置内容：");
    text.split("\n").forEach((line) => addLog(line));
  });
});

async function refreshHomeDirs({ overrideExisting = false, applyEnv = false } = {}) {
  const detected = await invoke("detect_home_dirs");
  const androidInput = document.querySelector("#androidHome");
  const androidDetected = String(detected?.androidHome ?? "").trim();

  const canSetAndroid = overrideExisting || !androidInput.value.trim();

  if (canSetAndroid && androidDetected) {
    androidInput.value = androidDetected;
    addLog(`已探测 ANDROID_HOME: ${androidDetected}`);
  }

  if (applyEnv && androidInput.value.trim()) {
    await invoke("apply_android_home", { androidHome: androidInput.value.trim() });
  }

  if (androidInput.value.trim()) {
    saveStore();
  }
}

function syncDepFull() {
  const full = document.querySelector("#depFull").checked;
  const box = document.querySelector("#depGroups");
  if (full) {
    box.classList.add("disabled");
  } else {
    box.classList.remove("disabled");
  }
}

function gatherInstallSteps() {
  const steps = [];
  if (document.querySelector("#depFull").checked) {
    steps.push({ only: "all" });
    return steps;
  }
  if (document.querySelector("#grpPw").checked) {
    const step = { only: "playwright" };
    const targets = [];
    if (document.querySelector("#pwAll").checked) {
      targets.push("all");
    } else {
      if (document.querySelector("#pwChromium").checked) targets.push("chromium");
      if (document.querySelector("#pwChrome").checked) targets.push("chrome");
      if (document.querySelector("#pwFirefox").checked) targets.push("firefox");
      if (document.querySelector("#pwWebkit").checked) targets.push("webkit");
      if (document.querySelector("#pwMsedge").checked) targets.push("msedge");
    }
    if (targets.length > 0) {
      step.playwrightTargets = targets;
    }
    steps.push(step);
  }
  if (document.querySelector("#grpMob").checked) {
    const platforms = [];
    if (document.querySelector("#mobAndroid").checked) platforms.push("android");
    if (document.querySelector("#mobIos").checked) platforms.push("ios");
    if (document.querySelector("#mobHarmony").checked) platforms.push("harmony");
    if (platforms.length === 0) {
      steps.push({ only: "mobile" });
    } else {
      for (const only of platforms) {
        steps.push({ only });
      }
    }
  }
  return steps;
}

async function withAgent(fn) {
  try {
    await fn();
  } catch (error) {
    addLog(`错误: ${String(error)}`);
  }
}

document.querySelector("#depFull").addEventListener("change", syncDepFull);
syncDepFull();

document.querySelector("#pwAll").addEventListener("change", function () {
  if (this.checked) {
    ["pwChromium", "pwChrome", "pwFirefox", "pwWebkit", "pwMsedge"].forEach((id) => {
      document.querySelector(`#${id}`).checked = false;
    });
  }
});
["pwChromium", "pwChrome", "pwFirefox", "pwWebkit", "pwMsedge"].forEach((id) => {
  document.querySelector(`#${id}`).addEventListener("change", function () {
    if (this.checked) document.querySelector("#pwAll").checked = false;
  });
});

document.querySelector("#btnClearLogs").addEventListener("click", () => {
  clearLogs();
});

document.querySelector("#btnDetect").addEventListener("click", async () => {
  try {
    const path = await invoke("detect_agent_path");
    addLog(path ? `已探测到本地 Agent: ${path}` : "未探测到本地 Agent（将按默认路径继续尝试）");
  } catch (error) {
    addLog(`探测失败: ${String(error)}`);
  }
});

document.querySelector("#btnHealth").addEventListener("click", async () => {
  await withAgent(async () => {
    const output = await invoke("run_health", { agentPath: null, controlUrl: null });
    addLog(`health:\n${output}`);
  });
});

const deviceMetaEl = document.querySelector("#deviceMeta");
const deviceTableBody = document.querySelector("#deviceTableBody");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDeviceMeta(data) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const parts = [];
  if (data?.lastScanAt) {
    parts.push(`最近扫描: ${new Date(data.lastScanAt).toLocaleString()}`);
  }
  parts.push(`共 ${rows.length} 台`);
  const authorized = rows.filter((r) => r.authorized).length;
  if (authorized !== rows.length) {
    parts.push(`可用 ${authorized} 台`);
  }
  if (data?.file) {
    parts.push(data.file);
  }
  return parts.join(" · ") || "尚未扫描";
}

function renderDeviceRows(rows) {
  deviceTableBody.replaceChildren();
  if (!rows?.length) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "未发现设备，请连接手机并开启 USB 调试后点击「扫描设备」";
    tr.append(td);
    deviceTableBody.append(tr);
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (row.isDefault) tr.classList.add("is-default");
    const status = row.authorized
      ? row.isDefault
        ? "默认 · 已授权"
        : "已授权"
      : `未授权 (${row.connectionState})`;
    const cells = [
      row.deviceName,
      row.deviceId,
      row.resolution,
      row.systemCategory,
      row.sdkInfo,
      status
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text ?? "";
      if (text === row.deviceId) td.classList.add("mono");
      tr.append(td);
    }
    deviceTableBody.append(tr);
  }
}

function parseDeviceListPayload(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("设备列表返回为空");
  }
  return JSON.parse(raw);
}

async function loadDeviceList(scan) {
  const cmd = scan ? "scan_devices" : "list_devices";
  const raw = await invoke(cmd, { agentPath: null });
  const data = parseDeviceListPayload(raw);
  if (Array.isArray(data.scanErrors) && data.scanErrors.length > 0) {
    for (const err of data.scanErrors) {
      addLog(`设备扫描 [${err.platform}]: ${err.message}`);
    }
  }
  renderDeviceRows(data.rows);
  deviceMetaEl.textContent = formatDeviceMeta(data);
  addLog(scan ? `设备扫描完成，${data.rows?.length ?? 0} 台` : `已加载设备列表，${data.rows?.length ?? 0} 台`);
  return data;
}

document.querySelector("#btnRefreshDevices").addEventListener("click", async () => {
  await withAgent(async () => {
    await loadDeviceList(false);
  });
});

document.querySelector("#btnScanDevices").addEventListener("click", async () => {
  await withAgent(async () => {
    await loadDeviceList(true);
  });
});

document.querySelector("#btnSetup").addEventListener("click", async () => {
  await withAgent(async () => {
    addLog("正在打开配置向导（浏览器）...");
    const output = await invoke("run_setup_gui", { agentPath: null, controlUrl: null });
    addLog(`setup 结束:\n${output}`);
  });
});

document.querySelector("#btnSaveRemote").addEventListener("click", async () => {
  await withAgent(async () => {
    saveStore();
    const serverUrl = document.querySelector("#remoteUrl").value.trim();
    const apiKey = document.querySelector("#apiKey").value;
    if (!serverUrl) {
      addLog("保存失败：请先填写接入地址");
      return;
    }
    const output = await invoke("apply_patch_remote", {
      agentPath: null,
      serverUrl,
      apiKey: apiKey.trim() ? apiKey : null
    });
    addLog(`patch-remote:\n${output}`);
  });
});

document.querySelector("#btnPickAndroidHome").addEventListener("click", async () => {
  await withAgent(async () => {
    const picked = await invoke("pick_android_home_dir");
    if (picked && String(picked).trim()) {
      document.querySelector("#androidHome").value = String(picked).trim();
      addLog(`已选择 ANDROID_HOME: ${picked}`);
    } else {
      addLog("未选择目录");
    }
  });
});

document.querySelector("#btnSaveAndroidHome").addEventListener("click", async () => {
  await withAgent(async () => {
    const androidHome = document.querySelector("#androidHome").value.trim();
    if (!androidHome) {
      addLog("保存失败：请先填写或选择 ANDROID_HOME 目录");
      return;
    }
    const output = await invoke("apply_android_home", { androidHome });
    saveStore();
    addLog(`ANDROID_HOME 已配置:\n${output}`);
  });
});

const btnInstall = document.querySelector("#btnInstall");
const btnStopInstall = document.querySelector("#btnStopInstall");
let installRunning = false;
let listenersReady = false;
const eventBridgeReady = (async () => {
  await listen("agent-log", (event) => {
    const raw = String(event.payload ?? "");
    const lines = raw.split(/\r?\n/).map((x) => x.trimEnd()).filter((x) => x.length > 0);
    enqueueLogLines(lines.length > 0 ? lines : [raw]);
  });

  await listen("install-deps-finished", (event) => {
    installRunning = false;
    btnInstall.disabled = false;
    btnStopInstall.disabled = true;
    const p = normalizeInstallDepsPayload(event.payload);
    if (!p) {
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      addLog("依赖安装已结束，但未收到结构化摘要（请查看上方日志）。");
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      return;
    }
    const ok = Boolean(p.ok);
    if (ok) {
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      addLog("依赖安装：成功");
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      if (typeof p.step_count === "number" && typeof p.elapsed_ms === "number") {
        const seconds = (p.elapsed_ms / 1000).toFixed(1);
        addLog(`完成 ${p.step_count} 个步骤，总耗时 ${seconds}s`);
      }
      if (Array.isArray(p.summary_lines)) {
        p.summary_lines
          .map((x) => String(x ?? "").trim())
          .filter((x) => x.length > 0)
          .forEach((line) => addLog(`- ${line}`));
      }
      void refreshHomeDirs({ overrideExisting: false, applyEnv: true }).catch((error) => {
        addLog(`安装完成后刷新环境目录失败: ${String(error)}`);
      });
    } else {
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      addLog("依赖安装：失败");
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      addLog(typeof p.error === "string" && p.error.trim() ? p.error : "未知错误");
    }
  });
  listenersReady = true;
})().catch((error) => {
  addLog(`日志事件桥接初始化失败: ${String(error)}`);
});

btnInstall.addEventListener("click", async () => {
  await withAgent(async () => {
    await eventBridgeReady;
    if (!listenersReady) {
      addLog("日志事件桥接尚未就绪，请稍后重试。");
      return;
    }
    const steps = gatherInstallSteps();
    if (steps.length === 0) {
      addLog("请勾选「完整安装」或至少一类组件（Playwright / 移动驱动）");
      return;
    }
    const force = document.querySelector("#depForce").checked;
    addLog("开始安装依赖");
    if (installRunning) {
      addLog("已有安装任务在执行，请先停止或等待结束。");
      return;
    }
    installRunning = true;
    btnInstall.disabled = true;
    btnStopInstall.disabled = false;
    try {
      await invoke("run_install_deps_plan", {
        agentPath: null,
        steps,
        force
      });
    } catch (error) {
      installRunning = false;
      btnInstall.disabled = false;
      btnStopInstall.disabled = true;
      addLog(`install-deps 未能启动: ${String(error)}`);
    }
  });
});

btnStopInstall.addEventListener("click", async () => {
  if (!installRunning) {
    addLog("当前没有运行中的安装任务。");
    return;
  }
  try {
    await invoke("stop_install_deps");
    addLog("已请求停止安装，等待子进程退出…");
  } catch (error) {
    addLog(`停止安装失败: ${String(error)}`);
  }
});

/** 依赖安装与 Agent/MCP 服务均由用户手动触发，避免 GUI 一打开就下载 Playwright 等。 */
async function logGuiStartupHint() {
  await eventBridgeReady;
  addLog("提示：请先在「安装依赖」中勾选组件并点击「开始安装」；完成引导配置后再启动 Agent/MCP（勿在未完成 setup 时自动拉起服务）。");
}

function normalizeInstallDepsPayload(raw) {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

loadStore();
ensureDefaultMcpRemoteApiKey();
void refreshHomeDirs({ overrideExisting: false, applyEnv: false }).catch((error) =>
  addLog(`自动探测环境目录失败: ${String(error)}`)
);
if (document.querySelector("#androidHome").value.trim()) {
  void invoke("apply_android_home", {
    androidHome: document.querySelector("#androidHome").value.trim()
  }).catch((error) => addLog(`应用已保存 ANDROID_HOME 失败: ${String(error)}`));
}
void logGuiStartupHint();
void withAgent(async () => {
  await loadDeviceList(false);
}).catch((error) => addLog(`加载设备列表失败: ${String(error)}`));
