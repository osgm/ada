# ADA MCP 接入手册

本文说明如何将 `ada-agent` 能力通过 MCP 对外暴露，供大模型像调用 Playwright MCP 一样调用 Web 与移动端能力。

Playwright 用例直接兼容映射请见：`docs/Playwright-ADA-兼容映射.md`。

## 文档边界说明

- 本文档只覆盖 MCP 工具、入参、示例调用与联调前置。
- 部署启动与运维流程请看 `ADA-部署手册.md`。
- 架构边界与分层设计请看 `ADA-架构设计方案.md`。
- 开发规范与测试门禁请看 `ADA-开发手册.md`。

---

## 1. 服务说明

| 场景 | 入口 |
|------|------|
| **对外用户（标准）** | `pnpm dlx @ada-mcp/launcher@0.1.28`（npx：`npx -y @ada-mcp/launcher@0.1.28`）→ `@ada-mcp/mcp-server@0.1.28` |
| 本仓库开发 | 工作区 `@ada-mcp/mcp-server`，`npm run mcp:dev` |

传输方式：stdio（适配任意支持 MCP 的 Host，如 IDE 插件、独立 MCP 客户端）。

标准 MCP 配置见 **§3.9**。

---

## 2. 可用工具（Tools）— 共 21 个

`ada-mcp-server@0.1.28` 通过 MCP 暴露 **21 个工具**（`name` 统一为 `ada_` + 蛇形命名）。传输默认 **stdio**；亦支持远程 HTTP / Streamable HTTP（见 §3.8）。

### 2.1 架构速览

| 维度 | 能力 |
|------|------|
| **入口** | `pnpm dlx @ada-mcp/launcher@0.1.28` → `@ada-mcp/mcp-server@0.1.28` |
| **Web** | Playwright（默认）+ Selenium（`engine=selenium`，本机浏览器） |
| **移动** | Appium 3（`android` / `ios` / `harmony`） |
| **驱动插件** | `driver-playwright`、`driver-selenium`、`driver-appium` |
| **执行模式** | 默认**严格真实执行**；`allowMock: true` 可允许 mock 回退 |

### 2.2 工具总览（21）

| # | 工具 | 分类 | 一句话 |
|---|------|------|--------|
| 1 | `ada_health` | 观测 | Agent 健康快照（依赖是否就绪） |
| 2 | `ada_diagnostics` | 观测 | 综合诊断（Node / Playwright / Appium / 驱动） |
| 3 | `ada_plugins` | 观测 | 已加载驱动插件及能力清单 |
| 4 | `ada_perf_summary` | 观测 | MCP 调用耗时统计（avg / p50 / p95 / max） |
| 5 | `ada_config` | 配置 | 读取当前有效 Agent 配置 |
| 6 | `ada_install_deps` | 配置 | 安装 Playwright / Selenium 驱动 / Appium 等依赖 |
| 7 | `ada_start_once` | 配置 | 以 `start --once` 跑一轮 Agent 队列 |
| 8 | `ada_web_action` | 执行 | **Web 语义动作**（推荐；`engine=playwright\|selenium`） |
| 9 | `ada_mobile_action` | 执行 | **移动端语义动作**（Appium） |
| 10 | `ada_execute` | 执行 | 通用命令信封（与任务 JSON 同模型） |
| 11 | `ada_invoke` | 执行 | **驱动原生 RPC**（Playwright method / Selenium / Appium HTTP） |
| 12 | `ada_run_task_file` | 执行 | 执行 `.tasks.json` 任务文件 |
| 13 | `ada_batch_actions` | 编排 | 单次请求内多步串联（可 continue / stop） |
| 14 | `ada_extract` | 数据 | Web 页面提取（text / list / table） |
| 15 | `ada_assertions` | 数据 | Web 断言（visible / text / url） |
| 16 | `ada_mobile_extract` | 数据 | 移动端提取（text / pageSource） |
| 17 | `ada_mobile_assertions` | 数据 | 移动端断言（visible / text） |
| 18 | `ada_sessions` | 会话 | 列出内存中活跃会话 |
| 19 | `ada_close_session` | 会话 | 关闭指定会话（Web 区分 engine） |
| 20 | `ada_close_all_sessions` | 会话 | 关闭全部活跃会话 |
| 21 | `ada_risk_policy` | 安全 | 高风险命令白名单（view / add / remove / reset） |

### 2.3 分组说明

#### 2.3.1 观测与诊断（4）

| 工具 | 作用 | 主要参数 | 典型用法 |
|------|------|----------|----------|
| `ada_health` | 健康快照 | `scope`: `web` \| `mobile` \| `all`（默认 `web`） | 启动后探活 |
| `ada_diagnostics` | 综合诊断 | 同上 `scope` | 浏览器 / Appium 装不上时排错 |
| `ada_plugins` | 插件清单 | 无 | 确认 selenium、appium 是否加载 |
| `ada_perf_summary` | 性能统计 | `reset`: 读后是否清空样本 | 找慢工具、调优 |

#### 2.3.2 配置与依赖（3）

| 工具 | 作用 | 主要参数 | 典型用法 |
|------|------|----------|----------|
| `ada_config` | 读配置 | 无 | 查看 serverUrl、超时、镜像策略 |
| `ada_install_deps` | 装依赖 | `only`: `playwright` \| `selenium` \| `appium` \| `mobile` \| `all` 等；`geckodriverVersion` / `chromedriverVersion`；`force` | 首次使用前安装 |
| `ada_start_once` | 批处理入口 | `localDev`、`skipDeps` | 非 MCP 直连场景 |

`ada_install_deps` 的 `only` 还支持：`android`、`ios`、`harmony`、`drivers`；组合写法如 `playwright,selenium`。

#### 2.3.3 核心执行（5）

| 工具 | 平台 / 引擎 | 说明 |
|------|-------------|------|
| `ada_web_action` | `web`；`engine`: `playwright`（默认）\| `selenium` | 打开页、点击、输入、截图、滚动、多 Tab 等（**Web 首选**） |
| `ada_mobile_action` | `android` \| `ios` \| `harmony` | 点击、滑动、截图、启停 App 等 |
| `ada_execute` | `web` + 三端移动 | 与任务文件同模型的通用信封 |
| `ada_invoke` | Web + 移动 | 语义命令不够时透传底层 API（见 §3.0） |
| `ada_run_task_file` | 文件内自定 | `file`：相对工作区或绝对路径；支持 `monitor` |

#### 2.3.4 批量编排（1）

| 工具 | 说明 |
|------|------|
| `ada_batch_actions` | `platform` + `sessionId` + `actions[]`；每步可设 `timeoutMs`、`retry`；`onFailure`: `stop` \| `continue` |

`ada_batch_actions` 的每个 action 支持：

- `timeoutMs`：单步超时（毫秒）
- `retry`：失败重试次数（0 表示不重试）

顶层策略：

- `onFailure`：`stop` \| `continue`
- `continueOnError`：兼容旧参数；建议优先 `onFailure`

批量返回 `summary` 字段：

- `total` / `executed`
- `successCount` / `failureCount` / `timeoutCount`
- `stoppedOnFailure`

#### 2.3.5 数据提取与断言（4）

| 工具 | 模式 | 平台 |
|------|------|------|
| `ada_extract` | `text` \| `list` \| `table` | Web |
| `ada_assertions` | `visible` \| `text` \| `url` | Web |
| `ada_mobile_extract` | `text` \| `pageSource` | Android / iOS / Harmony |
| `ada_mobile_assertions` | `visible` \| `text` | Android / iOS / Harmony |

#### 2.3.6 会话管理（3）

| 工具 | 说明 |
|------|------|
| `ada_sessions` | 列出当前内存中的活跃 `sessionId` 及平台信息 |
| `ada_close_session` | 按 `platform` + `sessionId` 关闭；Web 需传 `engine`: `playwright` \| `selenium`（或写在 `payload.engine`） |
| `ada_close_all_sessions` | 一次性释放所有浏览器 / Appium 占用 |

#### 2.3.7 安全策略（1）

| 工具 | 说明 |
|------|------|
| `ada_risk_policy` | `action`: `view` \| `add` \| `remove` \| `reset`；配合 `command` 管理白名单 |

默认需 **`riskApproved: true`** 的高风险命令：`invoke`、`custom`、`launchApp`、`terminateApp` 等。

### 2.4 工具选用决策

```text
需要做什么？
├─ 环境是否正常 → ada_health / ada_diagnostics
├─ 安装依赖 → ada_install_deps
├─ 桌面网页
│   ├─ 常规 E2E → ada_web_action（engine=playwright）
│   ├─ 本机 Chrome/Firefox + 真实 Profile → ada_web_action（engine=selenium）
│   └─ 底层 API → ada_invoke
├─ 手机 App → ada_mobile_action（+ 可选 ada_invoke http）
├─ 多步流水线 → ada_batch_actions 或 ada_run_task_file
├─ 读页面 / 断言 → ada_extract / ada_assertions（或 mobile 版）
└─ 结束 → ada_close_session / ada_close_all_sessions
```

### 2.5 跨工具通用参数

| 参数 | 适用工具 | 说明 |
|------|----------|------|
| `allowMock` | 执行类、提取/断言类 | `true` 时允许 mock 回退（默认严格真实） |
| `riskApproved` | 执行类、invoke、custom 等 | 确认高风险操作 |
| `monitor` | `ada_execute`、`ada_web_action`、`ada_mobile_action`、`ada_run_task_file` | 监控截图：`enabled`、`onFailureOnly`、`maxWidth` / `maxHeight` 等 |
| `sessionId` | 执行 / 提取 / 断言 / 批量 | 同 ID 复用浏览器或 App 会话 |
| `requestId` | 执行类 | 可选，用于链路追踪 |

**Web `payload` 常用字段**（`ada_web_action` / `ada_execute` / `ada_invoke`）：

| 字段 | 说明 |
|------|------|
| `engine` | `playwright`（默认）\| `selenium` |
| `headless` | 是否无头 |
| `browser` | Playwright：`chromium` \| `firefox` \| `webkit` |
| `channel` | Chromium 系：`chrome`、`msedge` 等 |
| `executablePath` / `browserBinary` | 本机浏览器路径 |
| `userDataDir` / `profile` | 用户数据目录 / Firefox Profile（Selenium 用 `profile`） |
| `cdpEndpoint` | 附着已开启远程调试的 Chrome（如 `http://127.0.0.1:9222`） |
| `url` | `navigate` 目标地址 |
| `locator` | 元素定位（css / xpath / text / role / testId） |
| `screenshotPath` | 截图保存路径 |

环境变量别名：`ADA_PLAYWRIGHT_*`、`ADA_SELENIUM_*`（见 §3.0、§3.9.3）。

**Mobile `payload` 常用字段**：

| 字段 | 说明 |
|------|------|
| `real` | 是否真机 / 真会话（默认严格模式为 true） |
| `serverUrl` | Appium Server，如 `http://127.0.0.1:4723` |
| `capabilities` | Appium 标准能力（`appPackage`、`udid` 等） |
| `probe` | `true` 时仅探活，不建长会话 |

### 2.6 语义命令覆盖

以下命令通过 `ada_web_action`、`ada_mobile_action` 或 `ada_execute` 调用（`ada_invoke` 用于更底层能力）。

**Web**（`ada_web_action` / `ada_execute`，platform=`web`）：

`navigate`、`click`、`hover`、`type`、`press`、`select`、`scroll`、`forward`、`newTab`、`switchTab`、`uploadFile`、`dragDrop`、`wait`、`assertVisible`、`assertText`、`getText`、`screenshot`、`back`、`reload`、`closeTab`、`custom`

> `ada_web_action` 不含 `invoke`；底层 RPC 请用 `ada_invoke`。`swipe` / `home` / `launchApp` 等为移动端命令，不可用于 web_action。

**移动端**（`ada_mobile_action` / `ada_execute`，platform=`android|ios|harmony`）：

`click`、`type`、`swipe`、`wait`、`assertVisible`、`assertText`、`getText`、`screenshot`、`back`、`home`、`launchApp`、`terminateApp`、`custom`

> 移动端 `navigate`、`scroll` 等 Web 专属命令请用 `ada_invoke` 或任务文件。

### 2.7 本仓库验证脚本对照

| 场景 | 推荐 MCP 工具 | 本地脚本（`scripts/`） |
|------|---------------|------------------------|
| Chrome 京东 Web | `ada_web_action` + playwright | `ada_mcp_jd_verify.py` |
| 本机 Firefox + 系统 Profile（Playwright） | `ada_web_action` + playwright | `mcp_jd_firefox_verify.py` |
| 本机 Firefox + 系统 Profile（Selenium） | `ada_web_action` + selenium | `mcp_jd_firefox_selenium_verify.py` |
| 京东 App 真机 | `ada_mobile_action` | `mcp-jd-app-verify.mjs` / `mcp_jd_app_verify.py` |
| 发布包 smoke | `ada_health` + `ada_plugins` | `mcp-bundled-smoke.mjs` |

更多脚本说明见 [`scripts/脚本清单.md`](../scripts/脚本清单.md) 与 [`scripts/README.md`](../scripts/README.md)。

说明：`ada_execute`、`ada_web_action`、`ada_mobile_action`、`ada_run_task_file`、`ada_batch_actions` 默认**严格真实执行**；需要 mock 回退时传 `allowMock: true`。上述执行类工具均支持可选 `monitor` 参数。

---

## 3. 示例调用

### 3.0 统一驱动 RPC（`ada_invoke`）

高级能力请用 **`ada_invoke`**（Playwright 进程内 `method` RPC，Appium WebDriver `http` RPC）。

Web 双引擎（`payload.engine`）：

| engine | 驱动 | 典型场景 |
|--------|------|----------|
| 省略或 `playwright` | `driver-playwright` | 默认；Playwright 自带 Chromium/Firefox/WebKit |
| `selenium` | `driver-selenium` | 本机已安装的 Firefox/Chrome + GeckoDriver/ChromeDriver |

未安装 `driver-selenium` 时指定 `engine=selenium` 会返回 `WEB_ENGINE_SELENIUM_NOT_INSTALLED`（不会静默回退到 Playwright）。

依赖检测与下载：`ada_install_deps` 的 `only=selenium` 会**先检测本机 Chrome/Chromium 与 Firefox 版本**（Windows/macOS/Linux），再尝试将 **geckodriver** / **chromedriver** 下载到项目根目录 **`dirver/`**（可通过 `nativeDriversDir` 或环境变量 `ADA_DRIVERS_DIR` 覆盖）。未显式指定 `chromedriverVersion` 且检测到 Chrome 时，默认按主版本 **match-chrome** 匹配。已手动放入 `dirver/geckodriver.exe`、`dirver/chromedriver137.exe` 等文件时会自动复用，**也可随时自行下载替换**；自动下载失败时**跳过该驱动**并在日志中提示手动下载地址，不阻断其他依赖安装。

| 参数 | 说明 |
|------|------|
| `geckodriverVersion` | 如 `0.36.0`、`latest`；`skip` 表示不下载 |
| `chromedriverVersion` | 如 `137`、`135`、`match-chrome`（匹配本机 Chrome 主版本）、`latest` |
| `nativeDriversDir` | 默认 `dirver` |

**驱动手动下载参考**（安装日志会逐条打印）：

| 浏览器 | 平台 | 提供方 | 参考地址 |
|--------|------|--------|----------|
| Chrome/Chromium | Windows/Linux/macOS | 谷歌 | https://chromedriver.storage.googleapis.com/index.html |
| Firefox | Windows/Linux/macOS | 华为云镜像（默认） | https://mirrors.huaweicloud.com/geckodriver/v0.36.0/ |
| Edge | win10 | 微软 | https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/ |
| Internet Explorer | Windows | Selenium 项目组 | https://selenium-release.storage.googleapis.com/index.html |
| Safari | macOS El Capitan+ | 苹果 | 系统内置 |
| Opera | Windows/macOS/Linux | Opera | https://github.com/operasoftware/operachromiumdriver/releases |

在线安装：**chromedriver** 走 chrome-for-testing；**geckodriver** 默认从 [华为云镜像](https://mirrors.huaweicloud.com/geckodriver/) 解析 **latest** 并下载**当前系统**对应包（如 Windows `geckodriver-v0.36.0-win64.zip`），失败再回退 [GitHub releases](https://github.com/mozilla/geckodriver/releases)。环境变量 `ADA_GECKODRIVER_MIRROR` 可覆盖镜像根地址。

CLI 示例：

```bash
npx tsx apps/ada-agent/src/main.ts install-deps --only=selenium --chromedriver-version=137 --geckodriver-version=latest
```

关闭 Web 会话：`ada_close_session` 可传 `engine`（或写在 `payload.engine`），用于区分同一 `sessionId` 下的 Playwright 与 Selenium 会话。

**Playwright（Firefox 打开京东）**：

```json
{
  "platform": "web",
  "sessionId": "mcp-jd-1",
  "riskApproved": true,
  "target": "page",
  "method": "goto",
  "args": ["https://www.jd.com"],
  "payload": { "browser": "firefox", "headless": false }
}
```

**Appium HTTP 透传**（兼容原 `payload.custom`）：

```json
{
  "platform": "android",
  "sessionId": "mcp-app-1",
  "riskApproved": true,
  "mode": "http",
  "http": { "method": "GET", "path": "/source" },
  "payload": {
    "real": true,
    "serverUrl": "http://127.0.0.1:4723",
    "capabilities": { "platformName": "Android" }
  }
}
```

### 3.0.1 使用本机已安装的浏览器（Web）

在 `payload`（或 `ada_invoke` 顶层同名字段）中支持：

| 字段 | 说明 |
|------|------|
| `cdpEndpoint` / `browserURL` | 附着已开启远程调试的 **Chrome/Edge**（Chromium CDP），如 `http://127.0.0.1:9222` |
| `executablePath` / `browserPath` | 本机浏览器可执行文件路径 |
| `channel` | Chromium 专用：`chrome`、`msedge` 等（使用系统已安装浏览器） |
| `userDataDir` | 用户数据目录（配置、Cookie、缓存）；与 `launchPersistentContext` 配合 |

环境变量（可选）：`ADA_PLAYWRIGHT_CDP_ENDPOINT`、`ADA_PLAYWRIGHT_EXECUTABLE_PATH`、`ADA_PLAYWRIGHT_CHANNEL`、`ADA_PLAYWRIGHT_USER_DATA_DIR`。

**方式 A：CDP 附着当前 Chrome（保留登录态）**

1. 先手动启动 Chrome，例如：
   ```text
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```
2. MCP 调用：
   ```json
   {
     "platform": "web",
     "sessionId": "mcp-local-chrome",
     "riskApproved": true,
     "target": "page",
     "method": "goto",
     "args": ["https://www.jd.com"],
     "payload": { "cdpEndpoint": "http://127.0.0.1:9222" }
   }
   ```

**方式 B：Firefox 可视化 + 用户配置目录（推荐）**

使用 Playwright 自带的 Firefox（`npx playwright install firefox`），不要用系统菜单里的 `firefox.exe` 作为 `executablePath`（零售版不支持 Playwright 的 juggler 协议，会启动失败）。

```json
{
  "command": "navigate",
  "sessionId": "mcp-local-ff",
  "payload": {
    "url": "https://www.jd.com",
    "browser": "firefox",
    "headless": false,
    "userDataDir": "D:\\ada-firefox-profile"
  }
}
```

`userDataDir` 指向**空目录或专用配置目录**即可持久化 Cookie；若填已有 Firefox 配置目录，请先关闭所有 Firefox 窗口避免 profile 锁冲突。

**方式 C：系统已安装的 Chrome（无需手写 exe 路径）**

```json
{
  "payload": {
    "browser": "chromium",
    "channel": "chrome",
    "headless": false,
    "userDataDir": "D:\\ada-chrome-profile"
  }
}
```

说明：CDP 模式仅支持 Chromium 系；断开 Playwright 会话**不会**关闭你已打开的 Chrome 窗口。

### 3.1 执行 Web 点击

工具：`ada_web_action`

输入示例：

```json
{
  "command": "click",
  "sessionId": "mcp-web-session-1",
  "monitor": {
    "enabled": true,
    "onFailureOnly": true,
    "groupBySession": true,
    "nonBlocking": true,
    "maxWidth": 1280,
    "maxHeight": 720,
    "keepAspectRatio": true
  },
  "payload": {
    "url": "https://example.com",
    "headless": false,
    "locator": {
      "text": "More information"
    }
  }
}
```

`monitor` 字段说明：

- `enabled`：是否启用本次调用监控
- `outputDir`：监控输出目录（默认 `artifacts/monitoring/mcp`）
- `onFailureOnly`：仅失败抓图，性能更优
- `groupBySession`：按 `sessionId/requestId` 分层归档
- `nonBlocking`：监控异步执行，不阻塞本次工具调用响应
- `maxWidth/maxHeight/keepAspectRatio`：监控分辨率与不变形策略

说明：

- 本地可视化验证时建议设置 `payload.headless=false`
- 若不传该字段，默认走无头模式（可用环境变量 `ADA_PLAYWRIGHT_HEADLESS=false` 全局关闭）

### 3.2 执行移动端截图（Android）

工具：`ada_mobile_action`

输入示例：

```json
{
  "platform": "android",
  "command": "screenshot",
  "sessionId": "mcp-mobile-session-1",
  "payload": {
    "real": true,
    "serverUrl": "http://127.0.0.1:4723",
    "capabilities": {
      "platformName": "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": "Android"
    }
  }
}
```

### 3.3 执行任务文件

工具：`ada_run_task_file`

输入示例：

```json
{
  "file": "tasks/web-real.tasks.json"
}
```

### 3.3.1 执行移动端截图（HarmonyOS NEXT）

工具：`ada_mobile_action`

输入示例：

```json
{
  "platform": "harmony",
  "command": "screenshot",
  "sessionId": "mcp-harmony-session-1",
  "payload": {
    "real": true,
    "serverUrl": "http://127.0.0.1:4723",
    "capabilities": {
      "platformName": "harmonyos",
      "appium:automationName": "harmonyos"
    }
  }
}
```

### 3.4 本地验证（App / 探活 + 可选真机）

不连设备、不启 Appium Server 时，可验证 MCP 与 Appium CLI 探活：

```bash
npm run test:mcp:app
```

本机已启动 Appium、已连设备/模拟器时，可额外走真实截图一次（`allowMock` 仍建议先为 `true` 联调，再关）：

```bash
node scripts/mcp-jd-app-verify.mjs --server dev
```

### 3.5 安装依赖（MCP 内触发）

工具：`ada_install_deps`

输入示例：

```json
{
  "only": "playwright",
  "force": false
}
```

说明：

- `only` 可选：`all` / `playwright` / `mobile` / `android` / `ios` / `harmony` / `appium` / `drivers`
- `force=true` 时会强制重装对应范围

### 3.6 单次启动队列处理（MCP 内触发）

工具：`ada_start_once`

输入示例：

```json
{
  "localDev": false,
  "skipDeps": false
}
```

说明：

- 该工具执行一次 `start --once`，不会进入 `--watch` 常驻模式
- 适合在 MCP 编排中做“单轮拉取 + 执行”任务

### 3.7 移动端提取与断言（新增）

提取页面源码（Android 示例）：

```json
{
  "tool": "ada_mobile_extract",
  "arguments": {
    "platform": "android",
    "sessionId": "mcp-mobile-session-1",
    "type": "pageSource",
    "riskApproved": true
  }
}
```

提取返回统一结构：

- `items`：提取结果数组
- `meta`：`count/requestId/success/errorCode/errorMessage`
- `truncated`：是否因 `maxItems` 截断

断言文本（Harmony 示例）：

```json
{
  "tool": "ada_mobile_assertions",
  "arguments": {
    "platform": "harmony",
    "sessionId": "mcp-harmony-session-1",
    "type": "text",
    "payload": {
      "locator": { "accessibilityId": "search_input" },
      "expectedText": "搜索"
    }
  }
}
```

---

### 3.8 远程模式接入（HTTP + Token）

`ada-mcp` 新增远程模式，可通过可执行程序直接启动：

```bash
ada-mcp-win.exe server --host=127.0.0.1 --port=8787 --api-key=your_token --allow-risky=true --risky-mode=whitelist --risky-commands=custom,launchApp
```

说明：

- `--host`：监听地址，默认 `127.0.0.1`
- `--port`：监听端口，默认 `8787`
- `--api-key`：鉴权 Token，必填
- `--allow-risky`：高风险总开关，默认 `false`
- `--risky-mode`：风险命令策略，`whitelist` 或 `blacklist`，默认 `whitelist`
- `--risky-commands`：风险命令列表（逗号分隔），默认 `custom`
- `--allowed-hosts`：逗号分隔的合法 `Host` 列表；监听 `0.0.0.0` / `::` 时建议配置（对应环境变量 `ADA_MCP_REMOTE_ALLOWED_HOSTS`）

双模式说明：

- 白名单模式（推荐）：仅允许 `risky-commands` 列表中的风险命令
- 黑名单模式：禁止 `risky-commands` 列表中的风险命令
- 当 `allow-risky=false` 时，风险命令一律拒绝（总闸门优先）

可用接口：

- `GET /health`：健康检查（无需鉴权）
- `GET /status`：远程服务状态（无需鉴权）
- `GET /sessions`：当前活跃会话列表（需鉴权）
- `POST /tool/call`：工具调用（需鉴权，兼容旧客户端）
- `POST /mcp`、`GET /mcp`、`DELETE /mcp`：**MCP Streamable HTTP**（与 `@modelcontextprotocol/sdk` 的 `StreamableHTTPServerTransport` 一致，含可选 SSE），**需鉴权**。首次 `POST` 发送 JSON-RPC `initialize`（无 `Mcp-Session-Id`）；响应头携带 `Mcp-Session-Id` 后，后续请求必须带该头；需要服务端下行流时，客户端对同一端点发起 `GET` 且 `Accept` 含 `text/event-stream`。

`/status` 额外返回运行统计字段（便于压测与巡检）：

- `uptimeMs`：运行时长
- `totalRequests`：总请求数
- `toolCalls`：工具调用次数
- `authFailures`：鉴权失败次数
- `lastRequestAt`：最近请求时间戳
- `lastToolName`：最近一次调用的工具名
- `streamableHttpPath`：规范 MCP 路径，固定为 `/mcp`
- `mcpStreamableSessions`：当前 Streamable HTTP 活跃会话数

鉴权方式（二选一）：

- Header `x-api-key: your_token`
- Header `Authorization: Bearer your_token`

调用示例：

```bash
curl -X POST "http://127.0.0.1:8787/tool/call" ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: your_token" ^
  -d "{\"name\":\"ada_health\",\"arguments\":{}}"
```

---

### 3.9 npm / pnpm 在线安装（标准配置）

通过 **`@ada-mcp/launcher`** 拉起 **`@ada-mcp/mcp-server@0.1.28`**（launcher 负责拉包前 registry 测速；mcp-server 负责 MCP 工具、Playwright 浏览器安装与依赖自检）。

#### 标准 MCP Host 配置（推荐）

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "pnpm",
      "args": ["dlx", "@ada-mcp/launcher@0.1.28"]
    }
  }
}
```

| 包 | npm latest | 作用 |
|----|------------|------|
| `@ada-mcp/launcher` | **0.1.28** | 与 mcp-server 同版本；测速选镜像；config hint 自动对齐版本 |
| `@ada-mcp/mcp-server` | **0.1.28** | MCP 工具、依赖安装、Web/Appium 驱动 |

命令行等价：

```bash
pnpm dlx @ada-mcp/launcher@0.1.28
```

**npx 等价**（launcher 测速逻辑与 pnpm 相同，内层用 **`npx -y` 拉 mcp-server**）：

```bash
npx -y @ada-mcp/launcher@0.1.28
```

| 场景 | pnpm | npx |
|------|------|-----|
| 标准启动 | `pnpm dlx @ada-mcp/launcher@0.1.28` | `npx -y @ada-mcp/launcher@0.1.28` |
| 跳过自动装依赖 | `--skip-install-deps` | `npx -y @ada-mcp/launcher@0.1.28 --skip-install-deps` |
| Host `command` | `pnpm` | `npx` |
| Host `args` | `["dlx", "@ada-mcp/launcher@0.1.28"]` | `["-y", "@ada-mcp/launcher@0.1.28"]` |
| launcher 内层拉起 mcp-server | `pnpm dlx @ada-mcp/mcp-server@0.1.28` | `npx -y @ada-mcp/mcp-server@0.1.28` |

环境变量 `ADA_MCP_PACKAGE_RUNNER`：`pnpm` \| `npx` \| `auto`（默认）。`auto` 时：pnpm dlx 起 launcher → 内层 pnpm；npx 起 launcher → 内层 npx。

**npx 版 MCP 配置**（与 pnpm 标准配置等价）：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": ["-y", "@ada-mcp/launcher@0.1.28"]
    }
  }
}
```

> 说明：进程会挂起等待 stdio，属正常现象。**推荐** `pnpm dlx @ada-mcp/launcher`（自动 latest）或钉 `@0.1.28`。

#### 3.9.0 版本号：安装时要不要写 `@0.1.28`？

**使用者（MCP Host / 命令行）可以省略版本号**，会拉 npm 上 `latest` 标签的当前版本：

```bash
pnpm dlx @ada-mcp/launcher
npx -y @ada-mcp/launcher
```

```json
"args": ["dlx", "@ada-mcp/launcher"]
```

| 写法 | 行为 |
|------|------|
| `@ada-mcp/launcher@0.1.28` | 固定 launcher **0.1.28**（可复现）；不写版本则拉 registry **latest** |
| `@ada-mcp/launcher` | 始终等于 registry 的 **latest**（随发布自动升级） |
| `ADA_MCP_SERVER_VERSION=0.1.9` | 仅覆盖 launcher **内层**拉取的 mcp-server 版本（与 launcher 包版本无关） |

直连 mcp-server 时同理：`@ada-mcp/mcp-server@0.1.28` 为钉版本；`@ada-mcp/mcp-server` 为 latest。

**维护者发布到 npm 时不能省略版本号**：必须在对应包的 `package.json` 里**先递增 `version` 再 `npm publish`**；同一版本号不能重复发布（npm 会拒绝）。每次发 launcher 若改了默认拉取的 mcp-server，还需同步改 `launcher.mjs` 里的 `MCP_SERVER_VERSION` 默认值。

#### 3.9.1 启动时自动安装依赖

MCP 进程在监听 stdio **之前**会按配置执行依赖安装（输出在 stderr，不影响 JSON-RPC）。

| `ADA_MCP_INSTALL_DEPS` / `--install-deps=` | 行为 |
|---------------------------------------------|------|
| 未配置 | **默认仅 `playwright`**（含 `playwright install` 浏览器） |
| `playwright` | 同上 |
| `selenium` | `selenium-webdriver` 检测 + 下载 GeckoDriver/ChromeDriver 到 `dirver/` |
| `appium` | 安装 Appium npm 包 + 配置中的 `uiautomator2`/`xcuitest`/`harmonyos` 驱动 |
| `playwright,selenium` | 组合安装（逗号分隔） |
| `all` | Playwright + Selenium 原生驱动 + Appium 及驱动 |
| `none` / `skip` | 不自动安装（或设 `ADA_MCP_SKIP_INSTALL_DEPS=1`） |

**Android / Appium 环境目录（`install-deps` 时）**

| 变量 | 行为 |
|------|------|
| 系统 `ANDROID_HOME` / `ANDROID_SDK_ROOT` | **优先使用**（目录须存在） |
| 系统 `APPIUM_HOME` | **优先使用**（目录须存在） |
| 未配置时 | 日志 `[deps][warn]` 提示在系统/终端配置上述变量；安装过程使用项目根下 **`ANDROID_HOME/`**、**`APPIUM_HOME/`** 作为默认目录 |

其它环境变量：

- `ADA_MCP_INSTALL_DEPS_FORCE=1` / `--install-deps-force`：强制重装
- `ADA_MCP_GECKODRIVER_VERSION`、`ADA_MCP_CHROMEDRIVER_VERSION`：Selenium 驱动版本
- `ADA_GECKODRIVER_MIRROR`：geckodriver 下载镜像根（默认 `https://mirrors.huaweicloud.com/geckodriver`）
- Appium **3.x** 安装 `uiautomator2` / `xcuitest` 使用官方扩展名（`appium driver install uiautomator2`），勿与 Appium 2 的 `appium-uiautomator2-driver@2` 混用
- **`xcuitest` 仅 macOS**：Windows/Linux 上 `install-deps` 会自动跳过 xcuitest 并打日志（XCUITest 需在 Mac 上安装）
- `uiautomator2`（Appium driver）安装失败：会在 npm 安装失败后**额外尝试** `python -m pip install -U uiautomator2`（仅作为兜底，不保证可替代 Appium driver；无 python 会跳过）
- `ADA_MCP_NATIVE_DRIVERS_DIR`：原生驱动目录（默认 `dirver`）
- `ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS`：`playwright install` 超时（默认 **1800000** ms = 30 分钟）
- `ADA_INSTALL_STRATEGY_TIMEOUT_MS`：npm/pnpm 装包超时（默认 **120000** = 2 分钟）

在标准配置基础上追加参数（传给 `@ada-mcp/mcp-server`）：

安装 **全部**依赖（首次较慢）：

```json
"args": ["dlx", "@ada-mcp/launcher@0.1.28", "--install-deps=all"]
```

仅 Web 双引擎（Playwright + Selenium 驱动）：

```json
"args": ["dlx", "@ada-mcp/launcher@0.1.28", "--install-deps=playwright,selenium"]
```

**只装其中一类**（三选一，不要加逗号组合其它项）：

| 目标 | `--install-deps=` 或 `ADA_MCP_INSTALL_DEPS` |
|------|---------------------------------------------|
| 仅 Playwright + 浏览器 | `playwright` |
| 仅 Selenium 驱动 | `selenium` |
| 仅 Appium + 移动端驱动 | `appium` |

```json
"args": ["dlx", "@ada-mcp/launcher@0.1.28", "--install-deps=selenium"]
```

```json
"env": { "ADA_MCP_INSTALL_DEPS": "appium" }
```

MCP 工具 `ada_install_deps` 同样支持 `only: "playwright" | "selenium" | "appium"`（未传 `only` 时默认 `playwright`）。

跳过自动安装（自行事先 `ada_install_deps` 或本机已装好）：

```json
"env": { "ADA_MCP_SKIP_INSTALL_DEPS": "1" }
```

#### 3.9.2 目录与工作区（无需写死 monorepo 路径）

MCP Host 配置里**不要**把 `ADA_PLUGIN_DIR`、`dirver/` 等写成 ada 源码仓库路径（如 `D:/WORKSPACE/PLAN/ada/...`）。运行时按下面规则自动解析：

| 资源 | 默认解析方式 |
|------|----------------|
| **内置驱动插件**（`driver-playwright.cjs` 等） | 相对 **mcp-server 安装包**：`dist/cli.cjs` 旁的 `plugins/`（`pnpm dlx` 解压目录内自动存在） |
| **工作区根目录**（`dirver/`、`.ada-mcp-playwright-host`、`.npmrc`） | **`INIT_CWD`**（MCP Host 启动时的项目目录，如 `D:\ada`）优先，否则 `process.cwd()` |
| **`ANDROID_HOME` / `APPIUM_HOME`** | 系统环境变量已设置则沿用；未设置时在上述工作区根下使用 `ANDROID_HOME/`、`APPIUM_HOME/` |
| **`ADA_PLUGIN_DIR`** | **可选覆盖**；仅在本机自定义插件目录时使用，一般留空 |

因此：在 `D:\ada` 打开 MCP，原生驱动会下载到 `D:\ada\dirver\`，与 ada 源码仓库位置无关。

#### 3.9.3 代理与镜像配置

使用 **§3.9 标准配置**（`@ada-mcp/launcher@0.1.28`）时，一般**无需**再配 `npm_config_registry` 等镜像环境变量（pnpm / npx 均会写入 `npm_config_registry` 与项目 `.npmrc`）。

依赖下载分 **三个阶段**：

| 阶段 | 行为 |
|------|------|
| **A. launcher 拉包** | 测速选最快 registry，写入 `npm_config_registry` 与项目 `.npmrc`；安装 `@ada-mcp/mcp-server@0.1.28` |
| **A′. mcp-server preinstall** | 同次 dlx 安装 playwright 等依赖前，再测速写 `.npmrc` / `.ada-mcp-playwright-host` |
| **B. 启动后 install-deps** | 默认安装 Playwright（可改 `--install-deps`） |

**阶段 B 的探测逻辑（`install-deps`）：**

1. **npm 包**（playwright、appium 等）：对 registry 候选并发测速（`GET <registry>/appium`，5s 超时），取延迟最低者用于 `pnpm add --registry` / `npm install --registry`。
2. **Playwright 浏览器**：对 CDN 候选探测 chromium 安装包是否可下载；用内置 `playwright@1.59.1` 执行 `install`；失败时按候选列表自动换镜像重试。
3. **安装回退顺序**（不因探测而跳过官方源）：`pnpm` → `pnpm(代理)` → `npm` → `npm(代理)`，任一成功即停止。

**环境变量一览**

| 变量 | 作用阶段 | 说明 |
|------|----------|------|
| `npm_config_registry` | A + B | 影响本机 npm/pnpm 默认源；可在 Host 的 `env` 中设置以加速 `dlx` 拉包 |
| `ADA_NPM_PROXY_REGISTRY` | B | npm 代理探测的**主候选**（默认 `https://registry.npmmirror.com`） |
| `ADA_PNPM_PROXY_REGISTRY` | B | pnpm 代理探测的主候选（默认同 `ADA_NPM_PROXY_REGISTRY`） |
| `ADA_REGISTRY_CANDIDATES` | B | 额外 registry，逗号分隔，与内置候选合并后一起测速 |
| `PLAYWRIGHT_DOWNLOAD_HOST` | B | 强制指定 Playwright 浏览器 CDN（设后仍参与候选列表，探测可能选更快者） |
| `ADA_PLAYWRIGHT_HOST_CANDIDATES` | B | 额外 Playwright CDN，逗号分隔 |
| `ADA_INSTALL_STRATEGY_TIMEOUT_MS` | B | npm/pnpm 装包超时（默认 `120000`） |
| `ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS` | B | `playwright install` 超时（默认 `1800000` = 30 分钟；首个镜像；后续镜像单次至多 600s） |
| `ADA_PLAYWRIGHT_PREFER_CN_MIRROR` | B | `1` 时优先 npmmirror Playwright CDN（与 npm 测速选国内源时自动生效） |
| `ADA_DEPS_VERBOSE` | B | `1` 时恢复安装子进程完整行输出（默认仅阶段摘要 + 每 12s 下载进度） |

**内置 npm 镜像候选（默认已配置，无需 `ADA_REGISTRY_CANDIDATES`）**

启动 `install-deps` 时对下列地址**并发测速**，自动选用延迟最低者；延迟相同时按表中优先级（从上到下）：

| 优先级 | 名称 | URL |
|--------|------|-----|
| 1 | 阿里云 / npmmirror（推荐） | `https://registry.npmmirror.com` |
| 2 | 腾讯云 | `https://mirrors.cloud.tencent.com/npm` |
| 3 | 华为云 | `https://repo.huaweicloud.com/repository/npm` |
| 4 | npm 官方（兜底） | `https://registry.npmjs.org` |

**内置 Playwright 浏览器 CDN 候选**（按浏览器包 HEAD 探测，安装失败自动切换）

| 优先级 | 名称 | URL |
|--------|------|-----|
| 1 | Playwright 官方 CDN（推荐） | `https://cdn.playwright.dev` |
| 2 | Azure Edge | `https://playwright.azureedge.net` |
| 3 | npmmirror Playwright | `https://npmmirror.com/mirrors/playwright` |
| 4 | npmmirror binaries 路径 | `https://cdn.npmmirror.com/binaries/playwright` |

> **preinstall** 会测速并写入 Playwright CDN 到 `.ada-mcp-playwright-host`；**install-deps** 阶段可再参与国内镜像探测。若镜像未同步当前 playwright 版本出现 404，会自动改试官方 CDN。

**备选：不用 launcher，直接 dlx mcp-server**（仅在同次安装依赖时 preinstall 测速，拉 tarball 仍可能走本机默认源）：

```json
"args": ["dlx", "@ada-mcp/mcp-server@0.1.28"]
```

**高级：追加自定义 registry（在默认镜像列表之外）**

```json
"env": {
  "ADA_REGISTRY_CANDIDATES": "https://your-internal.npm/repository/npm"
}
```

Monorepo 本地开发可在 `config/default.yaml` 的 `dependencies.npmRegistryCandidates` / `playwrightHostCandidates` 中维护同一组候选；npm 包运行时无工作区配置时，以上环境变量与内置默认生效。

Windows 若 Host 找不到 `pnpm`，将 `command` 改为 `pnpm.cmd` 的绝对路径。

**不用 launcher、直连 mcp-server**（无 launcher 阶段 A 测速；仅有 mcp-server preinstall + bootstrap 测速）。有 npm/npx 即可，**不必装 pnpm**：

```bash
npx -y @ada-mcp/mcp-server@0.1.28
```

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": ["-y", "@ada-mcp/mcp-server@0.1.28"]
    }
  }
}
```

国内用户可在 `env` 中加 `"npm_config_registry": "https://registry.npmmirror.com"` 加速 `npx` 拉包。

#### 3.9.3 维护者发布（npm）

完整步骤与脚本说明见 **[`scripts/README.md`](../scripts/README.md)**（发布清单、`build-mcp-npm.mjs`、`mcp-bundled-smoke.mjs`）。

| 问题 | 说明 |
|------|------|
| 发布能否不升版本？ | **不能**。npm 不允许覆盖已发布的同一 `version`；每次发布前必须在 `package.json` 中递增版本号。 |
| 改代码但未 bump 就 publish | 会报错或误以为自己发成功；请始终 **先改 version 再 publish**。 |
| launcher 与 mcp-server | 两个包**各自独立版本号**；`launcher.mjs` 内 `MIN_MCP_SERVER_VERSION` 须与已发布的 mcp-server 版本对齐。 |
| 发布 registry | 仓库 `.npmrc` 可能指向镜像；发布到 npmjs.org 须加 **`--registry https://registry.npmjs.org/`**。 |
| 用户侧 latest | `pnpm dlx @ada-mcp/launcher`（无 `@x.y.z`）= 安装当前 **latest** 标签。 |

```bash
# 仓库根目录：试打包 + 冒烟
npm run mcp:pack:dry-run
npm run build:npm -w @ada-mcp/mcp-server
npm run test:mcp:bundled

# 发布（务必指定官方 registry）
cd apps/ada-mcp-server && npm publish --access public --registry https://registry.npmjs.org/
cd ../ada-mcp-launcher && npm publish --access public --registry https://registry.npmjs.org/
```

---

## 4. 环境前置

建议先执行：

```bash
npm run install:deps
npm run health
npm run doctor
```

如果需要真实移动端执行，还需确保：

- Appium Server 已启动
- 设备已连接
- `appium.requiredDrivers` 中驱动安装完成

---

## 5. 常见问题

- **`spawn EINVAL`（Windows）**：使用 `@ada-mcp/launcher@0.1.28`；勿在 `C:\Windows\System32` 下运行。
- **`pnpm dlx @latest` 仍是旧版**：多为 pnpm dlx 缓存；可钉版本 `@0.1.28` 或清理 `pnpm-cache/dlx` 对应目录。
- **`ada_web_action` 返回 mock**：检查 `install-deps` 与 `ada_diagnostics`（`scope=web`）。
- **`ada_mobile_action` 失败**：检查 Appium Server、capabilities、设备连接；可先 `ada_install_deps` 的 `only=appium`。
- **Appium 驱动安装失败**：Appium 3 使用 `appium driver install uiautomator2`，勿用旧 npm 包名 `appium-uiautomator2-driver`。
- **MCP 无输出**：确认 Host 为 stdio，命令指向 launcher 或 `npm run mcp:dev`。
- **`playwright install` 超时或 404**：设置 `PLAYWRIGHT_DOWNLOAD_HOST`（如 `https://cdn.npmmirror.com/binaries/playwright`）；增大 `ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS`；或 `ADA_MCP_SKIP_INSTALL_DEPS=1` 后手动安装。可删除 `.ada-mcp-playwright-host` 后重试。
- **`ERR_PACKAGE_PATH_NOT_EXPORTED` / zod**：多为缓存了旧版 mcp-server；使用 `@ada-mcp/launcher@0.1.28`，检查 `ADA_MCP_SERVER_VERSION` 环境变量。
- **`engine=selenium` 报错**：确认已 `ada_install_deps` 的 `only=selenium`，且 `dirver/` 或 PATH 中有 geckodriver/chromedriver。
- **dlx 很慢**：使用 launcher（自带 registry 测速），或在 Host 的 `env` 中设置 `npm_config_registry`（见 §3.9.3）。
