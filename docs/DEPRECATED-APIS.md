# 已移除 API

本项目**不做**旧名兼容层；下列 API 已删除，请勿在新脚本中使用。

## 脚本层（L0）

| 已移除 | 替代 |
|--------|------|
| `phone.home(tab?)` | `phone.back()` 或 `phone.goto("页面文案")` |
| `phone.launch(appId, …)` | `phone.goto(appId, abilityId?)` |
| `adaShutdown` | `exit()` |
| `sleep`（Python/Node 脚本库） | `wait()` |

## 语义命令 / MCP

| 已移除 | 替代 |
|--------|------|
| `command: terminateApp` | `exitApp`（入口仍会把别名 normalize 为 `exitApp`） |
| `recipe` / `go_home` | `phone.back()` + `phone.goto(...)` |
| `ada_execute` | `ada_web_action` / `ada_mobile_action` / `ada_mobile_recipe` |
| `swipeLeft` / `swipeRight` | `phone.swipe(from, to)` |
| `POST /tool/call`（legacy REST） | `POST /mcp` Streamable HTTP |

## invoke 载荷

| 已移除 | 替代 |
|--------|------|
| `payload.custom.method` / `payload.custom.path` | `payload.http.method` / `payload.http.path`，或顶层 `mode` + `method` / `http`（见接入手册 §3.3） |

## 系统键命名

| 含义 | API |
|------|-----|
| 系统返回 | `phone.back()` → `back` |
| 系统 Home 键 | `phone.pressHome()` → `pressHome`（`home` 仅作命令别名） |
| 打开 App / 点 Tab | `phone.goto(...)` |

## MCP 工具可见性

默认 `ADA_MCP_HIDE_ADVANCED=1`（`connectMcp` / 文档示例），隐藏 T3：`ada_invoke`、`ada_risk_policy`。需要驱动级 API 时设为 `0`。

环境变量 canonical 名与别名见 [`ADA-MCP-环境变量.md`](ADA-MCP-环境变量.md)。
