# ADA MCP 环境变量（canonical + 别名）

实现侧统一解析见 `packages/core-runtime/src/ada-env.ts`。新增变量时请优先扩展该模块，避免在业务代码中重复读别名。

## 工具可见性 / 响应体积

| Canonical | 别名 | 说明 |
|-----------|------|------|
| `ADA_MCP_HIDE_ADVANCED` | `ADA_MCP_TOOL_VISIBILITY`（`hide` / `1` / `primary-only`） | 隐藏 T3：`ada_invoke`、`ada_risk_policy` |
| `ADA_MCP_VERBOSE_RESULT` | — | `1` 时 MCP 返回完整 `CommandResult` |
| `ADA_MCP_SLIM_RESULT` | — | `0` 等同 verbose（显式关闭 slim） |
| `ADA_MCP_DESC_MODE` | — | 默认 **compact**（短描述，全局策略集中在 `ada_health` + `ada://guide/routing`）；`advanced` / `full` 恢复完整 WORKFLOW/POLICY 前缀 |

## 启动 / 握手

| Canonical | 别名 | 说明 |
|-----------|------|------|
| `ADA_MCP_FAST_START` | `ADA_MCP_QUICK_START` | 快速握手（默认开启） |
| `ADA_MCP_SLOW_START` | — | `1` 关闭快速握手 |

## 缓存 / 性能

| Canonical | 别名 | 说明 |
|-----------|------|------|
| `ADA_UI_DUMP_CACHE_MS` | `ADA_ANDROID_HIERARCHY_CACHE_MS` | 移动 UI dump 缓存 TTL（默认 2000） |
| `ADA_MCP_PREFLIGHT_CACHE_MS` | — | 移动 runtime preflight 成功缓存（默认 60000） |
| `ADA_MCP_PROBE_CACHE_MS` | — | 移动 probe 缓存（默认 45000） |
| `ADA_WEB_PAGE_PROBE_TTL_MS` | — | Web `ensureWebPageReady` 探活缓存（默认 2000） |

## 动作熔断（Web clickPath / Mobile tap_path）

| Canonical | 说明 |
|-----------|------|
| `ADA_WEB_ACTION_LEDGER_MAX_CONSECUTIVE` | 连续相同动作阈值，默认 `3` |
| `ADA_WEB_ACTION_LEDGER_MAX_WINDOW` | 时间窗内总次数阈值，默认 `5` |
| `ADA_WEB_ACTION_LEDGER_WINDOW_MS` | 熔断时间窗毫秒数，默认 `60000` |

## 移动设备 ID

| Canonical | 别名 | 说明 |
|-----------|------|------|
| `ADA_ANDROID_DEVICE_SN` | `ADA_ANDROID_UDID`（capabilities 优先） | 默认 Android serial |
| `ADA_IOS_DEVICE_UDID` | capabilities.udid | iOS 真机 UDID |
| `ADA_HARMONY_DEVICE_SN` | capabilities.deviceSn | 鸿蒙设备 SN |

## invoke 载荷（已移除 custom 块）

| 已移除 | 替代 |
|--------|------|
| `payload.custom.method` / `payload.custom.path` | `payload.http.method` / `payload.http.path`，或顶层 `method` + `target` |

详见 [`DEPRECATED-APIS.md`](DEPRECATED-APIS.md)。

## 完整列表

启动、镜像、移动 bootstrap、Web CDP、动作熔断等见 [`ADA-MCP-接入手册.md`](ADA-MCP-接入手册.md) §1.4、§3.3、§6。
