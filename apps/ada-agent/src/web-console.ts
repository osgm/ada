/**
 * ADA Web 与原生 GUI 保持结构一致：同一套区块与 install scope 名称（对应 CLI --only）
 */
export function getConsoleHtml(port: number): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ADA 控制台</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", system-ui, sans-serif; margin: 0; background: #f5f7fb; color: #1a1a1a; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 20px; }
    h1 { margin: 0; font-size: 1.35rem; }
    .subtitle { color: #556; margin: 8px 0 18px; font-size: 14px; }
    .card { background: #fff; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    h2 { margin: 0 0 10px; font-size: 1.05rem; }
    label.lbl { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
    input[type=text], input[type=password], input[type=number], select {
      width: 100%; padding: 8px 10px; border: 1px solid #ccd; border-radius: 6px; margin-bottom: 10px;
    }
    .hint { font-size: 12px; color: #64748b; margin: -4px 0 10px; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; align-items: center; }
    .deps-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px 12px; margin: 8px 0; }
    .deps-grid label { font-weight: 500; font-size: 13px; display: flex; align-items: center; gap: 8px; }
    fieldset.subgr { margin: 10px 0; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; }
    fieldset.subgr legend { font-weight: 600; font-size: 14px; }
    #depGroups.disabled { opacity: 0.45; pointer-events: none; }
    button { border: 0; border-radius: 8px; padding: 8px 12px; background: #2563eb; color: #fff; cursor: pointer; font-size: 14px; }
    button:hover { background: #1d4ed8; }
    button.secondary { background: #64748b; }
    button.secondary:hover { background: #475569; }
    button.danger { background: #dc2626; }
    button.danger:hover { background: #b91c1c; }
    pre#logs { white-space: pre-wrap; background: #0f172a; color: #e2e8f0; border-radius: 8px; min-height: 220px; padding: 10px; font-size: 12px; font-family: Consolas, monospace; }
    .status { color: #334155; font-size: 14px; margin-top: 8px; }
    .status span { font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>ADA 控制台</h1>
    <p class="subtitle">本地 WEB 模式 · <span id="baseUrl">http://127.0.0.1:${port}</span> · </p>

    <section class="card">
      <h2>远程管理平台（可选）</h2>
      <p class="hint">写入本机密钥文件，供 Agent 连接控制面使用；仅本地保存，不会上传到浏览器服务端。</p>
      <label class="lbl" for="remoteUrl">接入地址</label>
      <input type="text" id="remoteUrl" placeholder="https://ada-control.example.com" autocomplete="off" />
      <label class="lbl" for="apiKey">API Key</label>
      <input type="password" id="apiKey" placeholder="留空则保留已保存的密钥" autocomplete="off" />
      <div class="row">
        <button type="button" id="btnSaveRemote">保存到本机密钥</button>
      </div>
    </section>

    <section class="card">
      <h2>常用操作</h2>
      <div class="row">
        <button type="button" id="btnHealth">健康检查</button>
        <button type="button" id="btnSetup" class="secondary">打开配置向导</button>
      </div>
    </section>

    <section class="card">
      <h2>MCP / 服务管理</h2>
      <p class="hint">与 GUI 对齐：可启动本机 MCP 远程服务（HTTP + Token + 风险双模式）。</p>
      <label class="lbl" for="mcpRemoteHost">监听地址</label>
      <input type="text" id="mcpRemoteHost" value="127.0.0.1" autocomplete="off" />
      <label class="lbl" for="mcpRemotePort">端口</label>
      <input type="number" id="mcpRemotePort" value="8787" min="1" max="65535" />
      <label class="lbl" for="mcpRemoteApiKey">鉴权 Token（api-key）</label>
      <input type="password" id="mcpRemoteApiKey" placeholder="必填" autocomplete="off" />
      <label><input type="checkbox" id="mcpRemoteAllowRisky" /> 允许高风险命令（默认关闭）</label>
      <label class="lbl" for="mcpRemoteRiskyMode">风险命令策略模式</label>
      <select id="mcpRemoteRiskyMode">
        <option value="whitelist" selected>白名单（仅允许列表中的风险命令）</option>
        <option value="blacklist">黑名单（禁止列表中的风险命令）</option>
      </select>
      <label class="lbl" for="mcpRemoteRiskyCommands">风险命令列表（逗号分隔）</label>
      <input type="text" id="mcpRemoteRiskyCommands" value="custom" autocomplete="off" />
      <div class="row">
        <button type="button" id="btnMcpRemoteStart">启动 MCP 远程服务</button>
        <button type="button" id="btnMcpRemoteStop" class="danger">停止 MCP 远程服务</button>
        <button type="button" id="btnMcpRemoteStatus" class="secondary">查看运行状态</button>
        <button type="button" id="btnMcpRemoteCopyConfig" class="secondary">复制接入配置</button>
      </div>
      <p class="hint">配置变更后需重启 MCP 远程服务才会生效。</p>
    </section>

    <section class="card">
      <h2>Agent / MCP</h2>
      <p class="hint">勾选要启动或停止的组件（默认两项均勾选），再点启动或停止。</p>
      <div class="row">
        <label><input type="checkbox" id="chkAgent" checked /> Agent</label>
        <label><input type="checkbox" id="chkMcp" checked /> MCP</label>
      </div>
      <div class="row">
        <button type="button" id="btnStart">启动</button>
        <button type="button" id="btnStop" class="danger">停止</button>
      </div>
      <div class="status">Agent：<span id="agentStatus">未运行</span> · MCP：<span id="mcpStatus">未运行</span></div>
    </section>

    <section class="card">
      <h2>安装依赖</h2>
      <p class="hint">分组安装：完整安装等价于 CLI <code>--only=all</code>；否则按 Playwright 子项组合执行。</p>
      <label><input type="checkbox" id="depFull" /> 完整安装（Playwright + 移动驱动与 Harmony 工具）</label>
      <div id="depGroups">
        <fieldset class="subgr">
          <legend><label><input type="checkbox" id="grpPw" /> Playwright</label></legend>
          <p class="hint">可选浏览器通道；不勾选具体项则按配置文件默认。勾选「全部浏览器」等价于 <code>playwright install</code> 无参数。</p>
          <div class="deps-grid">
            <label><input type="checkbox" id="pwChromium" /> chromium</label>
            <label><input type="checkbox" id="pwChrome" /> chrome</label>
            <label><input type="checkbox" id="pwFirefox" /> firefox</label>
            <label><input type="checkbox" id="pwWebkit" /> webkit</label>
            <label><input type="checkbox" id="pwMsedge" /> msedge</label>
            <label><input type="checkbox" id="pwAll" /> 全部浏览器（all）</label>
          </div>
          </fieldset>
        <fieldset class="subgr">
          <legend><label><input type="checkbox" id="grpMob" /> 移动驱动</label></legend>
          <p class="hint">不勾选具体平台则安装全部移动端依赖（hypium + hdc + 环境检查）。</p>
          <div class="deps-grid">
            <label><input type="checkbox" id="mobAndroid" /> Android（adb + UIA2）</label>
            <label><input type="checkbox" id="mobIos" /> iOS（WDA）</label>
            <label><input type="checkbox" id="mobHarmony" /> Harmony（hdc + hypium）</label>
          </div>
        </fieldset>
      </div>
      <label style="margin-top:10px;display:block;"><input type="checkbox" id="depForce" /> 重新安装</label>
      <div class="row">
        <button type="button" id="btnInstall">开始安装</button>
      </div>
    </section>

    <section class="card">
      <h2>日志</h2>
      <pre id="logs"></pre>
    </section>
  </div>
  <script>
    const LS = {
      remoteUrl: "ada.console.remoteUrl",
      apiKey: "ada.console.apiKey",
      mcpRemoteHost: "ada.console.mcpRemoteHost",
      mcpRemotePort: "ada.console.mcpRemotePort",
      mcpRemoteApiKey: "ada.console.mcpRemoteApiKey",
      mcpRemoteAllowRisky: "ada.console.mcpRemoteAllowRisky",
      mcpRemoteRiskyMode: "ada.console.mcpRemoteRiskyMode",
      mcpRemoteRiskyCommands: "ada.console.mcpRemoteRiskyCommands"
    };
    const logs = document.getElementById("logs");
    function add(text) {
      const now = new Date().toLocaleTimeString();
      logs.textContent += "[" + now + "] " + text + "\\n";
      logs.scrollTop = logs.scrollHeight;
    }
    function loadStore() {
      try {
        const u = localStorage.getItem(LS.remoteUrl);
        const k = localStorage.getItem(LS.apiKey);
        if (u) document.getElementById("remoteUrl").value = u;
        if (k) document.getElementById("apiKey").value = k;
        const mrh = localStorage.getItem(LS.mcpRemoteHost);
        const mrp = localStorage.getItem(LS.mcpRemotePort);
        const mrk = localStorage.getItem(LS.mcpRemoteApiKey);
        const mrr = localStorage.getItem(LS.mcpRemoteAllowRisky);
        const mrm = localStorage.getItem(LS.mcpRemoteRiskyMode);
        const mrc = localStorage.getItem(LS.mcpRemoteRiskyCommands);
        if (mrh) document.getElementById("mcpRemoteHost").value = mrh;
        if (mrp) document.getElementById("mcpRemotePort").value = mrp;
        if (mrk) document.getElementById("mcpRemoteApiKey").value = mrk;
        if (mrr) document.getElementById("mcpRemoteAllowRisky").checked = mrr === "true";
        if (mrm) document.getElementById("mcpRemoteRiskyMode").value = mrm;
        if (mrc) document.getElementById("mcpRemoteRiskyCommands").value = mrc;
      } catch (e) { /* ignore */ }
    }
    function saveStore() {
      try {
        localStorage.setItem(LS.remoteUrl, document.getElementById("remoteUrl").value.trim());
        localStorage.setItem(LS.apiKey, document.getElementById("apiKey").value);
        localStorage.setItem(LS.mcpRemoteHost, document.getElementById("mcpRemoteHost").value.trim());
        localStorage.setItem(LS.mcpRemotePort, document.getElementById("mcpRemotePort").value.trim());
        localStorage.setItem(LS.mcpRemoteApiKey, document.getElementById("mcpRemoteApiKey").value);
        localStorage.setItem(LS.mcpRemoteAllowRisky, document.getElementById("mcpRemoteAllowRisky").checked ? "true" : "false");
        localStorage.setItem(LS.mcpRemoteRiskyMode, document.getElementById("mcpRemoteRiskyMode").value);
        localStorage.setItem(LS.mcpRemoteRiskyCommands, document.getElementById("mcpRemoteRiskyCommands").value.trim());
      } catch (e) { /* ignore */ }
    }
    function buildMcpRemoteConfigText() {
      const host = document.getElementById("mcpRemoteHost").value.trim() || "127.0.0.1";
      const port = Number(document.getElementById("mcpRemotePort").value.trim() || "8787");
      const apiKey = document.getElementById("mcpRemoteApiKey").value.trim();
      const riskyMode = document.getElementById("mcpRemoteRiskyMode").value;
      const riskyCommands = document.getElementById("mcpRemoteRiskyCommands").value.trim();
      const url = "http://" + host + ":" + port;
      return [
        "MCP_REMOTE_URL=" + url,
        "MCP_REMOTE_API_KEY=" + (apiKey || "<请填写你的api-key>"),
        "MCP_REMOTE_RISKY_MODE=" + riskyMode,
        "MCP_REMOTE_RISKY_COMMANDS=" + (riskyCommands || "<例如 custom,launchApp>")
      ].join("\\n");
    }
    async function post(path, body) {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? "{}" : JSON.stringify(body)
      });
      const t = await r.text();
      return { ok: r.ok, status: r.status, text: t };
    }
    function syncDepFull() {
      var full = document.getElementById("depFull").checked;
      var box = document.getElementById("depGroups");
      if (full) { box.classList.add("disabled"); } else { box.classList.remove("disabled"); }
    }
    document.getElementById("depFull").addEventListener("change", syncDepFull);
    syncDepFull();
    document.getElementById("pwAll").addEventListener("change", function () {
      if (this.checked) {
        ["pwChromium","pwChrome","pwFirefox","pwWebkit","pwMsedge"].forEach(function (id) {
          document.getElementById(id).checked = false;
        });
      }
    });
    ["pwChromium","pwChrome","pwFirefox","pwWebkit","pwMsedge"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        if (this.checked) { document.getElementById("pwAll").checked = false; }
      });
    });

    document.getElementById("btnSaveRemote").addEventListener("click", async function () {
      saveStore();
      const url = document.getElementById("remoteUrl").value.trim();
      const key = document.getElementById("apiKey").value;
      if (!url) { add("保存失败：请先填写接入地址"); return; }
      const res = await post("/api/patch-remote", { serverUrl: url, apiKey: key || undefined });
      add("/api/patch-remote\\n" + res.text);
    });
    document.getElementById("btnHealth").addEventListener("click", async function () {
      const res = await post("/api/health", {});
      add("/api/health\\n" + res.text);
    });
    document.getElementById("btnSetup").addEventListener("click", async function () {
      const res = await post("/api/setup", {});
      add("/api/setup\\n" + res.text);
    });
    document.getElementById("btnMcpRemoteStart").addEventListener("click", async function () {
      saveStore();
      const host = document.getElementById("mcpRemoteHost").value.trim();
      const port = Number(document.getElementById("mcpRemotePort").value.trim());
      const apiKey = document.getElementById("mcpRemoteApiKey").value.trim();
      const allowRisky = document.getElementById("mcpRemoteAllowRisky").checked;
      const riskyMode = document.getElementById("mcpRemoteRiskyMode").value;
      const riskyCommands = document.getElementById("mcpRemoteRiskyCommands").value.trim();
      if (!host) { add("启动失败：监听地址不能为空"); return; }
      if (!Number.isFinite(port) || port < 1 || port > 65535) { add("启动失败：端口不合法"); return; }
      if (!apiKey) { add("启动失败：鉴权 Token 不能为空"); return; }
      const res = await post("/api/mcp-remote/start", { host, port, apiKey, allowRisky, riskyMode, riskyCommands });
      add("/api/mcp-remote/start\\n" + res.text);
    });
    document.getElementById("btnMcpRemoteStop").addEventListener("click", async function () {
      const res = await post("/api/mcp-remote/stop", {});
      add("/api/mcp-remote/stop\\n" + res.text);
    });
    document.getElementById("btnMcpRemoteStatus").addEventListener("click", async function () {
      const host = document.getElementById("mcpRemoteHost").value.trim() || "127.0.0.1";
      const port = Number(document.getElementById("mcpRemotePort").value.trim() || "8787");
      const res = await post("/api/mcp-remote/status", { host, port });
      add("/api/mcp-remote/status\\n" + res.text);
    });
    document.getElementById("btnMcpRemoteCopyConfig").addEventListener("click", async function () {
      saveStore();
      const text = buildMcpRemoteConfigText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        add("远程接入配置已复制到剪贴板。");
        return;
      }
      add("当前环境不支持剪贴板写入，以下为配置内容：\\n" + text);
    });
    document.getElementById("btnInstall").addEventListener("click", async function () {
      var force = document.getElementById("depForce").checked;
      var body = { force: force };
      if (document.getElementById("depFull").checked) {
        body.full = true;
      } else {
        body.full = false;
        if (document.getElementById("grpPw").checked) {
          var targets = [];
          if (document.getElementById("pwAll").checked) { targets.push("all"); }
          else {
            if (document.getElementById("pwChromium").checked) { targets.push("chromium"); }
            if (document.getElementById("pwChrome").checked) { targets.push("chrome"); }
            if (document.getElementById("pwFirefox").checked) { targets.push("firefox"); }
            if (document.getElementById("pwWebkit").checked) { targets.push("webkit"); }
            if (document.getElementById("pwMsedge").checked) { targets.push("msedge"); }
          }
          body.playwright = { enabled: true, targets: targets };
        }
        if (document.getElementById("grpMob").checked) {
          var platforms = [];
          if (document.getElementById("mobAndroid").checked) { platforms.push("android"); }
          if (document.getElementById("mobIos").checked) { platforms.push("ios"); }
          if (document.getElementById("mobHarmony").checked) { platforms.push("harmony"); }
          body.mobile = { enabled: true, platforms: platforms };
        }
      }
      if (!body.full && !body.playwright && !body.mobile) {
        add("请勾选「完整安装」或至少一类组件（Playwright / 移动驱动）");
        return;
      }
      var res = await post("/api/install-deps", body);
      add("/api/install-deps");
      if (res.ok) {
        try {
          var parsed = JSON.parse(res.text);
          var merged = parsed.merged;
          var lines = [];
          if (merged && Array.isArray(merged.summaryLines)) {
            lines = merged.summaryLines;
          }
          if (lines.length === 0 && Array.isArray(parsed.installDeps)) {
            parsed.installDeps.forEach(function (part) {
              if (part.summary && Array.isArray(part.summary.summaryLines)) {
                lines = lines.concat(part.summary.summaryLines);
              }
            });
          }
          if (lines.length > 0) {
            add("【安装摘要】");
            lines.forEach(function (line) { add("- " + line); });
          }
          var pkgs = merged || (parsed.installDeps && parsed.installDeps[0] && parsed.installDeps[0].summary);
          if (pkgs) {
            var inst = (pkgs.installedPackages || []).join(", ") || "—";
            var skip = (pkgs.skippedPackages || []).join(", ") || "—";
            add("npm 包 · 新装: " + inst + " · 已就绪: " + skip);
            var failed = pkgs.failedDrivers || [];
            if (failed.length > 0) {
              add("未就绪组件: " + failed.join(", "));
            }
          }
        } catch (e) { /* fall through */ }
      }
      add(res.text);
    });
    document.getElementById("btnStart").addEventListener("click", async function () {
      saveStore();
      const runAgent = document.getElementById("chkAgent").checked;
      const runMcp = document.getElementById("chkMcp").checked;
      const res = await post("/api/start", { runAgent: runAgent, runMcp: runMcp });
      add("/api/start\\n" + res.text);
      if (res.ok) {
        if (runAgent) document.getElementById("agentStatus").textContent = "运行中";
        if (runMcp) document.getElementById("mcpStatus").textContent = "运行中";
      }
    });
    document.getElementById("btnStop").addEventListener("click", async function () {
      const stopAgent = document.getElementById("chkAgent").checked;
      const stopMcp = document.getElementById("chkMcp").checked;
      const res = await post("/api/stop", { stopAgent: stopAgent, stopMcp: stopMcp });
      add("/api/stop\\n" + res.text);
      if (res.ok) {
        if (stopAgent) document.getElementById("agentStatus").textContent = "已停止";
        if (stopMcp) document.getElementById("mcpStatus").textContent = "未运行";
      }
    });
    loadStore();
    const es = new EventSource("/events");
    es.onmessage = function (e) { add(String(e.data ?? "")); };
  </script>
</body>
</html>`;
}
