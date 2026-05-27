import http from "node:http";
import { randomUUID } from "node:crypto";
import { URLSearchParams } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentConfig, BootstrapInput } from "./types.js";
import { persistAgentSetup } from "./setup-state.js";
import { runBootstrapInstallDeps } from "./bootstrap-deps.js";

interface SetupUiResult {
  payload: BootstrapInput;
}

type DependencyInstallScope = Exclude<NonNullable<BootstrapInput["dependencies"]>["dependencyInstallScope"], undefined>;

function parseDependencyInstallScope(value: unknown): DependencyInstallScope {
  if (
    value === "all" ||
    value === "playwright" ||
    value === "mobile" ||
    value === "android" ||
    value === "ios" ||
    value === "harmony" ||
    value === "appium" ||
    value === "drivers"
  ) {
    return value;
  }
  return "all";
}

function defaultPlaywrightTargets(): string[] {
  return ["chromium", "chrome"];
}

function htmlPage(csrfToken: string, port: number, host: string): string {
  const safePort = String(port);
  const safeHost = host.replace(/</g, "");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ADA Agent 首次配置</title>
  <style>
    :root { font-family: "Segoe UI", system-ui, sans-serif; color: #1a1a1a; }
    body { margin: 0; padding: 24px; background: #f6f7fb; }
    .wrap { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.35rem; margin: 0 0 8px; }
    .sub { color: #555; margin-bottom: 20px; font-size: 0.95rem; }
    section {
      background: #fff;
      border-radius: 10px;
      padding: 16px 18px;
      margin-bottom: 14px;
      box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    section h2 { margin: 0 0 12px; font-size: 1rem; color: #333; }
    label.field { display: block; margin-top: 10px; font-weight: 600; font-size: 0.85rem; }
    label.field span.hint { font-weight: 400; color: #666; font-size: 0.8rem; }
    input[type=text], input[type=password], input[type=number], select, textarea {
      width: 100%; padding: 8px 10px; margin-top: 4px; box-sizing: border-box;
      border: 1px solid #ccd; border-radius: 6px; font-size: 0.95rem;
    }
    textarea { min-height: 140px; resize: vertical; font-family: ui-monospace, monospace; font-size: 12px; }
    .row { display: flex; flex-wrap: wrap; gap: 12px 18px; margin-top: 8px; }
    .row label.chk { font-weight: 500; font-size: 0.88rem; display: flex; align-items: center; gap: 6px; }
    button.primary {
      margin-top: 8px; padding: 10px 18px; cursor: pointer; border: none; border-radius: 8px;
      background: #2563eb; color: #fff; font-size: 0.95rem;
    }
    button.primary:disabled { opacity: 0.55; cursor: not-allowed; }
    .foot { color: #666; font-size: 0.8rem; margin-top: 12px; }
    #logPanel { background: #0d1117; color: #c9d1d9; }
    #logBox { white-space: pre-wrap; word-break: break-word; min-height: 160px; }
    .err { color: #b91c1c; font-size: 0.9rem; margin-top: 8px; }
    .success { color: #15803d; font-size: 0.9rem; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>ADA Agent 首次配置</h1>
    <p class="sub">填写控制面连接信息、密钥与本地依赖选项。保存后可选择立即下载 Playwright 浏览器等依赖并在此查看日志。</p>
    <form id="f">
      <input type="hidden" id="csrf" value="${csrfToken}" />
      <section>
        <h2>控制面连接</h2>
        <label class="field">服务端地址 <span class="hint">（https:// 或 http://）</span>
          <input type="text" name="serverUrl" id="serverUrl" required placeholder="https://ada-control.example.com" autocomplete="off" /></label>
        <label class="field">租户 Tenant
          <input type="text" name="tenant" id="tenant" required placeholder="default" value="default" /></label>
        <label class="field">环境 Environment
          <input type="text" name="environment" id="environment" required placeholder="prod" value="prod" /></label>
        <label class="field">请求超时（毫秒）
          <input type="number" name="requestTimeoutMs" id="requestTimeoutMs" min="1000" step="500" placeholder="15000" /></label>
      </section>
      <section>
        <h2>认证</h2>
        <label class="field">认证方式
          <select name="authType" id="authType">
            <option value="token">API Token（密钥）</option>
            <option value="device_code">Device Code</option>
          </select></label>
        <label class="field">Token / 密钥 <span class="hint">（选 Token 时必填）</span>
          <input type="password" name="token" id="token" placeholder="粘贴控制台颁发的 Token" autocomplete="off" /></label>
      </section>
      <section>
        <h2>传输</h2>
        <label class="field">传输模式 Transport
          <select name="transportMode" id="transportMode">
            <option value="auto">auto（自动探测）</option>
            <option value="stream">stream（WebSocket）</option>
            <option value="http">http</option>
          </select></label>
        <label class="field">流式协议
          <select name="streamProtocol" id="streamProtocol">
            <option value="websocket">websocket</option>
            <option value="grpc">grpc</option>
          </select></label>
        <label class="field">设备标签 <span class="hint">（逗号分隔，可选）</span>
          <input type="text" name="deviceTags" id="deviceTags" placeholder="team-a, windows, lab-1" /></label>
      </section>
      <section>
        <h2>依赖与 Playwright 浏览器</h2>
        <div class="row">
          <label class="chk"><input type="checkbox" name="autoInstallOnStart" id="autoInstallOnStart" checked /> 以后每次启动 Agent 时自动检测/安装依赖</label>
          <label class="chk"><input type="checkbox" name="runDependencyInstallNow" id="runDependencyInstallNow" /> 保存后立即执行依赖安装并在下方显示日志</label>
        </div>
        <label class="field" style="margin-top:12px">立即安装时的范围
          <select id="dependencyInstallScope">
            <option value="all">完整（Playwright + Appium 与驱动）</option>
            <option value="playwright">仅 Web / Playwright 栈</option>
            <option value="mobile">仅移动端（Android + iOS + Harmony）</option>
            <option value="android">仅 Android 驱动</option>
            <option value="ios">仅 iOS 驱动</option>
            <option value="harmony">仅 Harmony 驱动</option>
            <option value="appium">仅 Appium 主包（不含驱动）</option>
            <option value="drivers">仅 Appium 驱动（按配置）</option>
          </select></label>
        <label class="field">Playwright 浏览器包 <span class="hint">（至少选一项；选「全部」将安装所有渠道）</span></label>
        <div class="row" id="pwRow">
          <label class="chk"><input type="checkbox" name="pw" value="chromium" checked /> Chromium</label>
          <label class="chk"><input type="checkbox" name="pw" value="chrome" checked /> Chrome for Testing</label>
          <label class="chk"><input type="checkbox" name="pw" value="firefox" /> Firefox</label>
          <label class="chk"><input type="checkbox" name="pw" value="webkit" /> WebKit</label>
          <label class="chk"><input type="checkbox" name="pw" value="msedge" /> Edge</label>
          <label class="chk"><input type="checkbox" name="pw" value="all" /> 全部 (all)</label>
        </div>
        <label class="field">Playwright 下载镜像 (PLAYWRIGHT_DOWNLOAD_HOST) <span class="hint">（可选，默认用国内镜像）</span>
          <input type="text" id="playwrightDownloadHost" placeholder="https://npmmirror.com/mirrors/playwright" /></label>
        <label class="field">Appium Server 地址 <span class="hint">（可选覆盖配置）</span>
          <input type="text" id="appiumServerUrl" placeholder="http://127.0.0.1:4723" /></label>
      </section>
      <section>
        <h2>其它（可选）</h2>
        <div class="row">
          <label class="chk"><input type="checkbox" id="graphicsEnabled" /> 启用语义图形回退（LLM 截图）</label>
          <label class="chk"><input type="checkbox" id="monitoringEnabled" /> 启用监控采样（缩略图）</label>
        </div>
      </section>
      <button type="submit" class="primary" id="btn">保存并继续</button>
      <p id="msg" class="err" style="display:none"></p>
      <p id="ok" class="success" style="display:none"></p>
    </form>
    <section id="logPanel" style="display:none">
      <h2>安装日志</h2>
      <textarea id="logBox" readonly spellcheck="false"></textarea>
    </section>
    <p class="foot">本地页面：http://${safeHost}:${safePort}</p>
  </div>
  <script>
  (function(){
    var f = document.getElementById("f");
    var logPanel = document.getElementById("logPanel");
    var logBox = document.getElementById("logBox");
    var msg = document.getElementById("msg");
    var ok = document.getElementById("ok");
    var btn = document.getElementById("btn");
    function gatherPayload() {
      var auth = document.getElementById("authType").value;
      var tags = (document.getElementById("deviceTags").value || "").split(",").map(function(t){ return t.trim(); }).filter(Boolean);
      var pw = []; document.querySelectorAll('input[name="pw"]:checked').forEach(function(c){ pw.push(c.value); });
      if (pw.indexOf("all") >= 0) { pw.length = 0; pw.push("all"); }
      else if (!pw.length) { pw.push("chromium"); pw.push("chrome"); }
      var rt = document.getElementById("requestTimeoutMs").value;
      var deps = {
        autoInstallOnStart: document.getElementById("autoInstallOnStart").checked,
        playwrightInstallTargets: pw,
        playwrightDownloadHost: document.getElementById("playwrightDownloadHost").value.trim(),
        runDependencyInstallNow: document.getElementById("runDependencyInstallNow").checked,
        dependencyInstallScope: document.getElementById("dependencyInstallScope").value,
        appiumServerUrl: document.getElementById("appiumServerUrl").value.trim(),
        graphicsEnabled: document.getElementById("graphicsEnabled").checked ? true : undefined,
        monitoringEnabled: document.getElementById("monitoringEnabled").checked ? true : undefined
      };
      if (rt) { var n = parseInt(rt, 10); if (!isNaN(n)) deps.requestTimeoutMs = n; }
      return {
        csrf: document.getElementById("csrf").value,
        serverUrl: document.getElementById("serverUrl").value.trim(),
        tenant: document.getElementById("tenant").value.trim(),
        environment: document.getElementById("environment").value.trim(),
        authType: auth,
        token: document.getElementById("token").value || undefined,
        transportMode: document.getElementById("transportMode").value,
        streamProtocol: document.getElementById("streamProtocol").value,
        deviceTags: tags,
        dependencies: deps
      };
    }
    function appendLog(line) { logBox.value += line + "\\n"; logBox.scrollTop = logBox.scrollHeight; }
    f.addEventListener("submit", function(ev){
      ev.preventDefault();
      msg.style.display = "none"; ok.style.display = "none";
      var p = gatherPayload();
      if (p.authType === "token" && !p.token) {
        msg.textContent = "请填写 Token（API 密钥）。"; msg.style.display = "block"; return;
      }
      btn.disabled = true;
      logBox.value = "";
      logPanel.style.display = p.dependencies.runDependencyInstallNow ? "block" : "none";
      fetch("/api/submit-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p)
      }).then(function(resp){
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        var reader = resp.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        function pump() {
          return reader.read().then(function(res){
            if (res.done) {
              btn.disabled = false;
              return;
            }
            buf += dec.decode(res.value, { stream: true });
            var parts = buf.split("\\n\\n");
            buf = parts.pop() || "";
            parts.forEach(function(block){
              var m = block.match(/^data: (.+)$/m);
              if (!m) return;
              try {
                var ev = JSON.parse(m[1]);
                if (ev.event === "log" && ev.line) appendLog(ev.line);
                if (ev.event === "saved") { ok.textContent = "配置已保存。"; ok.style.display = "block"; }
                if (ev.event === "done") {
                  ok.textContent = "完成。可关闭此页，回到终端继续。";
                  ok.style.display = "block"; btn.disabled = false;
                }
                if (ev.event === "error") { msg.textContent = ev.message || "错误"; msg.style.display = "block"; btn.disabled = false; }
              } catch(e) {}
            });
            return pump();
          });
        }
        return pump();
      }).catch(function(e){
        msg.textContent = String(e.message || e); msg.style.display = "block"; btn.disabled = false;
      });
    });
  })();
  </script>
</body>
</html>`;
}

function parseFormUrlEncoded(body: string): BootstrapInput {
  const form = new URLSearchParams(body);
  const deviceTags = (form.get("deviceTags") ?? "")
    .split(",")
    .map((tag: string) => tag.trim())
    .filter(Boolean);
  const pw = form.getAll("pw").map((x) => String(x).toLowerCase());
  const rtRaw = form.get("requestTimeoutMs");
  const rt = rtRaw ? parseInt(rtRaw, 10) : undefined;
  return buildBootstrapFromParts({
    serverUrl: form.get("serverUrl") ?? "",
    tenant: form.get("tenant") ?? "",
    environment: form.get("environment") ?? "",
    authType: (form.get("authType") as BootstrapInput["authType"]) ?? "token",
    token: form.get("token") ?? undefined,
    transportMode: (form.get("transportMode") as BootstrapInput["transportMode"]) ?? "stream",
    streamProtocol: (form.get("streamProtocol") as BootstrapInput["streamProtocol"]) ?? "websocket",
    deviceTags,
    playwrightTargets: pw.length ? pw : defaultPlaywrightTargets(),
    autoInstallOnStart: form.get("autoInstallOnStart") === "on",
    runDependencyInstallNow: form.get("runDependencyInstallNow") === "on",
    dependencyInstallScope: parseDependencyInstallScope(form.get("dependencyInstallScope")),
    playwrightDownloadHost: form.get("playwrightDownloadHost") ?? "",
    appiumServerUrl: form.get("appiumServerUrl") ?? "",
    requestTimeoutMs: rt,
    graphicsEnabled: form.get("graphicsEnabled") === "on",
    monitoringEnabled: form.get("monitoringEnabled") === "on"
  });
}

function buildBootstrapFromParts(parts: {
  serverUrl: string;
  tenant: string;
  environment: string;
  authType: BootstrapInput["authType"];
  token?: string;
  transportMode: BootstrapInput["transportMode"];
  streamProtocol: BootstrapInput["streamProtocol"];
  deviceTags: string[];
  playwrightTargets: string[];
  autoInstallOnStart: boolean;
  runDependencyInstallNow: boolean;
  dependencyInstallScope: DependencyInstallScope;
  playwrightDownloadHost: string;
  appiumServerUrl: string;
  requestTimeoutMs?: number;
  graphicsEnabled?: boolean;
  monitoringEnabled?: boolean;
}): BootstrapInput {
  const deps: BootstrapInput["dependencies"] = {
    autoInstallOnStart: parts.autoInstallOnStart,
    playwrightInstallTargets: parts.playwrightTargets,
    playwrightDownloadHost: parts.playwrightDownloadHost || undefined,
    runDependencyInstallNow: parts.runDependencyInstallNow,
    dependencyInstallScope: parts.dependencyInstallScope
  };
  if (parts.appiumServerUrl.trim()) {
    deps.appiumServerUrl = parts.appiumServerUrl.trim();
  }
  if (parts.requestTimeoutMs !== undefined && Number.isFinite(parts.requestTimeoutMs)) {
    deps.requestTimeoutMs = Math.max(1000, Math.floor(parts.requestTimeoutMs));
  }
  if (parts.graphicsEnabled) {
    deps.graphicsEnabled = true;
  }
  if (parts.monitoringEnabled) {
    deps.monitoringEnabled = true;
  }
  return {
    serverUrl: parts.serverUrl,
    tenant: parts.tenant,
    environment: parts.environment,
    authType: parts.authType,
    token: parts.token,
    transportMode: parts.transportMode,
    streamProtocol: parts.streamProtocol,
    deviceTags: parts.deviceTags,
    dependencies: deps
  };
}

function validateInput(input: BootstrapInput): string | null {
  if (!input.serverUrl.startsWith("http")) {
    return "服务端地址必须以 http:// 或 https:// 开头。";
  }
  if (!input.tenant || !input.environment) {
    return "Tenant 与 Environment 不能为空。";
  }
  if (input.authType === "token" && !input.token) {
    return "当前为 Token 认证，请填写 Token（密钥）。";
  }
  return null;
}

function writeSseData(res: ServerResponse, obj: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function runSetupUi(config: AgentConfig): Promise<SetupUiResult> {
  const csrfToken = randomUUID();

  return new Promise<SetupUiResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Setup UI timeout"));
    }, config.bootstrapUI.sessionTtlSec * 1000);

    const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlPage(csrfToken, config.bootstrapUI.port, config.bootstrapUI.host));
        return;
      }

      if (req.method === "POST" && req.url === "/api/submit-stream") {
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        req.on("end", () => {
          void (async () => {
            function abortSetup(status: number, message: string): void {
              clearTimeout(timeout);
              res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
              res.end(message);
              server.close();
              reject(new Error(message));
            }

            let payload: BootstrapInput;
            try {
              const parsed = JSON.parse(body) as Record<string, unknown>;
              if (parsed.csrf !== csrfToken) {
                abortSetup(403, "invalid csrf");
                return;
              }
              const d = parsed.dependencies as Record<string, unknown> | undefined;
              const pwRaw = d?.playwrightInstallTargets;
              const pw = Array.isArray(pwRaw)
                ? pwRaw.map((x) => String(x).toLowerCase())
                : defaultPlaywrightTargets();
              const tm = String(parsed.transportMode ?? "stream");
              const transportMode = (tm === "http" || tm === "auto" || tm === "stream" ? tm : "stream") as BootstrapInput["transportMode"];
              payload = buildBootstrapFromParts({
                serverUrl: String(parsed.serverUrl ?? ""),
                tenant: String(parsed.tenant ?? ""),
                environment: String(parsed.environment ?? ""),
                authType: (parsed.authType === "device_code" ? "device_code" : "token") as BootstrapInput["authType"],
                token: parsed.token !== undefined ? String(parsed.token) : undefined,
                transportMode,
                streamProtocol: (parsed.streamProtocol === "grpc" ? "grpc" : "websocket") as BootstrapInput["streamProtocol"],
                deviceTags: Array.isArray(parsed.deviceTags)
                  ? parsed.deviceTags.filter((x): x is string => typeof x === "string")
                  : [],
                playwrightTargets: pw.length ? pw : defaultPlaywrightTargets(),
                autoInstallOnStart: d?.autoInstallOnStart !== false,
                runDependencyInstallNow: d?.runDependencyInstallNow === true,
                dependencyInstallScope: parseDependencyInstallScope(d?.dependencyInstallScope),
                playwrightDownloadHost: d?.playwrightDownloadHost !== undefined ? String(d.playwrightDownloadHost) : "",
                appiumServerUrl: d?.appiumServerUrl !== undefined ? String(d.appiumServerUrl) : "",
                requestTimeoutMs:
                  d?.requestTimeoutMs !== undefined && Number.isFinite(Number(d.requestTimeoutMs))
                    ? Math.floor(Number(d.requestTimeoutMs))
                    : undefined,
                graphicsEnabled: d?.graphicsEnabled === true,
                monitoringEnabled: d?.monitoringEnabled === true
              });
            } catch {
              abortSetup(400, "invalid json");
              return;
            }

            const err = validateInput(payload);
            if (err) {
              abortSetup(400, err);
              return;
            }

            let saved;
            try {
              saved = await persistAgentSetup(config, payload);
            } catch (error) {
              abortSetup(
                500,
                error instanceof Error ? error.message : String(error)
              );
              return;
            }

            res.writeHead(200, {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive"
            });

            try {
              writeSseData(res, { event: "saved" });
              if (payload.dependencies?.runDependencyInstallNow) {
                const only = parseDependencyInstallScope(payload.dependencies?.dependencyInstallScope);
                await runBootstrapInstallDeps([], {
                  config: saved,
                  installDepsSpec: only,
                  onLogLine: (line: string) => writeSseData(res, { event: "log", line })
                });
              }
              writeSseData(res, { event: "done" });
            } catch (error) {
              writeSseData(res, {
                event: "error",
                message: error instanceof Error ? error.message : String(error)
              });
            } finally {
              res.end();
              clearTimeout(timeout);
              server.close();
              resolve({ payload });
            }
          })().catch((error) => {
            clearTimeout(timeout);
            server.close();
            reject(error instanceof Error ? error : new Error(String(error)));
          });
        });
        return;
      }

      if (req.method === "POST" && req.url === "/submit") {
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        req.on("end", () => {
          void (async () => {
            const form = new URLSearchParams(body);
            if (form.get("csrf") !== csrfToken) {
              res.writeHead(403);
              res.end("invalid csrf");
              return;
            }
            const payload = parseFormUrlEncoded(body);
            const err = validateInput(payload);
            if (err) {
              res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
              res.end(err);
              return;
            }
            try {
              await persistAgentSetup(config, payload);
            } catch (error) {
              res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
              res.end(error instanceof Error ? error.message : String(error));
              return;
            }
            clearTimeout(timeout);
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("配置已保存，可关闭此页。");
            server.close();
            resolve({ payload });
          })().catch((error) => {
            clearTimeout(timeout);
            server.close();
            reject(error instanceof Error ? error : new Error(String(error)));
          });
        });
        return;
      }

      res.writeHead(404);
      res.end("not found");
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (err.code === "EADDRINUSE") {
        const { host, port } = config.bootstrapUI;
        reject(
          new Error(
            `引导端口 ${host}:${port} 已被占用（EADDRINUSE）。可能已有 ADA Agent/引导页在运行。` +
              `请结束占用进程后重试，或浏览器打开 http://${host}:${port} 完成配置。` +
              ` Windows 排查: netstat -ano | findstr ${port}`
          )
        );
        return;
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    });

    server.listen(config.bootstrapUI.port, config.bootstrapUI.host, () => {
      const url = `http://${config.bootstrapUI.host}:${config.bootstrapUI.port}`;
      console.log(`[ADA-AGENT] setup UI ready at ${url}`);
      if (config.bootstrapUI.autoOpenBrowser) {
        openBrowser(url).catch(() => {
          console.log("[ADA-AGENT] auto-open browser skipped");
        });
      }
    });
  });
}

async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  const platform = process.platform;

  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}
