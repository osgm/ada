# ADA 语义命令对照（L0 脚本 ↔ MCP ↔ 内部）

对外脚本语法以 [`scripts/lib/ada-client.mjs`](../scripts/lib/ada-client.mjs) 为准；内部在 `executor.runCommand` 入口统一 `normalizeCommandEnvelope`。

## 移动设备（L0 `phone.*`）

| 脚本（推荐） | MCP 工具 | 语义命令 | 说明 |
|--------------|----------|----------|------|
| `phone.wake()` | `ada_mobile_action` + `custom` shell | `custom` | 平台相关实现 |
| `phone.killAllApps()` | 同上（脚本内 ps→kill） | — | 非单条 command，见 `mobile-kill-all-apps.mjs` |
| `phone.swipe(from, to, opts?)` | `ada_mobile_action` `swipe` | `swipe` | 鸿蒙 0~1；`durationMs` / `swipePreset` |
| `phone.goto(appId, ability?)` | `ada_mobile_action` `launchApp` | `launchApp` | 包名启动 App；鸿蒙第二参为 ability |
| `phone.goto("首页")` | `ada_mobile_action` `click` | `click` | 按文案查找并点击（页面跳转） |
| `phone.back(times?)` | `ada_mobile_action` `back` | `back` | 系统返回键，默认 1 次 |
| `phone.dismissPopups()` | **`ada_mobile_dismiss_popups`** | — | 无弹窗 → `POPUP_NOT_FOUND`，仍 `ok` |
| `phone.fillSearch(text, hints?)` | **`ada_mobile_recipe`** `fill_search` | **`recipe`** | 与 `command:recipe` 等价 |
| `phone.pressHome()` | `ada_mobile_action` | **`pressHome`** | 系统 Home 键；`home` 为命令别名 |
| `phone.screenshot(path)` | `ada_mobile_action` | `screenshot` | |
| `phone.exit(appId)` | `ada_mobile_action` `exitApp` | **`exitApp`** | 结束 App；无包名则 no-op |
| `phone.close(opts?)` | `ada_close_session` | — | 默认 `exit` + 关会话（+ MCP）；`keepApp` 仅关会话 |

## Web（L0 `page.*`）

| 脚本 | MCP | 命令 |
|------|-----|------|
| `page.goto(url)` | `ada_web_action` | `navigate` |
| `page.find(...).fill(text)` | `ada_web_action` | `type`（别名 **`fill`**） |
| `page.dismissPopups()` | **`ada_web_dismiss_popups`** | — |
| `page.exit()` | `ada_close_session` | — | 关闭浏览器 |
| `page.close(opts?)` | `ada_close_session` | — | 默认同 `exit` + 关会话（+ MCP） |

## Payload 规范（入口自动规范化）

| Canonical | 废弃别名 |
|-----------|----------|
| `appId` | `bundleId`, `packageId`, `package` |
| `durationMs` | `speed`（滑动时长） |
| `waitTimeoutMs` | `actionWaitMs`（auto-wait） |

## MCP 返回（成功）

```json
{
  "ok": true,
  "status": "ok",
  "businessCode": "COMMAND_OK",
  "message": "ok",
  "result": { }
}
```

业务跳过（如关弹窗无弹窗）：`ok: true` + `businessCode: "POPUP_NOT_FOUND"`，**非** `isError`。

## 不推荐

| 项 | 替代 |
|----|------|
| `command: home` | `pressHome`（系统 Home 键） |
| 直接写 `custom.action: fill_search` | `recipe` 或 `ada_mobile_recipe` |

## 传输层

```javascript
// 本地
const phone = await open(device({ type: "harmony", sessionId: "x" }));

// MCP（语法相同）
const phone = await open(device({ type: "harmony", sessionId: "x" }), { via: "mcp", client });
```

```python
from ada_mcp import connect_mcp
from ada_client import device, open

mcp = connect_mcp()
phone = open(device(type="harmony", session_id="x"), {"via": "mcp", "client": mcp})
```

见 [`scripts/examples/README.md`](../scripts/examples/README.md)。
