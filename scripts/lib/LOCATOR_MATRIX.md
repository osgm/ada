# `by` + `find` 定位矩阵

业务脚本统一使用 **`page.find(by.*)`** / **`phone.find(by.*)`**（或字符串简写），句柄方法：`click()`、`fill()`、`clear()`、`exists()`、`text()`。

底层语义命令：`click` / `type`（`fill` 别名）/ `assertVisible` / `getText`，payload 字段为 `locator: { ... }`。

> **v0.2+**：已移除 `locator` / `tab` 别名，请只用 `find` / `goto`。

---

## 1. `by` 工厂（`ada-client` / `ada_client.py`）

| 工厂 | 生成 payload | Web | Android | Harmony | iOS |
|------|----------------|-----|---------|---------|-----|
| `by.id(name)` | `{ id }` | CSS `#name` | `resource-id` / UIA2 `id` | Hypium `BY.id` | `id` |
| `by.css(sel)` | `{ css }` | Playwright CSS | —（请用 id/xpath/text） | — | — |
| `by.xpath(expr)` | `{ xpath }` | `xpath=…` | UIA2 xpath；adb 模式解析 `@text` 等 | `findComponentByXpath` | xpath |
| `by.text(label)` | `{ text }` | `getByText` | xpath 含 text/content-desc；adb 树匹配文案 | Hypium `BY.text`（搜索类走 uiDump） | — |
| `by.role(r)` | `{ role }` | `getByRole` | — | — | — |
| `by.testId(id)` | `{ testId }` | `getByTestId` | — | — | — |
| `by.placeholder(t)` | `{ css: '[placeholder*="t"]' }` | CSS | — | — | — |

**字符串简写** `find("…")`：

- **Web** → `{ css: "…" }`
- **移动** → `{ text: "…" }`

---

## 2. 各平台 `locator` 字段与驱动行为

### Web（Playwright）

| 字段 | 支持 | 说明 |
|------|------|------|
| `css` | ✅ | 首选 |
| `xpath` | ✅ | `xpath=` 前缀 |
| `id` | ✅ | 转为 `#id` |
| `text` | ✅ | `getByText` |
| `role` + `name` | ✅ | `getByRole` |
| `testId` | ✅ | `getByTestId` |
| `accessibilityId` | ✅ | `[aria-label="…"]` |
| `kind` + `value` | ✅ | 合约 LocatorV2 扩展 |

### Android（UiAutomator2 / adb）

| 字段 | HTTP (UIA2) | adb 直连 | 说明 |
|------|-------------|----------|------|
| `id` | ✅ `using: id` | ✅ `resource-id` | 完整或后缀匹配 |
| `accessibilityId` | ✅ | ✅ `content-desc` | |
| `xpath` | ✅ | ✅ 简化解析 `@text` / `@resource-id` / `@content-desc` | |
| `text` | ✅ xpath 派生 | ✅ 树匹配 text / content-desc | v0.2+ 与 `by.text` 对齐 |
| `css` / `role` / `testId` | — | — | 请改用上表字段 |

**`type` 补充**：`inputOp: "clear"`（或 `androidInputOp: "clear"`）先点定位元素再发 `KEYCODE_DEL`；无 locator 时仅全局退格。

### Harmony（Hypium + uiDump）

| 字段 | 支持 | 说明 |
|------|------|------|
| `text` | ✅ | 搜索类文案优先 uiDump，不走易噪 RPC |
| `id` | ✅ | `BY.id` |
| `key` | ✅ | `BY.key` |
| `type` | ✅ | `BY.type`（如 `TextInput`） |
| `xpath` | ✅ | |
| `byExpression` | ✅ | 需驱动 `byExpression` |
| `css` | — | 无 DOM |

**`type` 补充**：`inputOp: "clear"`（或 `harmonyInputOp: "clear"`）uiDump 点搜索框后退格。

### iOS

| 字段 | 支持 |
|------|------|
| `id` | ✅ |
| `accessibilityId` | ✅ |
| `xpath` | ✅ |
| `text` | 视驱动实现而定，建议 xpath |

---

## 3. 句柄方法（`find` 返回值）

| 方法 | Web | Android | Harmony | iOS | 语义命令 |
|------|-----|---------|---------|-----|----------|
| `click()` | ✅ | ✅ | ✅ | ✅ | `click` |
| `fill(text)` | ✅ | ✅ | ✅ | ✅ | `type` |
| `clear()` | ✅ | ✅ | ✅ | ✅ | Web: `locator.clear()`；移动: `type` + `inputOp: "clear"`（iOS 为 `text: ""`） |
| `exists()` | ✅ | ✅ | ✅ | ✅ | `assertVisible`（optional） |
| `text()` | ✅ | ✅ | ✅ | ✅ | `getText` |
| `press(key)` | ✅ | — | — | — | `press` |

**Web 页面级**：`back()` → 语义命令 `back`（浏览器历史后退，与 `phone.back()` 同名）。

**鸿蒙设备级**：`phone.type(text)` 向当前焦点输入（无 locator）。

---

## 4. 与 Playwright 对照（Web）

| Playwright | ADA |
|------------|-----|
| `page.goto(url)` | `page.goto(url)` |
| `page.goBack()` | `page.back()` |
| `page.getByText(t)` | `page.find(by.text(t))` |
| `page.locator(css)` | `page.find(by.css(css))` |
| `locator.fill(v)` | `find(...).fill(v)` |
| `page.keyboard.press(k)` | `page.keyboard.press(k)` |

---

## 5. 示例

```javascript
import { by, open, browser, device } from "./ada-client.mjs";

// Web
const page = await open(browser({ sessionId: "w1", type: "chrome" }));
// Web 也可：await open(device({ sessionId: "w1", type: "chrome" }))  // 与 browser 等价
await page.find(by.css("input#key")).fill("ABC");
await page.back();

// Android
const phone = await open(device({ type: "android", sessionId: "a1" }));
let field = phone.find(by.text("请输入"));
if (await field.exists()) {
  await field.clear();
  await field.fill("ABC");
}

// Harmony
const hm = await open(device({ type: "harmony", sessionId: "h1" }));
await hm.find(by.text("搜索")).click();
await hm.find({ type: "TextInput" }).clear();
await hm.find(by.text("请输入")).fill("ABC");
```

Python 用法相同：`from ada_client import by, open, browser, device`。

**TypeScript 类型（JavaScript 示例）**：见同目录 `ada-client.d.ts`；在 `scripts/examples` 下写 `.mjs` 即可获得 `phone` / `page` 方法补全。

**MCP 打开（Web / App 同一结构）**：

```javascript
const mcp = await connectMcp();
const MCP = { connect: "mcp", mcpOptions: { name: "my-script" } };
const page = await open(browser({ type: "chrome", sessionId: "w1", ...opts }), MCP);
const phone = await open(device({ type: "harmony", sessionId: "h1", ...opts }), MCP);
// 简写：open(..., "mcp")；phone.close() 默认 exit App + 关会话 + 断 MCP
// 脚本末尾：await exit()
```
