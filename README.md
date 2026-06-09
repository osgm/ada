# ADA — AllDriverAgent

**一套协议、多端驱动、AI 即用**：用统一命令模型驱动 Web（Playwright）与移动端（Android / iOS / HarmonyOS NEXT），并通过 **MCP** 直接接入 Cursor、Claude Desktop 等 AI 宿主。

*One protocol, multi-platform drivers, AI-ready — unified automation for web and mobile via MCP.*

> 不用自建 Appium / Selenium 中心化 Server；一条 `CommandEnvelope` 贯通 CLI、Web 控制台、GUI 与 21 个 MCP 工具。

---

## 核心优势

ADA 面向 **AI 原生自动化** 与 **跨端工程落地** 设计：上层统一协议与工具面，下层以插件挂载各平台驱动，脚本与 MCP 共用同一套语义。

| 维度 | 优势 | 说明 |
|------|------|------|
| **架构** | 结构化分层、组件化驱动 | `contracts` → `agent-core` → `plugin-host` → `driver-*` 清晰边界；新端能力以**驱动插件**接入，不污染核心协议 |
| **AI 集成** | 适配大模型 **本地 MCP** | Cursor、Claude Desktop 等通过 stdio 启动 `@ada-mcp/launcher`，工具即 `ada_web_action` / `ada_mobile_action` 等，零自建 Server |
| **AI 集成** | 支持大模型 **在线 MCP** | MCP Server 可 **HTTP 远程部署**，多客户端共用同一执行面，适合团队集中管控与 CI |
| **部署** | 全平台运行 | Windows / macOS / Linux；CLI、Web 控制台、Tauri GUI、npm 包与可执行文件多种交付形态 |
| **多端** | Web + Android + 鸿蒙 | Web 基于 Playwright；Android 为 adb + UiAutomator2；鸿蒙为 hdc + hypium；iOS 支持 WDA（见能力一览） |
| **运维** | 驱动依赖 **自动安装** | `ada_install_deps` / Launcher `--install-deps`：Playwright 浏览器、移动探针与可选 Server 引导，镜像测速选源 |
| **脚本** | 语法简单、三端一致 | `open(browser \| device)` + `find` / `by` 流利 API；详见 [`scripts/examples/README.md`](scripts/examples/README.md) |
| **可靠性** | 增强自适应成功率 | 操作级 **auto-wait**、**smart-wait**（`launch_settled` / `ui_stable`）、Web 弹窗 pre-wait + login2025 兜底、移动 **recipe**（fillSearch 跳转检测） |
| **性能** | 更快执行 | 会话级预检缓存、UI 层级缓存、**goto / fillSearch 条件就绪**（非固定长 sleep）、紧凑 MCP 回包 |
| **成本** | 更少 **Token 消耗** | 分层工具（常用动作走高层 API）、健康检查去重、extract 精简字段，减少大模型上下文体积 |
| **可观测** | 实时视频流监控 | **规划中**：便于远程目视真机/浏览器执行过程（接口预留，持续完善） |
| **管控** | 长连接远程管理平台 | **规划中**：设备与会话统一纳管、策略下发与审计（管理平台接入预留） |

**此外**

- **一条协议走天下**：`CommandEnvelope` 贯通 CLI、任务 JSON、MCP 与示例脚本，避免 Web / 移动各写一套底层调用。  
- **无需 Appium Hub**：直连 adb、WDA、hypium 等原生栈，插件进程内加载，环境更轻。  
- **底层仍可透传**：`ada_invoke` 在需要时调用 Playwright / WDA / UIA2 官方能力，兼顾封装与扩展。

---

## 为什么选择 ADA

| 痛点 | ADA 的做法 |
|------|------------|
| Web + 移动各写一套脚本 | 统一 `click` / `type` / `swipe` / `invoke` 语义，平台差异收敛在驱动插件 |
| AI 只能「写代码」不能「点界面」 | **MCP 一等公民**：`ada_web_action` / `ada_mobile_action` / `ada_invoke` 开箱即用 |
| Appium 环境重、Server 难维护 | **直连原生栈**：adb+UIA2、WDA HTTP、Harmony hypium+hdc，插件进程内加载 |
| 依赖安装慢、镜像不稳定 | Launcher **自动测速选 registry** + Playwright CDN 探测 |
| 真机不稳定 | 会话失效 **自动重建并重试**（WDA / UiAutomator2） |

**适合谁**

- 想让 AI **直接操作浏览器和真机** 的产品 / 测试 / 运维团队  
- 需要 **跨端回归** 与任务编排（`.tasks.json`）的工程师  
- 希望 **自研驱动、插件化扩展** 的平台组  

---

## 60 秒接入 MCP（推荐）

在 Cursor / Claude Desktop 等 MCP Host 的配置中加入：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "pnpm",
      "args": ["dlx", "@ada-mcp/launcher@0.1.57", "--install-deps=playwright"]
    }
  }
}
```

Windows 若无 `pnpm`，可改用：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": ["-y", "@ada-mcp/launcher@0.1.57", "--install-deps=playwright"]
    }
  }
}
```

重启 Host 后，在对话中让 AI 调用 **`ada_health`** 探活，再使用 **`ada_web_action`**（网页）或 **`ada_mobile_action`**（移动）。

| npm 包 | 作用 |
|--------|------|
| [`@ada-mcp/launcher`](https://www.npmjs.com/package/@ada-mcp/launcher) | 零依赖启动器：测速 → 拉取 mcp-server |
| [`@ada-mcp/mcp-server`](https://www.npmjs.com/package/@ada-mcp/mcp-server) | 21 个 MCP 工具 + 驱动插件 bundle |

更多参数、远程 HTTP、风险审批见 **[MCP 接入手册](docs/ADA-MCP-接入手册.md)**。

---

## 能力一览

```text
┌─────────────────────────────────────────────────────────┐
│  入口：CLI · MCP · Web 控制台 · Tauri GUI · 示例脚本      │
├─────────────────────────────────────────────────────────┤
│  流利 API：ada-fluent / ada_client + driver-rpc           │
│    smart-wait · mobile-recipes · fill-search · popups     │
├─────────────────────────────────────────────────────────┤
│  agent-core / ada-agent / ada-mcp-server（executor）      │
├─────────────────────────────────────────────────────────┤
│  驱动插件                                                │
│    Web      → Playwright（默认，支持 CDP attach）          │
│    Android  → adb 语义 + 可选 UiAutomator2 HTTP          │
│    iOS      → WebDriverAgent HTTP                        │
│    Harmony  → hypium-driver + hdc                        │
└─────────────────────────────────────────────────────────┘
```

| 平台 | 驱动 | 典型能力 |
|------|------|----------|
| Web | Playwright | navigate、click、截图、多 Tab、CDP 连接本地浏览器 |
| Android | adb + UIA2 | 点击/滑动/启停 App；`invoke` adb method 或 UIA2 HTTP 透传 |
| iOS | WDA | 元素操作、坐标点击、WDA HTTP `invoke` |
| HarmonyOS NEXT | hypium + hdc | 语义手势 + driver `invoke` |

**底层透传**：`ada_invoke` 支持 Playwright `method` 模式，以及 Android/iOS 的 **HTTP 模式**（WDA / UiAutomator2 端点），适合 AI 调用官方未封装的 API。

---

## 四种使用方式

| 入口 | 场景 | 快速命令 |
|------|------|----------|
| **MCP** | AI 宿主内自动化 | 见上文 Host 配置 |
| **CLI** | 脚本、CI、任务文件 | `npm run run:tasks` |
| **Web 控制台** | 浏览器里配置与试运行 | `npm run dev` → 打开控制台 |
| **GUI** | Windows 桌面原生壳 | `npm run gui:dev` / 构建 `ada-gui-win.exe` |

---

## 从源码运行（开发者）

### 环境

- **Node.js ≥ 22**，npm ≥ 10  
- 移动（按需）：`adb`（Android）、WDA（iOS）、`hdc`（Harmony）  
- Android UIA2 可选：OpenJDK 11  

### 安装与冒烟

```bash
git clone <your-repo-url> ada && cd ada
npm install
npm run typecheck
npm run test:e2e:smoke          # demo mock，无需真机/浏览器
npm run doctor                  # 按 config 检查 Playwright / adb / WDA 等
npm run plugins                 # 应看到 4 个驱动插件
```

### 常用命令

```bash
# 任务编排
npm run run:tasks                              # demo：Web + Android mock
npm run run -- --file=tasks/web-real.tasks.json --require-real   # 真实浏览器

# 依赖与环境
npm run install:deps -- --only=playwright      # Playwright + 浏览器
npm run install:deps -- --only=mobile          # 移动运行时探针

# MCP 本地开发
npm run mcp:dev

# 质量门禁
npm run test                    # unit + mcp:unit + conformance
npm run test:conformance
npm run test:e2e:smoke          # demo mock，无需真机
npm run test:e2e:smoke:mobile  # 含 Android/iOS invoke mock
npm run test:e2e:smoke:full     # Web strict + mobile mock

# 打包可执行文件（release/）
npm run build:exe
```

### 京东 E2E 学习示例（流利 API）

扁平脚本，本地与 MCP 业务步骤一致；详见 [`scripts/examples/README.md`](scripts/examples/README.md) 与根目录 [`架构设计图`](架构设计图)。

| 平台 | 本地 Node | 本地 Python | MCP Node | MCP Python |
|------|-----------|-------------|----------|------------|
| Web（4 场景） | `test:jd-web` | `test:jd-web:py` | `test:jd-web:mcp` | `test:jd-web:mcp:py` |
| Android（10 步） | `test:jd-android` | `test:jd-android:py` | `test:jd-android:mcp` | `test:jd-android:mcp:py` |
| 鸿蒙（10 步） | `test:jd-harmony` | `test:jd-harmony:py` | `test:jd-harmony:mcp` | `test:jd-harmony:mcp:py` |
| iOS（MCP） | — | — | `test:jd-ios:mcp` | `test:jd-ios:mcp:py` |

```bash
npm run test:jd-web              # 示例：Web 四场景（Chrome + CDP）
npm run test:jd-android          # 需真机 + 京东 App
npm run test:jd-harmony          # 需 hdc + 鸿蒙真机
```

**Smart-Wait（框架内置，示例无需改代码）**

- `phone.goto(appId)` / `phone.goto(appId, 2500)`：`launchApp` 后以 **launch_settled** 等待 UI 稳定；未传数字时上限 **8s**（全平台），传数字则为上限并可提前返回。
- `phone.fillSearch(...)`：recipe 内跳转检测 + 收紧默认 settle，减少 tap/fill 重复等待。
- `page.dismissPopups(...)`：dismiss 前轮询 Web 弹窗遮挡（含京东 login2025），再 DOM 关弹窗 / force-hide。

可选环境变量：`ADA_WAIT_UNTIL=launch_settled|ui_stable|timeout`，`ADA_WAIT_MAX_MS`，`ADA_WAIT_POLL_MS`。

### 移动真机（可选）

```powershell
# Android adb invoke
npm run test:e2e:smoke:mobile:strict

# 自动引导 UiAutomator2 Server（需真机 + 网络下载 APK）
$env:ADA_ANDROID_UIA2_BOOTSTRAP="true"
npm run install:deps -- --only=android

# macOS 自动拉起 WDA（需 Xcode）
$env:ADA_IOS_WDA_BOOTSTRAP="true"
npm run install:deps -- --only=ios
```

**进程恢复**：HTTP 调用失败（连接断开 / 503 / invalid session）时，驱动会先尝试 **bootstrap 重启 Server 进程**（需对应 `ADA_*_BOOTSTRAP=true`），再重建 WebDriver 会话；30s 内不重复重启。

环境变量速查：`ADA_WDA_SERVER_URL`、`ADA_ANDROID_UIA2_SERVER_URL`、`ADA_ANDROID_DEVICE_SN`；Web CDP：`ADA_PLAYWRIGHT_CDP_AUTO_LAUNCH`、`ADA_PLAYWRIGHT_CDP_PORT`（9222）；Smart-Wait：`ADA_WAIT_UNTIL`、`ADA_WAIT_MAX_MS`、`ADA_WAIT_POLL_MS`；性能：`ADA_ANDROID_UIA2_AUTO_HTTP`、`ADA_ANDROID_HIERARCHY_CACHE_MS`。详见 [MCP 接入手册 §3.1](docs/ADA-MCP-接入手册.md)。

---

## MCP 工具速查（21 个）

| 优先使用 | 工具 | 说明 |
|----------|------|------|
| ⭐ | `ada_health` | 会话首选：探活 + 依赖就绪 |
| ⭐ | `ada_web_action` | 网页 navigate / click / type / screenshot… |
| ⭐ | `ada_mobile_action` | 移动端标准手势与 App 启停 |
| ⭐ | `ada_invoke` | 底层透传（Playwright / WDA / UIA2），需 `riskApproved` |
| | `ada_install_deps` | 安装 Playwright 浏览器或移动工具链 |
| | `ada_run_task_file` | 运行 `tasks/*.tasks.json` 场景 |
| | `ada_diagnostics` / `ada_doctor` | 深度诊断 |

完整列表与 JSON 示例见 **[MCP 接入手册](docs/ADA-MCP-接入手册.md)**。

---

## 仓库结构（Monorepo）

```text
ada/
├── apps/
│   ├── ada-agent/          # CLI + Web 控制台 + 插件注册
│   ├── ada-mcp-server/     # MCP 服务（发布 @ada-mcp/mcp-server）
│   ├── ada-mcp-launcher/   # 启动器（发布 @ada-mcp/launcher）
│   └── ada-gui/            # Tauri 桌面
├── packages/
│   ├── contracts/          # CommandEnvelope 等统一协议
│   ├── agent-core/         # 对外稳定 API
│   ├── driver-rpc/         # smart-wait · mobile-recipes · fill-search · normalize
│   ├── mobile-ui/          # UI dump 解析与启发式
│   ├── install-deps/       # 依赖安装与 InstallSummary
│   ├── runtime-probe/      # adb / WDA / UIA2 探针
│   └── plugin-host/        # 驱动插件加载
├── plugins/
│   ├── driver-playwright/
│   ├── driver-android/
│   ├── driver-ios/
│   └── driver-harmony/
├── scripts/
│   ├── lib/                # ada-fluent · popups · smart-wait-launch · ada.mjs
│   └── examples/           # 京东 E2E（Node / Python · 本地 / MCP）
├── test/                   # 单元 / 契约测试（npm test）
├── tasks/                  # 可复用任务场景 JSON
├── 架构设计图               # 当前分层与数据流（Mermaid）
└── docs/                   # 架构 / 部署 / 开发 / MCP 手册
```

---

## 文档导航

| 文档 | 读者 |
|------|------|
| [MCP 接入手册](docs/ADA-MCP-接入手册.md) | **AI 用户 / 集成方**（首选） |
| [部署手册](docs/ADA-部署手册.md) | 运维、环境搭建 |
| [架构设计方案](docs/ADA-架构设计方案.md) | 平台组、扩展驱动 |
| [架构设计图](架构设计图) | **当前分层 / Smart-Wait / E2E 矩阵**（速览） |
| [开发手册](docs/ADA-开发手册.md) | 贡献者、测试门禁 |
| [GUI 操作手册](docs/ADA-GUI-操作手册.md) | 桌面 GUI |
| [Playwright 兼容映射](docs/Playwright-ADA-兼容映射.md) | Web 能力对照 |
| [npm 发布流程](scripts/README.md) | 维护者 |

---

## 参与与推广

- **Star & Fork**：帮助更多 AI 与测试同学发现 ADA  
- **Issue / PR**：驱动插件、任务样例、文档翻译均欢迎  
- **场景分享**：把你用 `ada_run_task_file` 或 MCP 跑通的流程写成 `tasks/*.tasks.json` 提 PR  

内部协作请先读 [开发手册](docs/ADA-开发手册.md) 中的 conformance 与 e2e 门禁。

---

## 开源协议与版权

本项目采用 **[Apache License 2.0](LICENSE)** 开源。

- **版权所有**：**Kalami（卡拉米）** — Copyright 2026 Kalami (卡拉米)  
- **归属说明**：详见仓库根目录 [NOTICE](NOTICE)  
- **npm 发布包**：`@ada-mcp/mcp-server`、`@ada-mcp/launcher` 随包附带 `LICENSE` 与 `NOTICE`

使用、修改与再分发请遵守 Apache 2.0 条款；保留版权声明与 NOTICE 中的归属信息。

---

## 版本说明

- 本仓库 monorepo 版本：`0.1.0`（开发态）  
- npm 发布版本以 `@ada-mcp/launcher` / `@ada-mcp/mcp-server` 的 `package.json` 为准（当前示例 **`0.1.57`**，发布前请 `npm run mcp:check:versions` 核对）

**ADA** = **A**ll**D**river**A**gent — 让自动化能力像 API 一样被 AI 调用。
