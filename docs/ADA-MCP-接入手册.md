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
| `playwright` / `selenium` / `appium` / `harmony` / `all` | 见名；可逗号组合。`all` = Playwright（npm+浏览器）+ Selenium（selenium-webdriver+geckodriver/chromedriver）+ Appium（appium@3.3.1 + `appium.requiredDrivers` 驱动）+ Harmony（hypium-driver + hdc） |
| `none` / `skip` 或 `ADA_MCP_SKIP_INSTALL_DEPS=1` | 跳过 |

Host 示例：`"args": ["dlx", "@ada-mcp/launcher@0.1.49", "--install-deps=playwright,selenium"]`

工作区：`dirver/`、`.ada-mcp-playwright-host` 写在 **Host 项目目录**（`INIT_CWD`），勿写 monorepo 源码路径。

**依赖解析优先级**（install-deps / health / doctor 一致）：系统全局 npm → 工作区/环境 → `~/.ada/deps`；全局已满足的包**不会**重复迁入共享目录。

---

## 2. 工具一览（21）

`ada-mcp-server` 暴露 **21** 个工具（`ada_` + 蛇形命名）。

| # | 工具 | 分类 | 何时选用（AI 路由提示） |
|---|------|------|------------------------|
| 1 | `ada_health` | 观测 | 会话首选：快速探活、依赖是否就绪 |
| 2 | `ada_diagnostics` | 观测 | 健康异常时深度诊断（Node/驱动/路径） |
| 3 | `ada_plugins` | 观测 | 确认已加载 playwright/selenium/appium/harmony |
| 4 | `ada_perf_summary` | 观测 | 统计各工具耗时 p50/p95 |
| 5 | `ada_config` | 配置 | 读取生效配置与路径 |
| 6 | `ada_install_deps` | 配置 | 缺 Playwright/浏览器/Appium/Harmony 时安装 |
| 7 | `ada_start_once` | 配置 | 模拟 agent `start --once` 启动流程 |
| 8 | `ada_web_action` | 执行-Web | **首选**：网页 navigate/click/type/截图等 |
| 9 | `ada_mobile_action` | 执行-Mobile | **首选**：Android/iOS/Harmony 点击/滑动/启停 App |
| 10 | `ada_execute` | 执行 | 通用信封（web+移动同一 schema） |
| 11 | `ada_invoke` | 执行-底层 | Playwright/Selenium/Appium/Harmony 原生 API（需 `riskApproved`） |
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

**架构**：Web = Playwright（默认）+ Selenium；移动端 = Appium 3（android / ios）+ Harmony（hypium-driver + hdc）。默认 **严格真实执行**；`allowMock: true` 才 mock。

**选用**：

```text
探活/装依赖 → ada_health / ada_install_deps
Web E2E     → ada_web_action（selenium=本机浏览器 Profile）
App         → ada_mobile_action
Harmony     → ada_invoke（driver-harmony）或 mobile 能力扩展
底层 API    → ada_invoke
多步        → ada_batch_actions / ada_run_task_file
结束        → ada_close_session / ada_close_all_sessions
```

**Web 命令**：`navigate`、`click`、`type`、`screenshot`、`scroll`、`newTab`…（非 `invoke`，用 `ada_invoke`）

**移动命令**：`click`、`swipe`、`launchApp`、`screenshot`…

**常用 payload**：`sessionId`、`engine`（web）、`headless`、`browser`/`channel`、`userDataDir`/`profile`、`cdpEndpoint`、`locator`、`serverUrl`+`capabilities`（移动）

**发布前验证**：`npm run test:mcp:bundled`（`scripts/mcp-bundled-smoke.mjs`，见 [`scripts/脚本清单.md`](../scripts/脚本清单.md)）。

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

附着已开调试端口的 Chrome：`"cdpEndpoint": "http://127.0.0.1:9222"`（先启动 `chrome.exe --remote-debugging-port=9222`）。

### 3.2 移动：`ada_mobile_action`

```json
{
  "platform": "android",
  "command": "screenshot",
  "sessionId": "app-1",
  "payload": {
    "serverUrl": "http://127.0.0.1:4723",
    "capabilities": {
      "platformName": "Android",
      "appium:automationName": "UiAutomator2"
    }
  }
}
```

### 3.3 `ada_invoke`（双引擎 + Appium HTTP）

| `payload.engine` | 场景 |
|------------------|------|
| 省略 / `playwright` | 默认 |
| `selenium` | 本机 Chrome/Firefox + `dirver/` 下驱动；需 `ada_install_deps` `only=selenium` |

未装 selenium 插件时返回 `WEB_ENGINE_SELENIUM_NOT_INSTALLED`，不静默回退。

Selenium 驱动：`ada_install_deps` 检测浏览器版本，下载 geckodriver/chromedriver 到 **`dirver/`**（`ADA_DRIVERS_DIR` 可覆盖）。目标文件名已存在则跳过重复下载。参数：`geckodriverVersion`、`chromedriverVersion`（`match-chrome` / `latest` / `skip`）。

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

### 3.4 其它

| 工具 | 示例要点 |
|------|----------|
| `ada_run_task_file` | `{ "file": "tasks/web-real.tasks.json" }` |
| `ada_install_deps` | `{ "only": "playwright" }` |
| `ada_batch_actions` | `actions[]` + `onFailure`: `stop` \| `continue` |

---

## 4. 远程 HTTP（可选）

```bash
ada-mcp server --host=127.0.0.1 --port=8787 --api-key=TOKEN --allow-risky=true
```

| 接口 | 说明 |
|------|------|
| `GET /health`、`GET /status` | 无需鉴权 |
| `POST /mcp` | Streamable HTTP MCP（需 `x-api-key` 或 `Authorization: Bearer`） |
| `POST /tool/call` | 兼容旧客户端 |

---

## 5. 镜像与环境变量

launcher **阶段 A**：测速选 registry → 写 `npm_config_registry` / 项目 `.npmrc`。**阶段 B**（`install-deps`）：npm 包 + Playwright CDN 再测速。

| 变量 | 说明 |
|------|------|
| `ADA_MCP_REGISTRY` | 强制安装 registry（推荐官方源兜底） |
| `ADA_MCP_PACKAGE_RUNNER` | `pnpm` \| `npx` \| `auto` |
| `ADA_MCP_INSTALL_DEPS` / `ADA_MCP_SKIP_INSTALL_DEPS` | 启动时装依赖 |
| `ADA_NPM_PROXY_REGISTRY` | install-deps 时 registry 候选置顶 |
| `ADA_REGISTRY_CANDIDATES` | 额外 registry，逗号分隔 |
| `PLAYWRIGHT_DOWNLOAD_HOST` | 强制 Playwright CDN |
| `ADA_PLAYWRIGHT_*` / `ADA_SELENIUM_*` | 浏览器路径、无头等 |
| `ANDROID_HOME` / `APPIUM_HOME` | 未设时用工作区下默认目录 |
| `ADA_TOOLS_DIR` / `ADA_HARMONY_DEVICE_SN` | 鸿蒙 hdc 工具与设备 SN |

内置 registry 候选（安装前 Range 测速选最快，相同时按序优先）：**npmmirror（阿里）** → npmjs → 腾讯 → 上海交大 → 中科大 → 华为云。

**直连 mcp-server**（无 launcher 测速）：

```json
{ "command": "npx", "args": ["-y", "@ada-mcp/mcp-server@0.1.49"] }
```

Windows Host 找不到 `pnpm` 时，将 `command` 改为 `pnpm.cmd` 绝对路径。

---

## 6. 环境前置

```bash
npm run install:deps && npm run health && npm run doctor
```

移动端另需：Appium Server、设备连接、对应 driver 已安装（`ada_install_deps` `only=appium`）。鸿蒙需 `tools/hdc` 与 `hypium-driver`（`only=harmony`）。

---

## 7. 常见问题

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
| `ada_mobile_action` 失败 | Appium / capabilities / 设备 |
| `engine=selenium` 失败 | `ada_install_deps` `only=selenium`，检查 `dirver/` |
| `playwright install` 超时/404 | `PLAYWRIGHT_DOWNLOAD_HOST` 或删 `.ada-mcp-playwright-host` 重试 |
| zod / `ERR_PACKAGE_PATH_NOT_EXPORTED` | 清 dlx 缓存，钉 `@ada-mcp/launcher@0.1.49` |
| dlx 仍是旧版 | 钉版本或清 `pnpm-cache/dlx` |
| Windows 多次闪现 **cmd 黑窗**（移动测试） | **勿**对 `appium` 包一层 `cmd.exe /c`（0.1.48 已改）；MCP 加 `ADA_AUTO_START_APPIUM=0` 并**手动**先起 Appium；复用 `sessionId` 避免重复建会话；仅当设备已初始化后设 `ADA_APPIUM_LIGHTWEIGHT_ANDROID=1` |

**Windows 移动测试推荐（减少闪窗）**：

1. 终端先启动 Appium（只需一次）：`appium --address 127.0.0.1 --port 4723`
2. Cursor MCP `env`：

```json
"env": {
  "ADA_AUTO_START_APPIUM": "0",
  "ADA_MCP_SKIP_INSTALL_DEPS": "1"
}
```

3. `launchApp` 带上已有 `sessionId` 复用会话；**不要**并发多次 `launchApp`。

> Appium/UiAutomator2 内部的 `adb.exe` 仍可能偶发闪窗（第三方进程），ADA 无法完全消除；减少 **重复建会话** 和 **自动拉起 Appium** 最有效。

## 8. 维护者

发布流程见 [`scripts/README.md`](../scripts/README.md)。

**版本约定**：每次发布 `@ada-mcp/mcp-server` 与 `@ada-mcp/launcher` 的 `package.json` 的 `version` **必须相同**；先发布 mcp-server，再发布 launcher。发布前执行 `npm run mcp:check:versions`。
