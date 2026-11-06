# ADA 使用说明手册

ADA（AllDriverAgent）用同一套命令驱动浏览器和手机，并让 AI 通过 MCP 直接操作界面。本手册说明**怎么用**：选入口、准备环境、打开会话、操作网页或真机、写脚本、跑任务文件、读失败结果。

| 你想做的事 | 从这里开始 |
|------------|------------|
| 让 Cursor 里的 AI 点网页或手机 | [§4 在 AI 里用 MCP](#4-在-ai-里用-mcp推荐) |
| 自己写 Node / Python 用例 | [§8 脚本](#8-用脚本写用例) |
| 把步骤写成 JSON 反复跑 | [§9 任务文件](#9-用任务文件跑场景) |
| 用命令行或 Windows 桌面程序 | [§10 命令行与桌面程序](#10-命令行与桌面程序) |
| 操作失败，不知道下一步 | [§11 读结果与排障](#11-读结果与排障) |

字段全集、环境变量和架构推导不在这里重复展开，文末 [§13](#13-延伸阅读) 指向对应专册。

**版本**：npm 包 `@ada-mcp/launcher` 与 `@ada-mcp/mcp-server` 必须同号。本仓库当前示例为 **`0.1.94`**。不要使用已废弃的 `0.1.73` / `0.1.74`。发布前以两个包的 `package.json` 为准。

---

## 1. ADA 能做什么

一条 `CommandEnvelope` 贯通四种入口：AI 的 MCP 工具、命令行、任务 JSON、示例脚本。平台差异留在驱动插件里。

| 平台 | 驱动 | 你能做的事 |
|------|------|------------|
| Web | Playwright | 打开页面、点击、输入、截图、多标签、附着本机浏览器（CDP） |
| Android | adb，可选 UiAutomator2 | 点击、滑动、启停 App、截图；需要时透传 adb / UIA2 HTTP |
| iOS | WebDriverAgent | 元素操作、坐标点击、WDA HTTP 透传 |
| HarmonyOS NEXT | hypium + hdc | 语义手势、启停应用、driver 透传 |

默认是**真实执行**。只有显式 `allowMock: true`（任务文件里是 `payload.mock: true`）才会走模拟结果。

ADA 不依赖 Appium / Selenium 中心化 Server。移动端直连 adb、WDA、hypium。

---

## 2. 先选一种用法

四种入口共用同一套语义，按场景选一个即可。

| 入口 | 适合 | 第一步 |
|------|------|--------|
| **MCP** | 在 Cursor、Claude Desktop 等里让 AI 操作界面 | [§4](#4-在-ai-里用-mcp推荐) |
| **脚本** | 可重复的 E2E，Node 或 Python | [§8](#8-用脚本写用例) |
| **任务文件** | CI、批量步骤、`tasks/*.tasks.json` | [§9](#9-用任务文件跑场景) |
| **CLI / GUI / Web 控制台** | 本机安装依赖、健康检查、图形界面 | [§10](#10-命令行与桌面程序) |

脚本和 MCP 的业务步骤可以写成同一套 `page.*` / `phone.*`。本地直连与经 MCP 转发只差 `open` 的第二参数。

---

## 3. 环境准备

### 3.1 本机需要什么

| 用途 | 需要 |
|------|------|
| 任意源码命令、MCP 的 npm 安装 | **Node.js ≥ 22**，**npm ≥ 10**。有 `pnpm` 时优先用 `pnpm dlx` |
| 只操作网页 | Playwright 浏览器。Launcher 默认可在启动时安装 |
| Android 真机 | `adb` 能看到设备。UiAutomator2 通道另需 **OpenJDK 11** |
| iOS 真机 | 手机上已安装并签名的 WebDriverAgent。macOS 可用 Xcode 拉起；Windows 走 USB + `iproxy`，不能在 Windows 上编译 WDA |
| HarmonyOS NEXT | `hdc` 与 `hypium-driver` |

`doctor` 默认只检查配置里 `monitoring.platforms` 列出的平台（默认仅 `web`）。手机没就绪时，以 `ada_devices` 和对应平台的 `install-deps` 为准，不要只看 `doctor` 全绿。

### 3.2 从源码安装（开发或本机脚本）

在仓库根目录：

```bash
npm install
npm run install:deps -- --only=playwright
npm run health
npm run doctor
npm run plugins
```

`plugins` 应列出 4 个驱动：playwright、android、ios、harmony。

不需要浏览器和真机时，可先跑模拟冒烟：

```bash
npm run test:e2e:smoke
```

### 3.3 依赖装到哪、装哪些

| `--only` / MCP `only` | 行为 |
|------------------------|------|
| `playwright` | Playwright 包与浏览器 |
| `android` / `ios` / `harmony` / `mobile` / `drivers` | 检查对应工具链（adb、WDA/iproxy、hdc、hypium）。不安装 Appium |
| `all` | 浏览器 + 全部移动工具链检查 |
| `none` / `skip` | 跳过 |

国内网络可固定镜像，避免每次测速：

```powershell
$env:ADA_MCP_REGISTRY = "https://registry.npmmirror.com"
```

Playwright 浏览器会自动扫描本机已有缓存（Windows 常见为 `%LOCALAPPDATA%\ms-playwright`）。已有浏览器时不会重复下载。

---

## 4. 在 AI 里用 MCP（推荐）

### 4.1 写入 Host 配置

Cursor 全局配置：`%USERPROFILE%\.cursor\mcp.json`。只对当前项目生效时用项目里的 `.cursor/mcp.json`，同名 server 以项目级为准。

Windows 且 PATH 里没有 `pnpm` 时用 `npx`：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": ["-y", "@ada-mcp/launcher@0.1.94"],
      "env": {
        "ADA_MCP_REGISTRY": "https://registry.npmmirror.com"
      }
    }
  }
}
```

有 `pnpm` 时把 `command` 换成 `pnpm`，`args` 换成 `["dlx", "@ada-mcp/launcher@0.1.94", "--install-deps=playwright"]`。

保存后重载 MCP。部分 IDE 的 stdio 握手大约 60 秒，冷启动若再去装全部移动依赖会超时。首启只装 Playwright；手机工具链连上之后再用 `ada_install_deps`。

不要这样写：

- `pnpm dlx --registry <url> ...`（`--registry` 对 `dlx` 无效，用环境变量 `ADA_MCP_REGISTRY`）
- 直接 `npx @ada-mcp/mcp-server`（Windows 上容易找不到命令；应经 launcher）
- 在 `C:\Windows\System32` 里启动

`mcp.json` 每个字段的取值见 [MCP 接入手册 §10](ADA-MCP-接入手册.md#10-host-mcpjson-字段)。

### 4.2 第一次对话怎么说

连上之后，按这个顺序让 AI 调用工具：

1. `ada_health` — 确认进程活着，以及浏览器 / 设备是否真能跑。
2. 缺浏览器时 `ada_install_deps`，参数 `only` 为 `playwright`。
3. 做网页：`ada_web_action`。做手机：先 `ada_devices`，再 `ada_mobile_action`。
4. 做完 `ada_close_session` 或 `ada_end_task`。

`ada_health` 里要分清两件事：

| 字段 | 含义 |
|------|------|
| `dependencies.packagesReady` | npm 包或安装标记就绪。`mobile: true` **不表示**手机已连接 |
| `dependencies.runtimeReady` / `readiness` | 浏览器能否启动、hdc 等运行时是否可探测 |
| `mcpBootstrap` / `installProgress` | 后台安装进行到哪一步 |

健康检查异常时再调用 `ada_diagnostics`。要看已加载插件用 `ada_plugins`，要看生效配置用 `ada_config`。

### 4.3 工具怎么选

日常只需要下面这些。完整 25+ 工具表、参数和底层透传示例见 [MCP 接入手册](ADA-MCP-接入手册.md)。

| 场景 | 工具 |
|------|------|
| 探活 | `ada_health` |
| 装依赖 | `ada_install_deps` |
| 列出手机并拿到推荐 capabilities | `ada_devices` |
| 打开网页、点击、输入、截图 | `ada_web_action` |
| 看页面上有哪些可点控件 | `ada_extract`（`mode=viewTree`） |
| 按控件 path 点击，或启发式填搜索框 | `ada_web_recipe` |
| 关网页弹窗（没有弹窗也算成功） | `ada_web_dismiss_popups` |
| 断言可见、文案、URL | `ada_assertions` |
| 手机点击、滑动、启停 App | `ada_mobile_action` |
| 看手机 UI、按 path 点、填搜索 | `ada_mobile_extract` / `ada_mobile_recipe` |
| 关手机弹窗 | `ada_mobile_dismiss_popups` |
| 同一次会话里连续多步 | `ada_batch_actions` |
| 跑仓库里的任务 JSON | `ada_run_task_file` |
| 开任务、列会话、结束 | `ada_begin_task` / `ada_sessions` / `ada_end_task` |
| 关掉一个或全部会话 | `ada_close_session` / `ada_close_all_sessions` |
| Playwright / adb / WDA / hypium 官方 API | `ada_invoke`（高风险，需 `riskApproved: true`） |

`ADA_MCP_HIDE_ADVANCED=1` 时会隐藏 `ada_invoke` 和 `ada_risk_policy`。脚本侧 `connectMcp()` 默认会藏这两项；需要底层 API 时把该变量设为 `0`。

---

## 5. 会话

一次浏览器或一台手机的连续操作必须共用同一个 `sessionId`。不同 `sessionId` 会各开一套浏览器或设备通道。

### 5.1 推荐生命周期

```text
ada_begin_task          → 拿到 taskId + sessionId（此时还不打开浏览器）
ada_web_action / mobile → 所有步骤都带这个 sessionId
ada_end_task            → 关掉会话并清掉登记
```

也可以自己起一个稳定的 id（如 `web-1`），结束时 `ada_close_session`。`ada_sessions` 能列出当前还活着的会话。

换物理设备或重载 MCP 前，调用 `ada_close_all_sessions`。

### 5.2 超时之后不能复用旧 id

命令有墙钟超时，默认约 60 秒；打开页面会自动抬到导航超时（默认 2 分钟）再加 15 秒。页面 DOM 就绪后还会再等最多 15 秒完整 load（等不到也不判失败）。点击、输入默认再等控件 15 秒。超时、打开页失败、长时间等待失败时，驱动会释放会话，返回里带 `sessionReleased: true`，并给出 `suggestedSessionId`。

接下来必须：

1. 改用 `suggestedSessionId`（或全新 id）。
2. 重新 `navigate` 或 `launchApp`。
3. 再继续点击、输入。

用已释放的 id 再发命令会得到 `SESSION_RELEASED`。`ada_close_all_sessions` 会清空这张登记表。

同一 `sessionId` 上的写操作互斥。截图、等待、读文案、断言可以并行。两个任务要同时开网页时，使用两个不同的 `sessionId`。浏览器个数默认上限 20，可用 `ADA_PLAYWRIGHT_MAX_BROWSERS` 调低。

同一会话里连续重复的点击 / 滑动会被熔断（默认连续 3 次，或 60 秒内 5 次）。这是为了避免 AI 在同一个控件上打转。

---

## 6. 操作网页

### 6.1 打开页面并点击

`ada_web_action` 示例：

```json
{
  "command": "navigate",
  "sessionId": "web-1",
  "payload": {
    "url": "https://example.com",
    "headless": false
  }
}
```

下一跳点击继续用 `web-1`：

```json
{
  "command": "click",
  "sessionId": "web-1",
  "payload": {
    "locator": { "text": "More information" }
  }
}
```

未写 `headless` 时浏览器**有头、窗口最大化、并置前**，方便你看着执行。CI 里设 `ADA_PLAYWRIGHT_HEADLESS=true`，或在 payload 里写 `"headless": true`。

常用命令：

| 命令 | 作用 |
|------|------|
| `navigate` | 打开 URL |
| `click` / `hover` / `type` | 点击、悬停、输入（`fill` 是 `type` 的别名） |
| `press` | 按键，如 Enter |
| `select` | 下拉选择 |
| `scroll` | 滚动 |
| `screenshot` | 截图 |
| `newTab` / `switchTab` / `closeTab` | 多标签 |
| `back` / `forward` / `reload` | 历史与刷新 |
| `uploadFile` / `dragDrop` | 上传、拖拽 |
| `getText` | 读取文案 |
| `wait` | 驱动级等待 |

定位写在 `payload.locator`：

| 字段 | 例子 | 说明 |
|------|------|------|
| `text` | `{ "text": "登录" }` | 按可见文案 |
| `css` | `{ "css": "#key" }` | CSS 选择器 |
| `id` | `{ "id": "key" }` | 元素 id |
| `role` | `{ "role": "button", "name": "搜索" }` | 无障碍角色 |
| `testId` | `{ "testId": "signup-btn" }` | `data-testid` |
| `xpath` | `{ "xpath": "//button[1]" }` | XPath |
| `placeholder` 类 | 脚本侧 `by.placeholder("搜索")` | 占位符片段 |

元素查找自带 auto-wait（脚本默认上限 20 秒）。页面已经在变、只是还没稳定时，不要先堆一串固定 `sleep`。

### 6.2 不知道点哪里时

1. `ada_extract`，`mode` 为 `viewTree`。默认返回扁平的可点控件列表，每项带 `path`。
2. 用 `ada_web_recipe`，`action` 为 `clickPath`，把上一步的 `path` 传回去。
3. 搜索框用 `ada_web_recipe` 的 `fill_search`。

关遮罩、登录浮层：

```json
{ "sessionId": "web-1" }
```

工具名是 `ada_web_dismiss_popups`。找不到弹窗时 `ok` 仍为 true，业务码 `POPUP_NOT_FOUND`，流程可以继续。

### 6.3 断言

优先用 `ada_assertions`，不要只把 `getText` 的字符串拿回来人工比对。

| `type` | 检查 |
|--------|------|
| `visible` | 元素可见 |
| `text` | 文案符合预期 |
| `url` | 当前 URL |
| `title` / `count` / `attribute` / `notVisible` | 标题、数量、属性、不可见 |

`payload` 里放定位器和期望值。

### 6.4 换浏览器或附着已经打开的浏览器

Firefox（使用 Playwright 自带的 Firefox，不要指向系统里的 `firefox.exe`）：

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

`userDataDir`（脚本里叫 `profile`）用来保留登录态。

附着本机 Chrome，并在端口空闲时自动拉起：

```json
{
  "command": "navigate",
  "sessionId": "chrome-cdp",
  "payload": {
    "url": "https://www.jd.com",
    "channel": "chrome",
    "headless": false,
    "cdpAutoLaunch": true,
    "cdpPort": 9222
  }
}
```

已经手动开了调试端口时，只写 `"cdpEndpoint": "http://127.0.0.1:9222"`。默认每个会话独立浏览器；要挂到已有窗口上，加 `"shareCdpBrowser": true`。

从 Playwright 脚本迁过来时，步骤对照见 [Playwright-ADA 兼容映射](Playwright-ADA-兼容映射.md)。

---

## 7. 操作手机

### 7.1 先确认设备

```text
adb devices            Android
hdc list targets       HarmonyOS
idevice_id -l          iOS（Windows USB）
```

然后调用 `ada_devices` 扫描。返回里的推荐 `capabilities` 和 `sessionId` 直接复用。同一台物理设备上的自动化默认串行，避免两路操作打到同一块屏幕。

多台 Android 时指定序列号：环境变量 `ADA_ANDROID_DEVICE_SN`，或 payload 里 `capabilities.udid`。多台 iOS 时指定 `ADA_IOS_DEVICE_UDID`。

Android 截图示例：

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

启动应用（包名放 `appId`，不要用已废弃的 `package` / `bundleId`）：

```json
{
  "platform": "android",
  "command": "launchApp",
  "sessionId": "app-1",
  "payload": {
    "appId": "com.example.app",
    "capabilities": {
      "platformName": "Android",
      "automationName": "UiAutomator2",
      "udid": "emulator-5554"
    }
  }
}
```

鸿蒙启动时额外带 ability 名。iOS 的 `appId` 是 bundle id。

### 7.2 常用手势

| 命令 | 作用 |
|------|------|
| `launchApp` / `exitApp` | 启动 / 结束应用 |
| `click` | 按文案、id、xpath 点击 |
| `swipe` | 滑动。比例坐标常用 `from` / `to`，如 `[0.5, 0.8]` → `[0.5, 0.3]` |
| `back` | 系统返回 |
| `pressHome` | 系统 Home（`home` 是别名，新脚本写 `pressHome`） |
| `screenshot` | 截图 |
| `type` | 向定位到的输入框输入 |

滑动时长用 `durationMs`（毫秒，越大越慢）。鸿蒙可用 `swipePreset`：`fast`（200）、`normal`（400）、`slow`（800）。

控件查找超时写 `locatorTimeoutMs`。Web 点击/输入未写时默认约 15 秒（`ADA_PLAYWRIGHT_AUTO_WAIT_MS`）。移动端查找默认约 8 秒、上限约 20 秒，和整条命令的墙钟超时是两回事。

### 7.3 先看界面再点

1. `ada_mobile_extract`，`type` 为 `viewTree`，得到扁平可点控件和 `path`。
2. `ada_mobile_recipe`，`action` 为 `tap_path`，传入 `path`。路径上每一段都会重新抓一次 UI，避免页面已经变了还点旧坐标。
3. 搜索：`tap_search` 点搜索入口；`fill_search` 需要 `text`，流程是打开搜索、输入、回车。

关系统弹窗用 `ada_mobile_dismiss_popups`。没有弹窗同样返回 `POPUP_NOT_FOUND` 且 `ok: true`。

文案和脚本对不上时，在 payload 里覆盖启发式词：

```json
{
  "uiHeuristics": {
    "searchEntryLabels": ["search", "搜索"],
    "searchInputLabels": ["search", "请输入"]
  }
}
```

移动定位优先 `text`、`id`、`xpath`、`accessibilityId`。`css` / `role` / `testId` 是网页定位，不要拿去点 Android。

### 7.4 三个平台的差异

| 项 | Android | iOS | HarmonyOS NEXT |
|----|---------|-----|----------------|
| 连接 | adb；元素操作可走 UiAutomator2 HTTP | 本机 WDA，默认 `http://localhost:8100` | hdc + hypium |
| 可选自举 | `ADA_ANDROID_UIA2_BOOTSTRAP=true` 时尝试安装并拉起设备端 Server | 仅 macOS：`ADA_IOS_WDA_BOOTSTRAP=true`。Windows 只能转发已装好的 WDA | `install-deps --only=harmony` 检查 hdc，并可下载 hdc |
| 启动应用 | `goto(包名)` | `goto(bundleId)` | `goto(包名, ability名)` |
| 启动后等待 | UI 稳定（`launch_settled`） | 默认固定等待，避免反复 dump 超时 | 同 Android |

Server 进程掉线时：若对应 `*_BOOTSTRAP=true`，驱动会先尝试重启 Server，再重建 WebDriver 会话并重试一次。30 秒内不会重复重启。

Windows 接 iOS：手机需已用 Mac 签过名并装好 WDA，本机装有 Apple 的 USB 驱动。`install-deps --only=ios` 会把 libimobiledevice 下到 `~/.ada/tools/libimobiledevice/`。MCP 启动后会自动做 `iproxy` 端口转发。

---

## 8. 用脚本写用例

学习用示例在 `scripts/examples/`，京东 Web / Android / 鸿蒙 / iOS 各有本地版和 MCP 版，Node 与 Python 业务步骤对齐。

在仓库根目录：

```bash
npm run test:jd-web            # 本机 Chrome
npm run test:jd-web:mcp        # 同一套步骤，经 MCP
npm run test:jd-android        # 需真机和京东 App
npm run test:jd-harmony        # 需 hdc 与鸿蒙真机
```

Python 直接运行：

```bash
python scripts/examples/python/web/jd_e2e.py
```

业务常量（搜索词、包名）写在各脚本顶部。只从库入口导入：

- Node：`scripts/lib/ada-client.mjs`
- Python：`scripts/lib/ada_client.py`（先 `init(__file__)`）

### 8.1 打开会话

网页：

```javascript
import { open, browser, by } from "../lib/ada-client.mjs";

const page = await open(browser({
  type: "chrome",
  sessionId: "jd-web-1",
  timeoutMs: 30000
}));
await page.goto("https://www.jd.com");
await page.dismissPopups();
const box = page.find(by.id("key"));
if (await box.exists()) {
  await box.fill("手机");
  await page.keyboard.press("Enter");
}
await page.screenshot("artifacts/home.png");
await page.close();
```

手机：

```javascript
import { open, device, by } from "../lib/ada-client.mjs";

const phone = await open(device({
  type: "android",
  sessionId: "jd-android"
  // 多台设备时再加 device_id: "序列号"
}));
await phone.goto("com.jingdong.app.mall");
await phone.dismissPopups();
await phone.fillSearch("手机", {
  entryHints: ["搜索"],
  inputHints: ["请输入", "搜索"]
});
await phone.back();
await phone.close();
```

经 MCP 跑同一套 API（会自己拉起连接，结束时 `close()` 会断开）：

```javascript
const MCP = { connect: "mcp", mcpOptions: { name: "jd-web" } };
const page = await open(browser({ sessionId: "jd-web-1", type: "chrome" }), MCP);
```

Python 对应 `open(browser(...), {"connect": "mcp"})`，方法名用蛇形：`fill_search`、`dismiss_popups`、`session_id`。

### 8.2 脚本里该记的行为

- `goto(url)` 默认等到 `domcontentloaded`。重站的 `load` 事件可能很晚，需要完整加载时传 `{ waitUntil: "load", navigationTimeoutMs: 45000 }`。
- `phone.goto(包名)` 在 Android / 鸿蒙上会等到界面稳定后再返回；未传等待毫秒时上限约 8 秒。iOS 默认固定等待。
- `find` 之后用 `click()`、`fill()`、`exists()`、`text()`。`exists()` 在超时内找不到就返回 false，不抛错。
- 网页上 `find("选择器")` 当 CSS；手机上 `find("文案")` 当可见文字。显式写法 `by.text` / `by.id` / `by.xpath` 更不容易混。
- `dismissPopups()` 默认最多约 10 秒，到时跳过，不让整条用例失败。
- `screenshot(path)` 默认截当前视口。整页长图传 `{ fullPage: true }`。
- 滑动默认是像素。用 0～1 比例时加 `{ relative: true }`：

```javascript
await phone.swipe([0.5, 0.8], [0.5, 0.2], { durationMs: 400, relative: true });
```

- 脚本末尾调用 `exit()`（Node 为 `await exit()`），关掉执行器并退出进程。
- 教学示例往往每个场景单独 `open` / `close`。正式用例应复用同一个会话，避免反复冷启动。

方法与 MCP 工具的逐项对照见本文 [§14](#14-脚本方法与-mcp-对照)。定位矩阵见 [`scripts/lib/LOCATOR_MATRIX.md`](../scripts/lib/LOCATOR_MATRIX.md)。参数表见 [`scripts/examples/README.md`](../scripts/examples/README.md)。

---

## 9. 用任务文件跑场景

任务文件是 JSON 数组，每一项是一条命令。同一 `sessionId` 的步骤共享一次浏览器或一次设备会话。

`tasks/web-real.tasks.json` 的结构：

```json
[
  {
    "requestId": "web-real-open-001",
    "sessionId": "web-real-session-1",
    "platform": "web",
    "command": "click",
    "payload": {
      "url": "https://example.com",
      "locator": { "text": "More information" }
    }
  },
  {
    "requestId": "web-real-shot-001",
    "sessionId": "web-real-session-1",
    "platform": "web",
    "command": "screenshot",
    "payload": { "url": "https://example.com" }
  }
]
```

源码仓库中执行：

```bash
npm run run:tasks
npm run run -- --file=tasks/web-real.tasks.json --require-real
```

`--require-real` 表示任何一步退回 mock 都算失败。MCP 里等价调用是 `ada_run_task_file`，参数 `{ "file": "tasks/web-real.tasks.json" }`。

仓库里还有这些样例：

| 文件 | 内容 |
|------|------|
| `tasks/demo.tasks.json` | Web + Android，`mock: true`，无真机也能跑 |
| `tasks/web-real.tasks.json` | 真实打开 example.com |
| `tasks/android-*.tasks.json` | Android mock 或真机 invoke |
| `tasks/harmony-mock.tasks.json` | 鸿蒙模拟 |
| `tasks/ios-*.tasks.json` | iOS mock / WDA |

不想落文件、只是把几步串在一次调用里时，用 `ada_batch_actions`：指定 `platform`、`sessionId`、`actions[]`。某步失败时 `onFailure` 取 `stop`（停下）或 `continue`（继续并收集错误）。`dryRun: true` 只校验计划、不真的操作。整批有墙钟预算，默认按步数放大，上限约 180 秒；耗尽时返回 `BATCH_BUDGET_EXHAUSTED`，并带上已经跑过的步骤。

`start --watch` 会轮询 `tasks/inbox`，成功移到 `tasks/processed`，失败移到 `tasks/failed`。

---

## 10. 命令行与桌面程序

### 10.1 源码里的常用命令

在仓库根目录：

| 命令 | 作用 |
|------|------|
| `npm run health` | 运行时健康快照 |
| `npm run doctor` | 按配置做诊断 |
| `npm run plugins` | 打印已注册驱动 |
| `npm run install:deps -- --only=playwright` | 只处理浏览器 |
| `npm run install:deps -- --only=android` | 检查 Android 工具链 |
| `npm run dev` | Web 控制台 |
| `npm run mcp:dev` | 本仓库的 MCP 服务（stdio） |
| `npm run gui:dev` | Tauri 桌面（开发） |
| `npm run start:once` | Agent 跑一轮 |
| `npm run start:watch` | Agent 持续处理 inbox |
| `npm run run:tasks` | 跑 `tasks/demo.tasks.json` |

等价的可执行子命令（源码为 `tsx apps/ada-agent/src/main.ts <command>`，发布包为 `ada-agent`）：

```text
start [--once|--watch] [--local-dev]
setup [--mode=auto|cli|gui]
run --file=path.json [--require-real]
run-demo
health
doctor
plugins
install-deps [--only=playwright|mobile|android|ios|harmony|drivers|all] [--force]
reset
mcp
web
```

`install-deps --force` 忽略阶段缓存并重装。`reset` 清除本机保存的凭据。

跳过启动时自动安装：`start --skip-deps`。

### 10.2 Windows 发布包里的四个程序

`npm run build:exe` 的产物在 `release/`。发布包会带上本手册。四个程序：

| 程序 | 用途 |
|------|------|
| `ada-gui-win.exe` | 桌面界面。日常看状态、装依赖时用这个 |
| `ada-agent-win.exe` | 命令行：`health`、`doctor`、`start --watch` |
| `ada-mcp-win.exe` | 给 MCP Host 当 stdio 命令，由 Host 拉起 |
| `ada-web-win.exe` | 本地 Web 控制台。在 `release` 里执行 `.\ada-web-win.exe`，按输出提示打开页面 |

GUI：

1. 双击 `ada-gui-win.exe`。
2. 需要时填写远程管理平台地址和 API Key。
3. 在「安装依赖」区安装 Playwright 或移动工具链。
4. 关窗口时可选后台运行，或立即退出。

要用 adb / WDA / hdc 时，在「远程管理平台（可选）」里填写 `ANDROID_HOME`（或点「选择目录」），再点「保存 ANDROID_HOME」。日志出现「已设置进程环境变量」后生效。GUI 会同时写 `ANDROID_HOME` 和 `ANDROID_SDK_ROOT`，并在下次启动时恢复。目录改了要再保存一次。

依赖：

| 场景 | 需要 |
|------|------|
| GUI 里点「安装依赖」，或在本机跑 npm / 仓库脚本 | Node.js 22，npm ≥ 10 |
| 只用已打包的 exe 做 `health` 和常规操作，且不再装依赖 | 可以不装 Node |
| Android + UiAutomator2，或用 MCP 读真机 App 列表、截图 | JDK（建议 11；GUI 场景 JDK 8 也可） |
| 只做网页 | 不必装 JDK |

命令行示例（在 `release` 目录）：

```powershell
.\ada-agent-win.exe health
.\ada-agent-win.exe doctor
.\ada-agent-win.exe start --watch
```

本机 exe 接入 MCP（stdio，不要再加 `mcp` 参数）。镜像变量见 [接入手册 §6](ADA-MCP-接入手册.md#6-镜像与环境变量)：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "D:\\ada\\release\\ada-mcp-win.exe",
      "args": [],
      "cwd": "D:\\ada\\release"
    }
  }
}
```

npm 启动器的配置仍以本文 [§4.1](#41-写入-host-配置) 为准，不要和 exe 配成两套。

### 10.3 给团队共用的远程 MCP

在一台机器上起 HTTP 服务，其它客户端连同一个执行面：

```bash
npx tsx apps/ada-mcp-server/src/cli.ts server --host=0.0.0.0 --port=8787 --api-key=YOUR_KEY
```

- `GET /health`、`GET /status` 无需密钥。
- `POST /mcp` 是 Streamable HTTP，请求头 `Authorization: Bearer YOUR_KEY`。
- Host 侧用 `url` 而不是 `command`。字段见 [接入手册 §10.4](ADA-MCP-接入手册.md#104-http--sse-字段)。

远程进程所在的机器必须能访问浏览器和手机。密钥不要写进仓库。

---

## 11. 读结果与排障

### 11.1 成功和“跳过”长什么样

成功：

```json
{
  "ok": true,
  "status": "ok",
  "businessCode": "COMMAND_OK",
  "message": "ok",
  "result": {}
}
```

关弹窗时没有弹窗：`ok: true`，`businessCode` 为 `POPUP_NOT_FOUND`。这不是工具错误，下一步可以继续。

失败时先看这三个字段，再决定要不要重试：

| 字段 | 你要做的事 |
|------|------------|
| `errorCode` / `businessCode` | 识别失败类型 |
| `recoveryHint` | 按提示恢复，不要凭感觉换参数重放 |
| `suggestedSessionId` | 会话已释放时，用这个新 id，并重新打开页面或 App |

返回体会裁掉过大的字段，但会保留 `summary`、`recoveryHint`、`errorCode`。调试时若需要完整 `CommandResult`，设 `ADA_MCP_VERBOSE_RESULT=1`。

### 11.2 这些码出现时怎么处理

| 现象 | 处理 |
|------|------|
| `SESSION_RELEASED` | 换 `suggestedSessionId`，重新 `navigate` 或 `launchApp`。不要用旧 id 再点一次 |
| `SESSION_BUSY` | 同一会话上还有写操作。等同任务写完再重试；并行任务改用新 id |
| `COMMAND_TIMEOUT` | 会话已销毁。换新 id。导航慢时加大 `navigationTimeoutMs` 或 `ADA_WEB_NAVIGATION_TIMEOUT_MS` |
| `BATCH_BUDGET_EXHAUSTED` | 整批时间用完。加大 `ada_batch_actions` 的 `timeoutMs`，或把批次拆短 |
| 动作熔断 | 连续重复点击。先 `viewTree` / 截图确认页面，再换目标 |
| `RECIPE_FILL_SEARCH_NO_ENTRY` | 没找到搜索入口。补 `entryHints` |
| `RECIPE_FILL_SEARCH_NO_INPUT` | 进了搜索页但没对上输入框。补 `inputHints`，或暂时关掉 `strict` |
| MCP `-32001` 握手超时 | 固定 `ADA_MCP_REGISTRY`，args 里不要带 `--install-deps=all` |
| `ada_web_action` 变成模拟结果 | 确认没有误传 `allowMock: true`；再跑 `ada_install_deps` 与 `ada_diagnostics` |
| 网页打不开、浏览器缺失 | `ada_install_deps`，`only=playwright`。下载 404 时设置 `PLAYWRIGHT_DOWNLOAD_HOST`，或删掉项目里的 `.ada-mcp-playwright-host` 后重试 |
| 手机命令失败 | 先看 `adb devices` / `hdc list targets`。核对 `platform`、`capabilities.udid`、`appId`。`packagesReady.mobile` 为 true 只说明包装过，不说明设备在线 |
| Windows 测试时反复闪 cmd | 复用同一个 `sessionId`，不要并发多次 `launchApp` |

安装阶段日志里的 `deps.progress` 会标出当前在测速、装包还是下浏览器。阶段缓存：

- 源码 / Agent：`.ada-agent/deps-install-state.json`
- MCP：`~/.ada/deps-install-state.json`

设备扫描结果在 `~/.ada/devices.json`（源码运行时也可能写到 `.ada-agent/devices.json`）。执行命令时会合并其中的默认序列号。

---

## 12. 安全与高风险操作

日常的打开页面、点击、输入、截图、启停被测 App，走 `ada_web_action` / `ada_mobile_action` 即可。

`ada_invoke` 会把调用交给 Playwright、adb、WDA 或 hypium 的原生 API，必须带 `riskApproved: true`。用它处理封装层没有的官方接口，例如：

- Web：`target` + `method` + `args`（如 `page.goto`）
- Android adb：`mode: "method"`，`target: "adb"`
- Android UIA2 / iOS WDA：`mode: "http"`，并提供 `serverUrl`

未安装对应驱动插件时会直接报错，不会静默换成另一个平台。

白名单用 `ada_risk_policy` 查看和维护。远程 HTTP 服务务必设置 `--api-key`，不要对公网裸奔。

`allowMock: true` 只用于没有浏览器或真机时的流程演练（如 `tasks/demo.tasks.json`）。验收和 CI 使用 `--require-real`，并检查返回里没有走 mock。

---

## 13. 延伸阅读

| 文档 | 什么时候打开 |
|------|----------------|
| [MCP 接入手册](ADA-MCP-接入手册.md) | 工具全表、`mcp.json` 字段、环境变量、invoke 与超时规则 |
| [部署手册](ADA-部署手册.md) | 把发布包装到机器上、常驻运行、发布验证 |
| [Playwright 兼容映射](Playwright-ADA-兼容映射.md) | 从 Playwright 步骤迁移 |
| [开发手册](ADA-开发手册.md) | 改驱动、跑门禁、类型检查 |
| [架构设计方案](ADA-架构设计方案.md) | 分层与模块边界 |
| [示例脚本说明](../scripts/examples/README.md) | `browser()` / `device()` / `phone.*` 的参数表 |
| [定位矩阵](../scripts/lib/LOCATOR_MATRIX.md) | 各平台 locator 字段是否支持 |

脚本方法对照在本文下一节，不再单列文件。

---

## 14. 脚本方法与 MCP 对照

对外脚本语法以 [`scripts/lib/ada-client.mjs`](../scripts/lib/ada-client.mjs) 为准。内部在 `executor.runCommand` 入口做 `normalizeCommandEnvelope`。本地和 MCP 用同一套 `page.*` / `phone.*`，MCP 时 `open` 的第二参为 `{ connect: "mcp" }`。

### 14.1 手机 `phone.*`

| 脚本 | MCP | 语义命令 |
|------|-----|----------|
| `phone.wake()` | `ada_mobile_action` + `custom` shell | `custom` |
| `phone.killAllApps()` | 脚本内 ps → kill，不是单条 command | — |
| `phone.swipe(from, to, opts?)` | `ada_mobile_action` `swipe` | `swipe` |
| `phone.goto(appId, ability?)` | `ada_mobile_action` `launchApp` | `launchApp` |
| `phone.goto("首页")` | `ada_mobile_action` `click` | `click`（按文案） |
| `phone.back(times?)` | `ada_mobile_action` `back` | `back` |
| `phone.dismissPopups()` | `ada_mobile_dismiss_popups` | 无弹窗仍 `ok`，码 `POPUP_NOT_FOUND` |
| `phone.fillSearch(text, hints?)` | `ada_mobile_recipe` `fill_search` | `recipe` |
| `phone.pressHome()` | `ada_mobile_action` | `pressHome`（`home` 是别名） |
| `phone.screenshot(path)` | `ada_mobile_action` | `screenshot` |
| `phone.exit(appId)` | `ada_mobile_action` `exitApp` | `exitApp` |
| `phone.close(opts?)` | `ada_close_session` | 默认先 `exit` 再关会话；`keepApp` 只关会话 |

### 14.2 网页 `page.*`

| 脚本 | MCP | 命令 |
|------|-----|------|
| `page.goto(url)` | `ada_web_action` | `navigate` |
| `page.find(...).fill(text)` | `ada_web_action` | `type`（别名 `fill`） |
| `page.dismissPopups()` | `ada_web_dismiss_popups` | 无弹窗仍 `ok` |
| `page.exit()` / `page.close()` | `ada_close_session` | 关闭浏览器和会话 |

### 14.3 入口会改写的字段

| 请写 | 不要再写 |
|------|----------|
| `appId` | `bundleId`、`packageId`、`package` |
| `durationMs` | `speed` |
| `waitTimeoutMs` | `actionWaitMs` |
| `pressHome` | `command: home` |
| `ada_mobile_recipe` / `recipe` | `custom.action: fill_search` |

本手册描述的是使用方式。工具参数若与 MCP 接入手册不一致，以接入手册和当前版本的工具 schema 为准。
