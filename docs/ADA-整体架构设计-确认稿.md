# ADA 整体架构设计（确认稿）

**版本**：2.0-draft  
**状态**：待确认（确认后再开发 `driver-selenium`）  
**日期**：2026-05  
**关联文档**：`ADA-架构设计方案.md`、`ADA-MCP-接入手册.md`、`ADA-开发手册.md`

---

## 1. 文档目的

在既有 ADA 架构基础上，纳入 **Web 侧可选 Selenium 引擎**，形成可落地的整体蓝图，避免：

- 与「Playwright + Appium 双驱动基线」冲突；
- `PluginHost` 单平台单插件模型与双 Web 引擎冲突；
- MCP / 任务 JSON / `invoke` 语义分裂。

**请确认本文第 8 节「待确认项」后再进入开发。**

---

## 2. 现状与目标差异

### 2.1 仓库已实现（2026-05）

| 组件 | 状态 |
|------|------|
| 入口 | `ada-agent`（CLI）、`ada-mcp`（MCP）、`ada-gui`、`ada-web` |
| 核心 | `agent-core`、`core-kernel`（TaskExecutor）、`plugin-host` |
| 契约 | `CommandEnvelope`、`invoke`、`@ada/driver-rpc` |
| 驱动 | `driver-playwright`（web）、`driver-appium`（android/ios/harmony） |
| **Selenium** | **未实现** |

### 2.2 架构文档原基线（1.4 节）

- 仅 `driver-playwright` + `driver-appium` 两条主链路。

### 2.3 目标基线（本确认稿）

| 层级 | 决策 |
|------|------|
| **默认** | Web → Playwright；移动 → Appium（不变） |
| **可选** | Web → Selenium（`payload.engine=selenium`） |
| **不采用** | Web/Appium/Selenium 三足鼎立默认；不替换 Playwright；不 fork Playwright |

---

## 3. 总体分层（更新 L2）

```
┌─────────────────────────────────────────────────────────────────┐
│ L6 应用：CI / 任务 JSON / 大模型 Agent（MCP Tools）              │
└────────────────────────────┬────────────────────────────────────┘
                             │ CommandEnvelope（统一信封）
┌────────────────────────────▼────────────────────────────────────┐
│ L5 业务 API：Locator / Action / Assertion / Artifact（语义层）   │
│     L1 语义命令：navigate, click, swipe, …                       │
│     L2 透传命令：invoke（Playwright=method, Appium/Selenium=http）│
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ L4 编排：TaskExecutor、重试、会话、风控、产物                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ L3 路由：Platform + Web Engine → 驱动插件                        │
│     web + engine(默认 playwright) → driver-playwright              │
│     web + engine(selenium)        → driver-selenium（可选）        │
│     android|ios|harmony           → driver-appium                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ L2 驱动：Playwright / Selenium(WebDriver) / Appium               │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ L1 基础设施：日志、配置、产物目录、依赖安装（playwright/appium/…） │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 平台 × 引擎矩阵

| platform | 默认 engine | 驱动插件 | 底层依赖 | 典型场景 |
|----------|-------------|----------|----------|----------|
| `web` | `playwright`（省略即默认） | `driver-playwright` | `playwright` | 现代 Web E2E、CDP 本机 Chrome、多 Tab、`invoke` method RPC |
| `web` | `selenium`（显式） | `driver-selenium` | `selenium-webdriver` + 各 browser driver | **系统 Firefox/Chrome**、Profile、WebDriver 资产复用 |
| `android` | — | `driver-appium` | Appium 3 + UIAutomator2 等 | 原生 App / 移动浏览器 |
| `ios` | — | `driver-appium` | Appium 3 + WDA 等 | 同上 |
| `harmony` | — | `driver-appium` | Appium 3 + harmony driver | 同上 |

**说明**：Appium 已使用 **WebDriver 协议族**，与 Selenium 同源，但 **不负责桌面 Web**；桌面 Web 的 Selenium 是 **独立可选插件**，不是第三条「默认」链路。

---

## 5. 统一命令模型（不变 + 扩展）

### 5.1 CommandEnvelope（`@ada/contracts`）

```ts
{
  requestId: string;
  sessionId: string;
  platform: "web" | "android" | "ios" | "harmony";
  command: CommandType;  // 含 invoke
  payload?: Record<string, unknown>;
}
```

### 5.2 Web 引擎选择（新增约定）

| 字段 | 位置 | 取值 | 默认 |
|------|------|------|------|
| `engine` | `payload.engine` 或 `payload.options.engine` | `playwright` \| `selenium` | `playwright` |

**会话绑定规则**：同一 `sessionId` 下首条命令决定的 `engine` + `sessionKey`（浏览器/ profile / capabilities）在会话生命周期内不得漂移；变更则关闭旧会话重建。

`sessionKey` 由 `@ada/driver-rpc` 的 `buildSessionKey` 扩展 Selenium 字段（`browserName`、`profile`、`seleniumUrl` 等）。

### 5.3 双层命令策略（L1 + L2）

| 层级 | 用途 | Web Playwright | Web Selenium | Mobile Appium |
|------|------|----------------|--------------|---------------|
| **L1** | AI / 任务常用 | `navigate`、`click`、`screenshot`… | 同名列（映射 WebDriver） | `click`、`swipe`… |
| **L2** | 全 API 兜底 | `invoke` + `mode:method` | `invoke` + `mode:http` | `invoke` + `mode:http`（已有） |

**不**为 Selenium 再增加一套 MCP 工具名；统一 `ada_execute` / `ada_invoke` / `ada_web_action`。

---

## 6. 关键架构变更：Web 引擎路由

### 6.1 问题

当前 `PluginHost`：**一个 platform 只能注册一个插件**。

```ts
// 现状：plugins.set("web", driver-playwright) 
// 无法再 register("web", driver-selenium)
```

### 6.2 推荐方案：`WebEngineRouter`（在 plugin-host 或 core-kernel）

```
PluginHost
├── plugins: Map<Platform, DriverPlugin>     // android, ios, harmony
└── webEngines: Map<WebEngine, DriverPlugin> // playwright | selenium
         │
         resolve(command):
           if platform !== web → plugins.get(platform)
           else → webEngines.get(parseEngine(payload)) ?? playwright
```

| 项 | 说明 |
|----|------|
| 注册 | `registerWebEngine(plugin)`，校验 `manifest.engine` 与 `platforms` 含 `web` |
| 默认 | 未装 `driver-selenium` 时，`engine=selenium` 返回明确错误 `WEB_ENGINE_SELENIUM_NOT_INSTALLED` |
| 移动 | `register(plugin)` 逻辑不变 |

**备选（不推荐）**：`driver-web` 门面插件内部委托——多一层间接，调试略差。

### 6.3 Feature Negotiation

`FeatureNegotiator.check(plugin, command)` 在 **解析后的具体插件** 上执行（playwright 或 selenium），行为与现网一致。

---

## 7. 驱动插件设计

### 7.1 driver-playwright（已有，维护）

| 项 | 内容 |
|----|------|
| manifest.engine | `playwright` |
| platforms | `["web"]` |
| invoke | `mode: method`；targets: page, context, browser, locator, playwright |
| 本机浏览器 | `cdpEndpoint`、`channel`、`userDataDir`、`launchOptions`（已实现） |

### 7.2 driver-selenium（新增，可选安装）

| 项 | 内容 |
|----|------|
| manifest.engine | `selenium` |
| platforms | `["web"]` |
| 依赖 | `selenium-webdriver`；运行时需本机 GeckoDriver/ChromeDriver 或 Grid |
| invoke | `mode: http` → WebDriver 路由（与 Appium custom 同族，复用 `@ada/driver-rpc`） |
| payload 扩展 | 见下表 |

**Selenium payload（建议）**

| 字段 | 说明 |
|------|------|
| `browserName` | `firefox` \| `chrome` \| `MicrosoftEdge` |
| `browserBinary` | 系统浏览器可执行文件路径 |
| `profile` / `userDataDir` | Firefox/Chrome 用户数据目录 |
| `seleniumServerUrl` | 可选，远程 Grid |
| `capabilities` | WebDriver 能力对象 |
| `mock` | 与现网一致，允许 mock 回退（非 `--require-real` 时） |

**L1 命令映射（P0 最小集）**

`navigate`, `click`, `type`, `screenshot`, `wait`, `back`, `reload`, `getText`, `assertVisible`, `assertText`, `invoke`

**不在 P0**：`newTab`/`switchTab` 等可先走 `invoke` 或二期补齐。

### 7.3 driver-appium（已有，不变）

| 项 | 内容 |
|----|------|
| platforms | android, ios, harmony |
| invoke | http（WebDriver 到 Appium Server） |
| 与 Selenium 关系 | 协议同族、**场景不重叠**（移动 vs 桌面 Web） |

---

## 8. 入口层与 MCP（不变结构，补充说明）

| 入口 | 职责 |
|------|------|
| `ada-agent` | `run --file=*.tasks.json`；`--require-real` |
| `ada-mcp` | Tools：`ada_execute`、`ada_invoke`、`ada_web_action`、`ada_mobile_action`… |
| `ada-gui` / `ada-web` | 调 `agent-core` |

**MCP 文档约定**

- 默认 Web 示例用 Playwright；
- 系统 Firefox 示例显式 `"engine": "selenium"` + `browserBinary` / `profile`；
- `ada_web_action` 的 payload 允许 `engine` 字段（schema 补充）。

**风控**：`invoke`、`custom` 继续 `riskApproved`；Selenium 无额外放宽。

---

## 9. Monorepo 包结构（目标）

```text
packages/
  contracts/          # + EngineType, payload.engine 文档化
  driver-rpc/         # 已有；扩展 buildSessionKey(selenium)
  plugin-sdk/
  plugin-host/        # + WebEngineRouter
  core-kernel/        # TaskExecutor 使用 resolve(command) 新逻辑
  core-runtime/
  agent-core/
  transport-*/

plugins/
  driver-playwright/  # 已有
  driver-appium/      # 已有
  driver-selenium/    # 新增（可选 workspace 依赖）

apps/
  ada-agent/          # 注册 webEngines；install-deps 增加 selenium/geckodriver 提示
  ada-mcp-server/
```

**依赖策略**

- `ada-agent` / `ada-mcp`：**硬依赖** playwright + appium；**可选依赖** selenium（未安装时仅 `engine=selenium` 失败）。
- 或 selenium 始终 workspace 依赖，仅运行时检测 driver 可执行文件。

---

## 10. 能力协商与错误码

| 错误码 | 场景 |
|--------|------|
| `DRIVER_CAPABILITY_UNSUPPORTED` | 命令不在该引擎 manifest 中 |
| `WEB_ENGINE_UNKNOWN` | `engine` 非法 |
| `WEB_ENGINE_SELENIUM_NOT_INSTALLED` | 未注册 selenium 插件 |
| `SELENIUM_SESSION_FAILED` | WebDriver 建会话失败 |
| `INVOKE_*` | 与现网 playwright/appium 对齐 |

---

## 11. 测试与发布

| 类型 | 内容 |
|------|------|
| conformance | `driver-selenium` mock + 非法 payload；与 playwright 并列 |
| integration | 本地 Firefox（GeckoDriver）+ example.com 冒烟 |
| 插件 bundle | `build/plugins/driver-selenium.cjs`；**同步 release/plugins**，避免加载旧 bundle |
| 文档 | 本确认稿定稿后合并进 `ADA-架构设计方案.md` 1.4/7 章 |

---

## 12. 实施阶段（确认后开发）

| 阶段 | 交付 | 验收 |
|------|------|------|
| **P0** | `contracts` engine 类型；`plugin-host` WebEngineRouter；`driver-selenium` 最小实现（navigate/click/screenshot/invoke） | `engine=selenium` 任务 JSON 跑通 Firefox；默认 playwright 回归不退化 |
| **P1** | MCP schema `engine`；`install-deps` 文档；`tasks/selenium-firefox.tasks.json` 示例 | MCP `ada_invoke` + `ada_web_action` 双引擎文档示例 |
| **P2** | L1 命令补齐；Grid；与 `userDataDir` 导入互通 | conformance + require-real 冒烟 |
| **不做（首期）** | Selenium 替代默认 Web；三引擎自动回退；桌面 Appium | — |

---

## 13. 待确认项（请逐项确认）

1. **Web 路由方案**：是否同意 `PluginHost.webEngines` + `payload.engine`（默认 `playwright`）？  
2. **Selenium 范围**：P0 是否仅 **Firefox + GeckoDriver**，还是同时 **Chrome + ChromeDriver**？  
3. **可选依赖**：未构建 `driver-selenium` 时，是否接受 `engine=selenium` 明确报错（不静默回退 playwright）？  
4. **插件加载**：是否继续 `release/plugins/*.cjs` 优先？（是则每次发布必须 rebundle 全部驱动。）  
5. **MCP**：是否保持工具名不变，仅扩展 payload（推荐）？  
6. **架构文档**：确认后是否将本文合并进 `ADA-架构设计方案.md` 并升版 1.1？

---

## 14. 结论摘要

| 问题 | 结论 |
|------|------|
| 底层驱动组合 | **Playwright（Web 默认）+ Appium（移动）+ Selenium（Web 可选）** |
| 是否替换 Playwright | **否** |
| 架构核心改动 | **Web 引擎路由** + 新插件 `driver-selenium` |
| 与 Appium 关系 | 并列；移动 WebDriver 仍走 Appium，桌面 WebDriver 走 Selenium |
| 开发门槛 | 先确认第 13 节，再按 P0→P1 实施 |

确认回复示例：`确认 1-6，P0 仅 Firefox`。随后可进入 `driver-selenium` 与 `plugin-host` 开发。
