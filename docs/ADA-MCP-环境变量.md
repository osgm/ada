# ADA MCP 环境变量（canonical + 别名）

实现侧统一解析见 `packages/core-runtime/src/ada-env.ts`。新增变量时请优先扩展该模块，避免在业务代码中重复读别名。

## 工具可见性 / 响应体积

| Canonical | 别名 | 说明 |
|-----------|------|------|
| `ADA_MCP_HIDE_ADVANCED` | `ADA_MCP_TOOL_VISIBILITY`（`hide` / `1` / `primary-only`） | 隐藏 T3：`ada_invoke`、`ada_risk_policy` |
| `ADA_MCP_VERBOSE_RESULT` | — | `1` 时 MCP 返回完整 `CommandResult` |
| `ADA_MCP_SLIM_RESULT` | — | `0` 等同 verbose（显式关闭 slim） |
| `ADA_MCP_DESC_MODE` | — | 默认 **advanced**（正确性/路由优先）；显式 `compact` / `short` 才短描述（省 token） |
| `ADA_MCP_MAX_PAYLOAD_CHARS` | `12000` | 返回 JSON 软上限；超限先裁臃肿字段，保留 `summary`/`recoveryHint`/`errorCode` |
| `ADA_BATCH_TIMEOUT_MS` | — | `ada_batch_actions` / inbound 未传顶层 `timeoutMs` 时的整批墙钟预算 |

## 启动 / 握手

| Canonical | 别名 | 说明 |
|-----------|------|------|
| `ADA_MCP_FAST_START` | `ADA_MCP_QUICK_START` | 快速握手（默认开启） |
| `ADA_MCP_SLOW_START` | — | `1` 关闭快速握手 |

## 插件启停依赖门禁

| Canonical | 说明 |
|-----------|------|
| `ADA_PLUGIN_AUTO_INSTALL_DEPS` | 插件 **启动**（`ensureInitialized`）时检查依赖；缺失则自动补装。默认开启；设 `0`/`false` 则只检查、不补装（缺依赖直接失败）。停止插件会清健康缓存，下次启动重新检查。 |
| `ADA_MCP_SKIP_INSTALL_DEPS` | 若设为跳过 MCP bootstrap 安装，且未显式设 `ADA_PLUGIN_AUTO_INSTALL_DEPS=1`，插件启停门禁也不再自动补装。 |

## 依赖下载源测速

| Canonical | 说明 |
|-----------|------|
| `ADA_MCP_REGISTRY_PROBE_TTL_MS` / `ADA_DEPS_MIRROR_PROBE_TTL_MS` | registry / Playwright CDN 测速结果 TTL，默认 **1 小时**（3600000） |
| `ADA_MCP_FORCE_REGISTRY_PROBE` | `1` 强制重测 npm registry |
| `ADA_MCP_FORCE_PLAYWRIGHT_PROBE` | `1` 强制重测 Playwright CDN（忽略启发式/缓存） |
| `PLAYWRIGHT_DOWNLOAD_HOST` | 显式钉死 CDN 时跳过 Playwright 测速 |
| `ADA_MCP_REGISTRY` / `ADA_NPM_PROXY_REGISTRY` | 显式钉死 npm registry 时跳过 registry 测速 |

## 缓存 / 性能

| Canonical | 别名 | 说明 |
|-----------|------|------|
| `ADA_UI_DUMP_CACHE_MS` | `ADA_ANDROID_HIERARCHY_CACHE_MS` | 移动 UI dump 缓存 TTL（默认 4000） |
| `ADA_MCP_PREFLIGHT_CACHE_MS` | — | 移动 runtime preflight 成功缓存（默认 60000） |
| `ADA_MCP_PROBE_CACHE_MS` | — | 移动 probe 缓存（默认 45000） |
| `ADA_WEB_PAGE_PROBE_TTL_MS` | — | Web `ensureWebPageReady` 探活缓存（默认 5000） |
| `ADA_MOBILE_SESSION_PROBE_TTL_MS` | — | 移动会话探活缓存（默认 5000；可回落到 WEB_PAGE_PROBE） |
| `ADA_SETTLE_SMART` | — | recipe settle 智能早退（默认开；`0` 退回固定 sleep） |
| `ADA_SESSION_SERIALIZE_ALL` | — | `1` 时同 session 全串行（关闭只读并行） |
| `ADA_LOCATOR_HINT_TTL_MS` | — | 成功 locator 温缓存 TTL（默认 12000）；`0` 禁用 |
| `ADA_LOCATOR_WARM_TIMEOUT_MS` | — | 温 locator 的 locatorTimeoutMs 上限（默认 1200） |
| `ADA_WEB_EXPAND_SETTLE_MS` | — | Web expand 后固定 settle（默认 50） |
| `ADA_WEB_NAVIGATION_TIMEOUT_MS` | — | `navigate` / `reload` / `newTab` 打开页等待（默认 **75000**，覆盖登录墙）；也可用 payload `navigationTimeoutMs` / `timeoutMs`。超时会释放浏览器连接 |
| `ADA_RELEASE_ON_WAIT_TIMEOUT_MS` | — | 前置条件/locator 等待达到该毫秒数即释放连接（默认 **60000**）；`0`=任意 timeout 都释放。另：navigate/wait、`COMMAND_TIMEOUT`、文案含「前置条件/无正确响应」一律释放。释放后须换新 `sessionId`（复用返回 `SESSION_RELEASED` + `suggestedSessionId`；`payload.forceReuseReleasedSession=true` 可清登记） |
| `ADA_PLAYWRIGHT_CDP_SHARE_EXISTING` | — | `true` 时 CDP autoLaunch 可附着已有调试端口（默认关闭：每个 session 新开独立浏览器） |
| `ADA_PLAYWRIGHT_REUSE_CDP_CONTEXT` | — | `true` 时 CDP 复用已有 BrowserContext（默认关闭：每 session `newContext` 隔离） |

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

载荷规范见 [`ADA-MCP-接入手册.md`](ADA-MCP-接入手册.md) §3.3。

Host 侧 `mcp.json` 字段与可选参数取值范围见 [`ADA-MCP-插件配置说明.md`](ADA-MCP-插件配置说明.md)。

## 完整列表

启动、镜像、移动 bootstrap、Web CDP、动作熔断等见 [`ADA-MCP-接入手册.md`](ADA-MCP-接入手册.md) §1.4、§3.3、§6。
