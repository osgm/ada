# ADA MCP 接入手册

将 ADA Web / 移动端自动化能力以 **MCP 工具**对外暴露。Playwright 步骤映射见 [`Playwright-ADA-兼容映射.md`](Playwright-ADA-兼容映射.md)。

| 主题 | 文档 |
|------|------|
| 部署 / 运维 | [`ADA-部署手册.md`](ADA-部署手册.md) |
| 架构 | [`ADA-架构设计方案.md`](ADA-架构设计方案.md) |
| 开发 / 测试 | [`ADA-开发手册.md`](ADA-开发手册.md) |
| npm 发布 | [`scripts/README.md`](../scripts/README.md) |

**推荐版本（2026-05）**：`@ada-mcp/launcher@0.1.49` 与 `@ada-mcp/mcp-server@0.1.49` **同号发布**（示例：`pnpm dlx @ada-mcp/launcher@0.1.49`）。

---

## 1. 快速开始

### 1.1 标准安装（MCP Host）

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "pnpm",
      "args": ["dlx", "@ada-mcp/launcher@0.1.49"]
    }
  }
}
```

命令行：

```bash
pnpm dlx @ada-mcp/launcher@0.1.49
# npx 等价（Windows 建议仍用 launcher，勿单独 npx mcp-server）
npx -y @ada-mcp/launcher@0.1.49
```

| 包 | 作用 |
|----|------|
| `@ada-mcp/launcher` | registry 测速 → `pnpm dlx` / `npx` → mcp-server（**零 npm 依赖**） |
| `@ada-mcp/mcp-server` | 21 个 MCP 工具、依赖安装、驱动插件 |

传输：**stdio**（默认）；亦支持远程 HTTP（见 §4）。本仓库开发：`npm run mcp:dev`。

**推荐 Cursor / Claude 配置（隐藏 T3 工具）**：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "pnpm",
      "args": ["dlx", "@ada-mcp/launcher@0.1.49"],
      "env": {
        "ADA_MCP_HIDE_ADVANCED": "1"
      }
    }
  }
}
```

脚本侧 `connectMcp()` 亦默认 `ADA_MCP_HIDE_ADVANCED=1`（仅暴露 `ada_web_action` / `ada_mobile_action` 等 T1）。需要 `ada_execute` / `ada_invoke` 时设 `ADA_MCP_HIDE_ADVANCED=0`。

### 1.2 版本与 registry

| 写法 | 行为 |
|------|------|
| `@ada-mcp/launcher@0.1.49` | 钉版本（生产推荐） |
| `@ada-mcp/launcher` | 安装 registry **latest** |
| `ADA_MCP_SERVER_VERSION` | 仅覆盖内层 mcp-server 版本 |
| `ADA_MCP_REGISTRY` | **强制**安装源（跳过测速），如 `https://registry.npmjs.org/` |

```powershell
set ADA_MCP_REGISTRY=https://registry.npmjs.org/
pnpm dlx @ada-mcp/launcher@0.1.49
```

> **注意**：`pnpm dlx --registry URL pkg` **无效**；不要用 `pnpm dlx --registry` 前缀。镜像未同步新版本时，**0.1.48+ launcher** 会在需要时自动回退 npmjs。

> **0.1.41 已知问题**：曾错误依赖未发布的 `@ada/download-probe`，`pnpm dlx` 安装阶段 404；请使用 **0.1.48+**。

### 1.3 启动时装依赖

| `ADA_MCP_INSTALL_DEPS` / `--install-deps=` | 行为 |
|---------------------------------------------|------|
| 未配置 | 默认 **playwright**（含浏览器） |
| `playwright` / `mobile` / `android` / `ios` / `harmony` / `all` | 见名；可逗号组合。`all` = Playwright（npm+浏览器）+ 移动驱动（Android/UIA2、iOS/WDA、Harmony/hypium+hdc） |
| `none` / `skip` 或 `ADA_MCP_SKIP_INSTALL_DEPS=1` | 跳过 |

Host 示例：`"args": ["dlx", "@ada-mcp/launcher@0.1.49", "--install-deps=playwright,mobile"]`

工作区：`.ada-mcp-playwright-host` 写在 **Host 项目目录**（`INIT_CWD`），勿写 monorepo 源码路径。

**依赖解析优先级**（install-deps / health / doctor 一致）：系统全局 npm → 工作区/环境 → `~/.ada/deps`；全局已满足的包**不会**重复迁入共享目录。

MCP 服务端对安装与移动探针直接依赖 **`@ada/install-deps`**、**`@ada/runtime-probe`**（与 `agent-core` 一致），npm 发布时由 `build-mcp-npm.mjs` 从 monorepo 源码一并打入 `cli.cjs`。

---

## 2. 工具一览（21）

`ada-mcp-server` 暴露 **21** 个工具（`ada_` + 蛇形命名）。

| # | 工具 | 分类 | 何时选用（AI 路由提示） |
|---|------|------|------------------------|
| 1 | `ada_health` | 观测 | 会话首选：快速探活、依赖是否就绪 |
| 2 | `ada_diagnostics` | 观测 | 健康异常时深度诊断（Node/驱动/路径） |
| 3 | `ada_plugins` | 观测 | 确认已加载 playwright/android/ios/harmony |
| 4 | `ada_perf_summary` | 观测 | 统计各工具耗时 p50/p95 |
| 5 | `ada_config` | 配置 | 读取生效配置与路径 |
| 6 | `ada_install_deps` | 配置 | 缺 Playwright/移动依赖/Harmony 时安装 |
| 7 | `ada_start_once` | 配置 | 模拟 agent `start --once` 启动流程 |
| 8 | `ada_web_action` | 执行-Web | **首选**：网页 navigate/click/type/截图等 |
| 9 | `ada_mobile_action` | 执行-Mobile | **首选**：Android/iOS/Harmony 点击/滑动/启停 App |
| 10 | `ada_execute` | 执行（**T3，不推荐日常**） | 通用信封；优先用 #8/#9/`ada_mobile_recipe` |
| 11 | `ada_invoke` | 执行-底层 | Playwright/Android/iOS/Harmony 原生 API（需 `riskApproved`） |
| 12 | `ada_run_task_file` | 编排 | 运行 `.tasks.json` 场景文件 |
| 13 | `ada_batch_actions` | 编排 | 同会话多步串联（无文件） |
| 14 | `ada_extract` | 数据-Web | 提取页面 text/list/table |
| 15 | `ada_assertions` | 数据-Web | 断言可见/文案/URL |
| 16 | `ada_mobile_extract` | 数据-Mobile | 提取文案或 pageSource |
| 17 | `ada_mobile_assertions` | 数据-Mobile | 移动端可见/文案断言 |
| 18 | `ada_sessions` | 会话 | 列出活跃 sessionId |
| 19 | `ada_close_session` | 会话 | 关闭单个会话 |
| 20 | `ada_close_all_sessions` | 会话 | 关闭全部会话（收尾/重载 MCP） |
| 21 | `ada_risk_policy` | 安全 | 查看/维护高风险命令白名单 |

> MCP `ListTools` 返回的 **description** 含 `[分类]`、`USE WHEN`、`KEY ARGS` 等英文结构化提示，便于 Cursor/Claude 等自动选工具；源码见 `apps/ada-mcp-server/src/mcp-tool-definitions.ts`。

**架构**：Web = Playwright（默认）；移动端 = Android（adb+uia2）/ iOS（WDA）/ Harmony（hypium-driver + hdc）。默认 **严格真实执行**；`allowMock: true` 才 mock。

**选用**：

```text
探活/装依赖 → ada_health / ada_install_deps
Web E2E     → ada_web_action（playwright=本机浏览器 Profile）
App         → ada_mobile_action；业务 recipe → ada_mobile_recipe
Harmony     → ada_invoke（driver-harmony）或 mobile 能力扩展
底层 API    → ada_invoke
多步        → ada_batch_actions / ada_run_task_file
结束        → ada_close_session / ada_close_all_sessions
避免        → ada_execute（T3，仅通用 runner 需要时）
```

**Web 命令**：`navigate`、`click`、`type`、`screenshot`、`scroll`、`newTab`…（非 `invoke`，用 `ada_invoke`）

**移动命令**：`click`、`swipe`、`launchApp`、`screenshot`…

**常用 payload**：`sessionId`、`engine`（web）、`headless`、`bringToFront`、`browser`/`channel`、`userDataDir`/`profile`、`cdpEndpoint`、`locator`、`serverUrl`+`capabilities`（移动）

**Web 默认行为（无需每次写 headless）**：未指定时 **有头可见**（`headless` 默认 `false`），并 **`bringToFront` 置前**。CI/无头请设 `payload.headless: true` 或环境变量 `ADA_PLAYWRIGHT_HEADLESS=true`；关闭置前：`bringToFront: false` 或 `ADA_PLAYWRIGHT_BRING_TO_FRONT=false`。

**发布前验证**：`npm run test:mcp:bundled`（`scripts/release/mcp-bundled-smoke.mjs`，见 [`scripts/脚本清单.md`](../scripts/脚本清单.md)）。

---

## 3. 调用示例

### 3.1 Web：`ada_web_action`

```json
{
  "command": "click",
  "sessionId": "web-1",
  "payload": {
    "url": "https://example.com",
    "headless": false,
    "locator": { "text": "More information" }
  }
}
```

本机 Firefox 配置目录（Playwright 自带 Firefox，勿指向系统 `firefox.exe`）：

```json
{
  "command": "navigate",
  "sessionId": "ff-1",
  "payload": {
    "url": "https://www.jd.com",
    "browser": "firefox",
    "headless": false,
    "userDataDir": "D:\\ada-firefox-profile"
  }
}
```

**CDP 附着**（可选自动拉起，无需手开浏览器）：

```json
{
  "command": "navigate",
  "sessionId": "chrome-cdp",
  "payload": {
    "url": "https://www.jd.com",
    "headless": false,
    "channel": "chrome",
    "cdpAutoLaunch": true,
    "cdpPort": 9222
  }
}
```

Firefox CDP（129+，端口与启动参数与 Chrome 不同，驱动会自动处理）：

```json
{
  "payload": {
    "browser": "firefox",
    "headless": false,
    "cdpAutoLaunch": true,
    "cdpPort": 9223,
    "userDataDir": "D:\\ada-firefox-profile"
  }
}
```

也可仅附着已开调试端口的浏览器：`"cdpEndpoint": "http://127.0.0.1:9222"`（不设 `cdpAutoLaunch` 时需自行启动）。

环境变量：`ADA_PLAYWRIGHT_CDP_AUTO_LAUNCH=true`、`ADA_PLAYWRIGHT_CDP_PORT`（Chrome 默认 9222）、`ADA_PLAYWRIGHT_CDP_PORT_FIREFOX`（默认 9223）。

### 3.2 移动：`ada_mobile_action`

```json
{
  "platform": "android",
  "command": "screenshot",
  "sessionId": "app-1",
  "payload": {
    "capabilities": {
      "platformName": "Android",
      "automationName": "UiAutomator2",
      "udid": "emulator-5554"
    }
  }
}
```

### 3.3 `ada_invoke`（多驱动低层通道）

| `payload.engine` / `platform` | 场景 |
|-------------------------------|------|
| 省略 / `playwright` | Web 默认 |
| `android` / `ios` / `harmony` | 移动平台直连通道 |

未装对应驱动插件时将返回插件未安装错误，不做静默回退。

Playwright 透传示例：

```json
{
  "platform": "web",
  "sessionId": "inv-1",
  "riskApproved": true,
  "target": "page",
  "method": "goto",
  "args": ["https://www.jd.com"],
  "payload": { "browser": "firefox", "headless": false }
}
```

Android **adb method** invoke（无需 UiAutomator2 Server）：

```json
{
  "platform": "android",
  "sessionId": "inv-android-adb",
  "riskApproved": true,
  "command": "invoke",
  "payload": {
    "mode": "method",
    "target": "adb",
    "method": "getState",
    "args": []
  }
}
```

Android **UIA2 HTTP** invoke（需 `ADA_ANDROID_UIA2_SERVER_URL` 或 payload.serverUrl）：

```json
{
  "platform": "android",
  "sessionId": "inv-android-uia2",
  "riskApproved": true,
  "command": "invoke",
  "payload": {
    "serverUrl": "http://127.0.0.1:8200",
    "capabilities": { "platformName": "Android", "automationName": "UiAutomator2" },
    "mode": "http",
    "http": { "method": "GET", "path": "/status" }
  }
}
```

iOS **WDA HTTP** invoke：

```json
{
  "platform": "ios",
  "sessionId": "inv-ios-wda",
  "riskApproved": true,
  "command": "invoke",
  "payload": {
    "serverUrl": "http://127.0.0.1:8100",
    "mode": "http",
    "http": { "method": "GET", "path": "/status" }
  }
}
```

会话失效时驱动会自动 **重建 WebDriver 会话并重试一次**（WDA / UiAutomator2）。

移动 bootstrap 环境变量（可选）：

| 变量 | 说明 |
|------|------|
| `ADA_ANDROID_UIA2_BOOTSTRAP` | `true` 时 install-deps 尝试安装并启动设备端 UiAutomator2 |
| `ADA_ANDROID_UIA2_SERVER_URL` | UIA2 HTTP 地址，默认 `http://127.0.0.1:8200` |
| `ADA_IOS_WDA_BOOTSTRAP` | `true` 时 macOS 上 xcodebuild 拉起 WebDriverAgent |
| `ADA_WDA_SERVER_URL` | WDA 地址，默认 `http://127.0.0.1:8100` |
| `ADA_WDA_PROJECT_PATH` | 本地 WebDriverAgent.xcodeproj 路径 |

WDA / UIA2 **进程挂掉**时：在对应 `*_BOOTSTRAP=true` 下，驱动会先尝试 **bootstrap 重启 Server**，再 **重建 WebDriver 会话**并重试请求（30s 冷却）。

### 3.4 其它

| 工具 | 示例要点 |
|------|----------|
| `ada_run_task_file` | `{ "file": "tasks/web-real.tasks.json" }` |
| `ada_install_deps` | `{ "only": "playwright" }` |
| `ada_batch_actions` | `actions[]` + `onFailure`: `stop` \| `continue` |

---

## 4. 远程 HTTP / SSE（可选）

脚本层可通过 **Streamable HTTP** 连接远程 MCP（与 stdio 工具集相同），不必在本地 `npx tsx` 起子进程：

```bash
# 终端 1：远程 MCP（需 API Key）
npx tsx apps/ada-mcp-server/src/cli.ts server --host=0.0.0.0 --port=8787 --api-key=YOUR_KEY
```

```javascript
// 终端 2：使用 @modelcontextprotocol/sdk Client + URL（示例伪代码）
// url: http://127.0.0.1:8787/mcp  headers: { Authorization: "Bearer YOUR_KEY" }
// 将 client 传入 open(device(...), { via: "mcp", client })
```

Python 当前默认 **stdio 桥**（`ada_mcp.connect_mcp()` → `ada-mcp-bridge.mjs`）；远程 HTTP 请用 MCP SDK 自建 `Client` 后传入 `open(..., {"via":"mcp","client": client})`。

Agent **transport**（`apps/ada-agent`）走 HTTP/WebSocket 时，已优先映射为 `ada_web_action` / `ada_mobile_action` / `ada_mobile_recipe`，而非 `ada_execute`。

```bash
ada-mcp server --host=127.0.0.1 --port=8787 --api-key=TOKEN --allow-risky=true
```

| 接口 | 说明 |
|------|------|
| `GET /health`、`GET /status` | 无需鉴权 |
| `POST /mcp` | Streamable HTTP MCP（需 `x-api-key` 或 `Authorization: Bearer`） |
| `POST /tool/call` | 兼容旧客户端 |

---

## 5. 命令超时（防挂起）

内核对所有 `ada_execute` / `ada_mobile_action` / `ada_web_action` 命令施加**墙钟超时**（与 `payload.timeoutMs` 的「等待/定位」语义分离）：

| 优先级 | 配置 |
|--------|------|
| 1 | `payload.commandTimeoutMs` |
| 2 | 环境变量 `ADA_COMMAND_TIMEOUT_MS` |
| 3 | 默认 **30s**（`DEFAULT_COMMAND_TIMEOUT_MS`） |

超时返回 `COMMAND_TIMEOUT`，并尝试销毁对应驱动会话，避免泄漏。

移动端补充：

- **控件查找**：`payload.locatorTimeoutMs`；未设时可用 `payload.timeoutMs`，驱动侧上限约 **8s**（鸿蒙 `findComponent` 等）。
- **鸿蒙滑动时长**：`payload.durationMs`（毫秒，越大越慢）或 `payload.swipePreset`：`fast`(200) / `normal`(400) / `slow`(800)；历史字段 `speed` 同 `durationMs`。环境变量 `ADA_HARMONY_SWIPE_SPEED_MS` 为未指定时的默认时长。

学习用 E2E 示例见 `scripts/examples/jd-*-e2e.mjs`（统一入口：`scripts/lib/ada-client.mjs`）。产品化脚手架仍可用 `@ada/e2e-kit`（`createE2eHarness`、步骤超时、`summary.json`）。

### 移动 recipe（`custom.action`，Android / 鸿蒙通用，无内置 App）

| action | 说明 |
|--------|------|
| `dump_ui` | 导出 UI 树（Android XML / 鸿蒙 JSON）；兼容 `dump_hierarchy` / `dump_layout` |
| `tap_search` | 启发式点击搜索入口或输入框 |
| `fill_search` | 需 `payload.text` 或 `custom.text`：打开搜索 → 输入 → 回车 |

页面导航请用脚本 `phone.goto` / `phone.back` 或 `ada_mobile_action` 的 `launchApp` / `click` / `back`。

**设备**：`executor.runCommand` 自动合并 `.ada-agent/devices.json` 默认 `udid` / `deviceSn`。

**被测 App**（npm 消费者用环境变量，勿依赖仓库内 YAML）：

- `ADA_ANDROID_APP_ID` / `ADA_HARMONY_APP_ID` / `ADA_HARMONY_ABILITY_ID` / `ADA_WEB_URL`
- 可选 `ADA_APP_PROFILE` + `ADA_APP_PROFILES_FILE`（JSON 或含 `appProfiles` 的 YAML）

**启发式文案**（默认英文 `search`/`home`/`TextInput`；中文等通过 payload 覆盖）：

```json
"uiHeuristics": {
  "searchEntryLabels": ["search", "搜索"],
  "searchInputLabels": ["search", "input", "请输入"]
}
```

或 `ADA_UI_HEURISTICS_JSON` / `ADA_UI_SEARCH_ENTRY_LABELS=search,搜索`。

**E2E 脚本分层**：

| 层级 | 路径 | 说明 |
|------|------|------|
| 学习示例（推荐） | `scripts/examples/jd-*-e2e.mjs` | 扁平脚本 + `ada-client.mjs`；`npm run test:jd-web` / `test:jd-android` / `test:jd-harmony` |
| Python 对照 | `scripts/examples/python/jd_*_e2e.py` | `scripts/lib/ada_client.py` 统一入口，调同一 executor |
| 产品化脚手架 | `@ada/e2e-kit` | `resolveE2eTarget`、`createE2eHarness`、`mobileRecipe`、CLI profile |
| 目录索引 | [`scripts/README.md`](../scripts/README.md) | `build/` / `release/` / `test/` / `examples/` |

不必为示例单独新增 MCP tool；`ada_web_action` / `ada_mobile_action` / `ada_mobile_recipe` 已覆盖。

---

## 6. 镜像与环境变量

launcher **阶段 A**：测速选 registry → 写 `npm_config_registry` / 项目 `.npmrc`。**阶段 B**（`install-deps`）：npm 包 + Playwright CDN 再测速。

| 变量 | 说明 |
|------|------|
| `ADA_MCP_REGISTRY` | 强制安装 registry（推荐官方源兜底） |
| `ADA_MCP_PACKAGE_RUNNER` | `pnpm` \| `npx` \| `auto` |
| `ADA_MCP_INSTALL_DEPS` / `ADA_MCP_SKIP_INSTALL_DEPS` | 启动时装依赖 |
| `ADA_NPM_PROXY_REGISTRY` | install-deps 时 registry 候选置顶 |
| `ADA_REGISTRY_CANDIDATES` | 额外 registry，逗号分隔 |
| `PLAYWRIGHT_DOWNLOAD_HOST` | 强制 Playwright CDN |
| `ADA_PLAYWRIGHT_*` | 浏览器路径、无头等 |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | Android SDK 路径 |
| `ADA_TOOLS_DIR` / `ADA_HARMONY_DEVICE_SN` | 鸿蒙 hdc 工具与设备 SN |

内置 registry 候选（安装前 Range 测速选最快，相同时按序优先）：**npmmirror（阿里）** → npmjs → 腾讯 → 上海交大 → 中科大 → 华为云。

**直连 mcp-server**（无 launcher 测速）：

```json
{ "command": "npx", "args": ["-y", "@ada-mcp/mcp-server@0.1.49"] }
```

Windows Host 找不到 `pnpm` 时，将 `command` 改为 `pnpm.cmd` 绝对路径。

---

## 7. 环境前置

```bash
npm run install:deps && npm run health && npm run doctor
```

移动端另需：设备连接、对应平台运行时与驱动已安装。鸿蒙需 `tools/hdc` 与 `hypium-driver`（`only=harmony`）。

---

## 8. 常见问题

| 现象 | 处理 |
|------|------|
| `pnpm dlx --registry` 报错 | 不支持；用 `set ADA_MCP_REGISTRY=...` 或 launcher **0.1.48+** |
| `ERR_PNPM_FETCH_404` `@ada/download-probe` | **0.1.41** 缺陷；升级到 **0.1.48+**（launcher 已内联探测逻辑） |
| `ERR_PNPM_NO_MATCHING_VERSION` / `ETARGET` | 镜像未同步；设 `ADA_MCP_REGISTRY=https://registry.npmjs.org/` 或钉已有版本 |
| dlx 走腾讯源 404 | 本机 `.npmrc` 的 `registry`；launcher 本身无依赖，装 mcp-server 时可设 `ADA_MCP_REGISTRY=https://registry.npmmirror.com` |
| `'mcp-server' 不是内部或外部命令`（Win） | 勿 `npx @ada-mcp/mcp-server`；用 **`pnpm dlx @ada-mcp/launcher@0.1.49`** |
| `spawn EINVAL`（Win，`npm.cmd` / npx 回退） | 升级到 **`@ada-mcp/launcher@0.1.49+`**；或改用 `pnpm dlx` |
| `spawn EINVAL`（Win，工作目录） | 勿在 `C:\Windows\System32` 运行；`cd %USERPROFILE%` |
| `ada_web_action` 变 mock | **0.1.48+** 默认真实；检查是否误设 `allowMock`；查 `install-deps`、`ada_diagnostics` |
| `ada_mobile_action` 失败 | 驱动通道 / capabilities / 设备 |
| Web 本机浏览器失败 | 执行 `ada_install_deps` 并检查 Playwright 浏览器 |
| `playwright install` 超时/404 | `PLAYWRIGHT_DOWNLOAD_HOST` 或删 `.ada-mcp-playwright-host` 重试 |
| zod / `ERR_PACKAGE_PATH_NOT_EXPORTED` | 清 dlx 缓存，钉 `@ada-mcp/launcher@0.1.49` |
| dlx 仍是旧版 | 钉版本或清 `pnpm-cache/dlx` |
| Windows 多次闪现 **cmd 黑窗**（移动测试） | 复用 `sessionId` 避免重复建会话；减少并发 `launchApp`；`adb` 子进程偶发闪窗属系统行为 |

**Windows 移动测试推荐**：

1. 先确认 `adb devices` / `hdc list targets` 正常
2. MCP 可设 `ADA_MCP_SKIP_INSTALL_DEPS=1`（依赖已装好时）
3. `launchApp` 带上已有 `sessionId` 复用会话；**不要**并发多次 `launchApp`

## 9. 维护者

发布流程见 [`scripts/README.md`](../scripts/README.md)。

**版本约定**：每次发布 `@ada-mcp/mcp-server` 与 `@ada-mcp/launcher` 的 `package.json` 的 `version` **必须相同**；先发布 mcp-server，再发布 launcher。发布前执行 `npm run mcp:check:versions`。
