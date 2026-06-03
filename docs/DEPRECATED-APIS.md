# 已移除 / 不推荐 API

本项目**不做**旧名兼容层；下列 API 已从脚本与 MCP recipe 中删除，请勿在新脚本中使用。

## 脚本层（L0）

| 已移除 | 替代 |
|--------|------|
| `phone.home(tab?)` | `phone.back()` 或 `phone.goto("页面文案")` |
| `phone.launch(appId, …)` | `phone.goto(appId, abilityId?)` |
| `adaShutdown` | `exit()` |
| `sleep`（Python/Node 脚本库） | `wait()` |

## 语义命令 / MCP

| 已移除 / T3 | 替代 |
|-------------|------|
| `command: terminateApp` | `exitApp`（入口仍会把别名 normalize 为 `exitApp`） |
| `recipe` / `go_home` | `phone.back()` + `phone.goto(...)` |
| `ada_execute`（日常） | `ada_web_action` / `ada_mobile_action` / `ada_mobile_recipe` |
| `swipeLeft` / `swipeRight` | `phone.swipe(from, to)` |

## 系统键命名

| 含义 | API |
|------|-----|
| 系统返回 | `phone.back()` → `back` |
| 系统 Home 键 | `phone.pressHome()` → `pressHome`（`home` 仅作命令别名） |
| 打开 App / 点 Tab | `phone.goto(...)` |

## MCP 工具可见性

默认 `ADA_MCP_HIDE_ADVANCED=1`（`connectMcp` / 文档示例），隐藏 T3：`ada_execute`、`ada_invoke`、`ada_risk_policy`。需要通用信封时再设为 `0`。
