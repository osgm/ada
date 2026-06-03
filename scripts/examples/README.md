# 京东 E2E 示例

## 目录与运行

```text
examples/
├── nodejs/{web,android,harmony,ios}/
│   ├── jd-e2e.mjs               # 本地 ada-client
│   └── jd-mcp-*.mjs             # MCP（业务步骤与 e2e 一致）
└── python/{web,android,harmony,ios}/
    ├── jd_e2e.py
    └── jd_mcp_*.py
```

| 平台 | 本地 Node.js | 本地 Python | MCP Node.js | MCP Python |
|------|--------------|-------------|-------------|------------|
| Web（四场景） | `test:jd-web` | `test:jd-web:py` | `test:jd-web:mcp` | `test:jd-web:mcp:py` |
| Android（10 步） | `test:jd-android` | `test:jd-android:py` | `test:jd-android:mcp` | `test:jd-android:mcp:py` |
| 鸿蒙（10 步） | `test:jd-harmony` | `test:jd-harmony:py` | `test:jd-harmony:mcp` | `test:jd-harmony:mcp:py` |
| iOS（10 步 MCP） | — | — | `test:jd-ios:mcp` | `test:jd-ios:mcp:py` |

业务常量（如 `SEARCH_TEXT`、`APP_ID`）写在各脚本顶部；**只 import 库入口**：

- Node.js：[`../lib/ada-client.mjs`](../lib/ada-client.mjs)
- Python：[`../lib/ada_client.py`](../lib/ada_client.py)（`init(__file__)` 自举环境；`connect_mcp` / `step_log` / `exit` 等均从此模块导入）

**Python 直接运行**（仓库根目录）：

```bash
python scripts/examples/python/web/jd_e2e.py
python scripts/examples/python/web/jd_mcp_web.py
```

---

## 命名对照（Node.js ↔ Python）

| 类别 | Node.js | Python |
|------|---------|--------|
| 环境初始化 | `await init()`（可选，根目录） | `init(__file__)` |
| 分步日志 | `stepLog("…")` | `step_log("…")` |
| 设备探测 | `readDevice({ type })` | `read_device(type=…)` |
| 关弹窗（独立） | `dismissWebPopups` / `dismissMobilePopups` | `dismiss_web_popups` / `dismiss_mobile_popups` |
| 定位器 | `by.text("搜索")` | `by.text("搜索")` |
| 会话 ID | `sessionId` | `session_id` |
| 设备 ID | `device_id` / `deviceId` | `device_id` |
| 超时 | `timeoutMs` / `actionWaitMs` | `timeout_ms` / `action_wait_ms` |
| 方法名 | `camelCase`（`killAllApps`） | `snake_case`（`kill_all_apps`） |
| iOS 工厂 | `ios()` | `ios()` |
| 键盘 | `page.keyboard.press("Enter")` | `page.keyboard_press("Enter")` |

---

## 总览：推荐写法

| 端 | 打开会话 | 导航 / 启 App |
|----|----------|----------------|
| Web | `const page = await open(browser({ type: "chrome" }))` | `await page.goto(url)` |
| Android | `const phone = await open(device({ type: "android" }))` | `await phone.goto(appId)` |
| 鸿蒙 | `const phone = await open(device({ type: "harmony" }))` | `await phone.goto(appId, abilityId)` |

- **auto-wait**：点击、输入、`exists()` 等受 `timeoutMs`（默认 **20000**）约束，一般**不必**写 `wait`。
- **强制等待**：`await wait(1500)` / `wait(1500)`（毫秒），仅在你需要额外停顿时使用。
- **与 `page.wait(ms)` 区别**：`page.wait` 是驱动级等待命令；`wait(ms)` 是脚本级休眠。
- **脚本退出**：示例末尾 `exit()` / `await exit()`（关闭执行器并退出进程）。

---

## `open(target)` — 统一入口

| 参数 `target` | 说明 | 返回值 |
|---------------|------|--------|
| `browser({ ... })` | Web 浏览器配置 | Web 页面对象 |
| `device({ ... })` | 移动设备配置（内建 adb/hdc 探测） | Android / 鸿蒙设备对象 |
| `"https://..."` + 第二参 `browser({})` | 兼容旧写法：打开即跳转 | Web 页面对象 |

**示例（Web）**

```javascript
const page = await open(browser({ type: "chrome" }));
await page.goto("https://www.jd.com");
```

**示例（移动）**

```javascript
const phone = await open(device({ type: "harmony", sessionId: "jd-harmony" }));
await phone.goto("com.jd.hm.mall", "EntryAbility");
```

### MCP 与本地脚本：同一套语法

本地直连与 MCP（等同 LLM + ada-mcp）**共用** `phone.*` / `page.*`；MCP 时 `open` 第二参三选一：

| 运行方式 | 打开会话 |
|----------|----------|
| 本地 | `await open(device({ type: "harmony", ... }))`；Web：`await open(browser({ type: "chrome", ... }))` 或 `await open(device({ type: "chrome", ... }))` |
| MCP | `await open(device({ ... }), { connect: "mcp" })` 或简写 `"mcp"`（**无需** `connectMcp`） |

```javascript
import { open, device, browser } from "../lib/ada-client.mjs";

const MCP = { connect: "mcp", mcpOptions: { name: "jd-harmony" } };
const phone = await open(device({ type: "harmony", sessionId: "jd-harmony" }), MCP);
const page = await open(browser({ sessionId: "jd-web-1", type: "chrome" }), MCP);
await phone.wake();
// …与 jd-e2e.mjs 完全相同
await phone.close(); // 自动断开 MCP
```

`mcpOptions` 可传 `name` / `env`（Web 常设 `ADA_PLAYWRIGHT_HEADLESS`）。已有连接时可 `open(..., mcp)` 传入 `connectMcp()` 返回值。

对照脚本：`nodejs/harmony/jd-e2e.mjs` ↔ `jd-mcp-harmony.mjs`（逐步一致）。

**Python（同样语法）**

```python
from ada_client import device, browser, open

MCP = {"connect": "mcp"}
phone = open(device(type="harmony", session_id="jd-harmony"), MCP)
page = open(browser(session_id="jd-web-1", type="chrome"), MCP)
phone.close()  # 自动断开 MCP
```

对照：`python/harmony/jd_e2e.py` ↔ `jd_mcp_harmony.py`。

---

## `browser(opts)` — Web 会话配置

传给 `open(browser({ ... }))`。多参数均为**选填**（对象字面量，顺序无关）。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `type` | `string` | `"chrome"` | 浏览器通道：`chrome` / `chromium` / `msedge` 等 |
| `sessionId` | `string` | 自动生成 | 会话名；单脚本多浏览器场景建议显式指定 |
| `timeoutMs` | `number` | `20000` | 操作 **auto-wait** 超时（毫秒） |
| `actionWaitMs` | `number` | — | 同 `timeoutMs`（别名） |
| `profile` | `string` | — | 本地用户数据目录（`userDataDir`），保留登录态 |
| `cdp` | `boolean` \| `number` | — | `true` 用默认 CDP 端口；数字为指定端口 |

**示例**

```javascript
await open(browser({
  type: "chrome",
  sessionId: "jd-web-1",
  timeoutMs: 30000,
  profile: "artifacts/examples/nodejs/web/chrome-profile",
  cdp: 9222
}));
```

```python
open(browser(type="chrome", session_id="jd-web-1", timeout_ms=30000, profile="...", cdp=9222))
```

---

## `device(opts)` — 移动会话配置

传给 `open(device({ ... }))`。`open` 时会自动 **adb/hdc 探测**（写入 `capabilities`、屏幕宽高）。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `type` | `"android"` \| `"harmony"` | `"harmony"` | 平台 |
| `sessionId` | `string` | 自动生成 | 会话名 |
| `timeoutMs` | `number` | `20000` | 操作 **auto-wait** 超时 |
| `actionWaitMs` | `number` | — | 同 `timeoutMs` |
| `device_id` | `string` | — | 设备序列号；**仅一台已连接设备时可省略** |
| `deviceId` | `string` | — | 同 `device_id` |
| `real` | `boolean` | 真机 | 仅 Mock 演示时写 `false` |
| `probeDevice` | `boolean` | `true` | 设为 `false` 跳过 adb/hdc 探测 |
| `appId` | `string` | — | 可选；一般只在 `goto` / `exit` 时传包名 |
| `abilityId` | `string` | — | 鸿蒙 Ability（也可只在 `launch` 时传） |

滑动时长仅在 `phone.swipe(from, to, { durationMs })`（或第三参直接传毫秒数）设置，**不要**写在 `device()` 上。

**示例**

```javascript
const phone = await open(device({
  type: "android",
  sessionId: "jd-android",
  // timeoutMs: 30000,
  // device_id: "你的设备SN",  // 多台设备时指定
}));
```

---

## Web 页面对象方法

由 `open(browser(...))` 返回，记为 `page`。

| 方法 | 参数 | 说明 |
|------|------|------|
| `goto(url)` | `url: string` | **推荐**：当前标签打开网址 |
| `tab(url)` | `url: string` | 同 `goto` |
| `find(loc)` | 见 [定位](#定位-by--find) | 查找元素，返回句柄 |
| `locator(loc)` | 同 `find` | 别名 |
| `keyboard.press(key)` | `key: string` | 如 `"Enter"` |
| `screenshot(path)` | 文件路径 | 截图 |
| `newTab(url)` | `url: string` | 新标签打开 |
| `switchTab(index?)` | `index: number` 默认 `0` | 切换标签 |
| `closeTab()` | — | 关闭当前标签 |
| `wait(timeoutMs?)` | 默认 `500` | **驱动级**等待（非脚本 `wait`） |
| `dismissPopups(arg?, attempts?)` | 见下表 | 通用关弹窗；**始终成功**（超时跳过） |
| `close()` | — | 关闭会话 |

> 业务步骤（如京东首页搜「ABC」）写在 **examples** 里，用 `find` + `fill` + `keyboard.press`，不在 `scripts/lib` 封装。

### `dismissPopups` 的可选参数

| 传参方式 | 含义 |
|----------|------|
| 不传 | 关弹窗总时长 **10000ms（10s）**；到时跳过，**不抛错**，返回 `{ success: true, dismissed, … }` |
| 数字 `20000` | 总时长 20000ms |
| 对象 `{ timeoutMs: 20000 }` | 同上 |
| 第二参 `attempts` | 额外限制尝试轮次，如 `dismissPopups(10000, 3)` 最多尝试 3 轮 |
| 对象 `{ timeoutMs: 10000, attempts: 3 }` | 同上（推荐） |

策略：**仅 `dialog` / `popup` / `modal` 内**的关闭按钮（页内 DOM 扫描 + 作用域内 locator）；**不用 Escape、不点全屏遮罩**，避免误关浏览器或页面。串行执行，返回 `hits` 便于对照日志。

**Web 示例片段**（见 [`nodejs/web/jd-e2e.mjs`](nodejs/web/jd-e2e.mjs)）

```javascript
const page = await open(browser({ sessionId: "jd-web-3", type: "chrome" }));
await page.goto(HOME_URL);
await page.newTab(HOME_URL);
await page.dismissPopups();
const box = page.find(by.id("key"));
if (!(await box.exists())) page.find(by.placeholder("搜索"));
await box.fill(SEARCH_TEXT);
await page.keyboard.press("Enter");
await page.screenshot(path.join(OUT, "03-tab-search.png"));
```

---

## 移动设备对象方法（Android / 鸿蒙）

由 `open(device(...))` 返回，记为 `phone`。两平台大部分方法一致；**多参数方法**差异见下表。

| 方法 | Android 参数 | 鸿蒙 参数 | 说明 |
|------|----------------|-----------|------|
| `wake()` | — | — | 唤醒屏幕 |
| `killAllApps(opts?)` | `excludePackages?` | 同左 | `ps` 取 PID → `kill`（跳过 system_server/zygote 等） |
| `swipe(from, to, opts?)` | 见下表 | 见下表 | 起点→终点滑动，时长/次数可配 |
| `goto(target, ...)` | `(appId, settleMs?)` 或页面文案 | `(appId, abilityId?, settleMs?)` 或页面文案 | 包名 → 启动 App；文案 → 查找并点击 |
| `back(times?, gapMs?)` | 默认 1 次 | 同左 | 系统返回键 |
| `dismissPopups(arg?)` | 同 Web 关弹窗参数 | 同左 | 关弹窗 |
| `fillSearch(text, hints?)` | 见下表 | 见下表 | 启发式搜索框输入（recipe） |
| `pressHome()` | — | — | 系统 Home 键（非业务导航） |
| `find(loc)` / `locator(loc)` | 见 [定位](#定位-by--find) | 同左 | 查找元素 |
| `screenshot(path)` | 文件路径 | 同左 | 截图 |
| `exit(appId)` / `exit(app_id)` | 包名 | — | 结束指定 App；无包名则 no-op |
| `close(opts?)` | — | — | 关会话（+ MCP）；默认尝试 `exit()`（无包名则跳过杀 App） |
| `close()` | — | — | 关闭会话 |

### 设备管理（`listApps` / `install` / `push` 等）

三端统一经 `deviceAdmin` 命令；脚本层提供下列方法（Android / 鸿蒙较全，iOS 部分能力依赖 WDA / 本机 `ideviceinstaller`）：

| 方法 | 说明 |
|------|------|
| `listApps()` / `appList()` | 已安装包列表 |
| `app(appId)` / `appInfo(appId)` | 应用信息 |
| `isInstalled(appId)` | 是否已安装 |
| `install(path)` | 安装 APK/HAP（本机路径） |
| `uninstall(appId)` | 卸载 |
| `push(local, remote)` / `pull(remote, local)` | 文件传输 |
| `shell(cmd)` | Android / 鸿蒙 shell |
| `hdc(cmd)` | 鸿蒙 hdc |
| `currentApp()` | 前台包名 |
| `clearAppData(appId)` | 清数据 |
| `openUrl(url)` / `openDeepLink(url)` | 打开链接 |
| `pressKey(key)` | 按键（如 `Home`、`KEYCODE_BACK`） |
| `longPress([x,y], ms?)` | 长按坐标 |
| `setClipboard` / `getClipboard` | 剪贴板 |
| `deviceInfo()` | 型号、系统版本、分辨率等 |
| `grantPermission(appId, perm)` | 授权（Android） |
| `setOrientation('portrait'\|'landscape')` | 横竖屏 |
| `startScreenRecord` / `stopScreenRecord` | 录屏（Android 有限支持） |
| `reboot()` | 重启设备 |

### `swipe(from, to, durationOrOpts?)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `from` | `[x, y]` 或占位符 | 起点，**默认像素**；`{ relative: true }` 时数值为 0～1 比例 |
| `to` | `[x, y]` 或占位符 | 终点，规则同 `from` |
| `durationOrOpts` | `number` \| `object` | `{ durationMs, times, gapMs, relative? }`；`relative: true` 启用比例坐标 |

**坐标占位符**（整点字符串或单轴）：

- 命名点：`leftMiddle`、`rightMiddle`、`topMiddle`、`bottomMiddle`、`center` 等
- 单轴：`left` / `right` / `top` / `bottom` / `hCenter` / `vCenter`
- 百分号：`"6%"`、`"50%"`（按屏宽/高换算像素）

示例（比例，与现有京东脚本一致）：

```javascript
await phone.swipe([0.06, 0.5], [0.94, 0.5], { durationMs: 1200, relative: true });
await phone.swipe("leftMiddle", "rightMiddle", { relative: true, durationMs: 1200 });
```

示例（像素，默认）：

```javascript
await phone.swipe([65, 1200], [1015, 1200], { durationMs: 1200 });
```

示例：左滑一次、右滑两次（屏幕中部、近边界、慢速）：

```javascript
const slowMs = 1200;
await phone.swipe([0.94, 0.5], [0.06, 0.5], { durationMs: slowMs, relative: true });
await phone.swipe([0.06, 0.5], [0.94, 0.5], { durationMs: slowMs, relative: true, times: 2 });
```

### `pinch(finger1, finger2, distance, options?)`（Android / 鸿蒙 / iOS）

双指缩放：两指起点 + 径向位移 `distance`（默认像素；`relative: true` 时按 `min(宽,高)` 比例）。

| 选项 | 说明 |
|------|------|
| `pinchIn` | `true` 缩小（两指向中心），`false` 放大 |
| `durationMs` | 单次手势时长（默认约 400–500ms） |
| `relative` | 起点与 `distance` 均按屏比例 |
| `times` / `gapMs` | 重复次数与间隔 |

京东示例在步骤 `[4]` 滑屏后执行 `[4b]` 缩小、`[4c]` 放大：

```javascript
const PINCH_OPTS = { relative: true, durationMs: 500 };
await phone.pinch([0.22, 0.38], [0.78, 0.62], 0.07, { pinchIn: true, ...PINCH_OPTS });
await phone.pinch([0.22, 0.38], [0.78, 0.62], 0.07, { pinchIn: false, ...PINCH_OPTS });
```

Python：`phone.pinch((0.22, 0.38), (0.78, 0.62), 0.07, pinch_in=True, duration_or_opts=PINCH_OPTS)`。

### `fillSearch(text, hintsOrOpts?)`

启发式搜索框输入（recipe）。P1 起支持 **入口/输入框分开配置**、**结构化失败码**、**内置 fallback 链**（启发式 → 文本 hints → 坐标）。

| 参数 | 说明 |
|------|------|
| `text` | 要输入的搜索词 |
| `hintsOrOpts` | 字符串 / 字符串数组（兼容旧写法），或选项对象 |

**选项对象**：

| 字段 | 说明 |
|------|------|
| `hints` | 同时用于 entry + input（兼容） |
| `entryHints` | 仅匹配搜索**入口**（首页顶栏「搜索」等） |
| `inputHints` | 仅匹配**输入框** hint（「请输入…」等） |
| `strict` | `true` 时不走文本/坐标 fallback，失败更快 |
| `settleMs` | 点击后等待毫秒数 |

**失败 errorCode**（`mustOk` / 异常信息中可见）：

| errorCode | 含义 |
|-----------|------|
| `RECIPE_FILL_SEARCH_NO_ENTRY` | 未找到搜索入口 |
| `RECIPE_FILL_SEARCH_NO_INPUT` | 未找到输入框（strict） |
| `RECIPE_FILL_SEARCH_TYPE_FAILED` | 点击后输入失败 |

示例（推荐：分开配置入口与输入框）：

```javascript
await phone.fillSearch("ABC", {
  entryHints: ["搜索"],
  inputHints: ["请输入", "输入", "搜索"]
});

// 严格模式（调试启发式）
await phone.fillSearch("ABC", { entryHints: ["搜索"], strict: true });
```

Python：`phone.fill_search("ABC", {"entryHints": ["搜索"], "inputHints": ["请输入"]})`。

### `goto(target, ...)`

| `target` | 行为 |
|----------|------|
| 包名 `com.example.app` | `launchApp` 启动应用（鸿蒙可传第二参 ability） |
| 页面文案 `"首页"` | `find` + `click` 跳转到该 Tab/页面 |
| `{ appId, abilityId?, settleMs? }` | 对象形式启动 |

### `back(times?, gapMs?)`

| 参数 | 默认 | 说明 |
|------|------|------|
| `times` | `1` | 连按返回次数 |
| `gapMs` | `0.4` | 多次返回间隔（秒） |

**移动示例片段**（见 [`nodejs/harmony/jd-e2e.mjs`](nodejs/harmony/jd-e2e.mjs)）

```javascript
const phone = await open(device({ type: "harmony", sessionId: "jd-harmony" }));
await phone.goto(APP_ID, ABILITY_ID);
await phone.dismissPopups();
const input = phone.find(by.text("请输入"));
if (await input.exists()) await input.fill(SEARCH_TEXT);
else await phone.fillSearch(SEARCH_TEXT, ["搜索", "请输入"]);
await phone.back();
```

---

## 定位：`by` + `find`

### `by.*` 构造器（Web / 移动通用）

| 方法 | 参数 | 生成定位 |
|------|------|----------|
| `by.id(name)` | 元素 id | Web：`#id` |
| `by.css(selector)` | CSS | `{ css }` |
| `by.xpath(expr)` | XPath | `{ xpath }` |
| `by.text(label)` | 文案 | `{ text }`（移动常用） |
| `by.placeholder(text)` | 占位符片段 | `[placeholder*="..."]` |
| `by.role(r)` | 角色 | `{ role }` |
| `by.testId(id)` | test id | `{ testId }` |

### `find` 的 `loc` 参数

| 传入 | Web | 移动 |
|------|-----|------|
| `by.xxx(...)` | 按 CSS/XPath 等 | 按 text 等 |
| 字符串 `"搜索"` | 视为 **CSS** 选择器 | 视为 **文案** `{ text }` |

### 元素句柄（`find` 返回值）

| 方法 | 参数 | 说明 |
|------|------|------|
| `click()` | — | 点击 |
| `fill(text)` | `string` | 输入文本 |
| `press(key)` | `string` | 在元素上按键（少用） |
| `exists()` | — | 是否可见（不抛错，配合 auto-wait） |
| `text()` | — | 读取文本，失败抛错 |

---

## 工具函数

| 函数 | 参数 | 说明 |
|------|------|------|
| `dir(path)` | 目录路径 | 递归创建；相对路径基于**仓库根** |
| `readText(path)` | 文件路径 | 读文本 |
| `writeText(path, text)` | 路径、内容 | 写文本 |
| `readJson(path)` | 文件路径 | 读 JSON |
| `writeJson(path, data, space?)` | 路径、对象、缩进 | 写 JSON |
| `wait(ms)` | 毫秒 | **脚本级**强制等待 |

---

## 京东示例脚本在测什么

| 脚本 | 场景概要 |
|------|----------|
| [`nodejs/web/jd-e2e.mjs`](nodejs/web/jd-e2e.mjs) | ① 普通 Chrome ② Profile 缓存 ③ 新 Tab + 业务搜索 ④ CDP + 业务搜索 |
| [`nodejs/web/jd-mcp-web.mjs`](nodejs/web/jd-mcp-web.mjs) | **同上四场景**，全程 MCP；截图带 `-mcp` 后缀 |
| [`nodejs/android/jd-e2e.mjs`](nodejs/android/jd-e2e.mjs) | 10 步：唤醒 → 清后台 → 滑屏 → 启动京东 → 关弹窗 → 搜索 ABC → 截图 → 返回 → 退出 |
| [`nodejs/android/jd-mcp-android.mjs`](nodejs/android/jd-mcp-android.mjs) | 同上，全程 MCP |
| [`nodejs/harmony/jd-e2e.mjs`](nodejs/harmony/jd-e2e.mjs) | 同 Android；`goto` 多传 `abilityId` |
| [`nodejs/harmony/jd-mcp-harmony.mjs`](nodejs/harmony/jd-mcp-harmony.mjs) | 同上，全程 MCP |
| [`nodejs/ios/jd-mcp-ios.mjs`](nodejs/ios/jd-mcp-ios.mjs) | 同 Android 10 步；`goto` 仅 bundle；`killAllApps` 在 iOS 上为占位 |

Python 对照：`python/{web,android,harmony,ios}/jd_e2e.py` ↔ `jd_mcp_*.py`（iOS 仅 MCP）；Web 四场景逻辑已在各脚本内自包含实现。

**本地 vs MCP**：业务步骤相同；MCP 脚本在 `open(..., { via: "mcp" })` 下执行，移动真机默认 `real: true, mock: false`。

### 本地示例：node 与 tsx

本地 `jd-e2e` 需加载 `apps/ada-mcp-server/src/executor.ts`，支持三种方式（见 `scripts/lib/load-executor.mjs`）：

| 方式 | 命令 | 说明 |
|------|------|------|
| npm 脚本（推荐） | `npm run test:jd-web` 等 | 经 `run-ada-example.mjs`，内部 `node --import tsx` |
| tsx CLI | `npx tsx scripts/examples/nodejs/web/jd-e2e.mjs` | 直接跑 TypeScript 源码 |
| 纯 node | 先 `npm run build:executor-dev`，再 `node scripts/.../jd-e2e.mjs` | 使用打包的 `scripts/lib/ada-executor.cjs` |

MCP 示例（`jd-mcp-*.mjs`）只需 `node`，不经过上述 executor 加载。

---

## 常见写法速查

| 需求 | 写法 |
|------|------|
| 只连一台手机 | `open(device({ type: "android" }))`，不写 `device_id` |
| 多台手机 | `device({ type: "android", device_id: "SN" })` |
| 拉长找元素时间 | `browser({ timeoutMs: 60000 })` 或 `device({ timeoutMs: 60000 })` |
| 关弹窗更久 | `page.dismissPopups(60000)` / `phone.dismiss_popups(60000)` |
| 不用自动探测设备 | `device({ type: "android", probeDevice: false, capabilities: { udid: "x" }, ... })` |
| Mock 演示 | `device({ type: "harmony", real: false })` |

更底层 API 见 [`../lib/README.md`](../lib/README.md)。
