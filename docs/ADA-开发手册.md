# ADA 开发手册（第一阶段）

本手册用于指导 ADA monorepo 本地研发，面向开发、测试与运维联调同学。核心能力统一在 `packages/agent-core`，四入口（`ada-agent` / `ada-mcp` / `ada-gui` / `ada-web`）仅做协议与交互适配。

## 文档边界说明

- 本文档只覆盖研发流程、代码规范、测试门禁与本地联调。
- 线上部署与运维操作请看 `ADA-部署手册.md`。
- MCP 接口定义与调用示例请看 `ADA-MCP-接入手册.md`。
- 架构原理与模块边界请看 `ADA-架构设计方案.md`。

---

## 1. 目标与范围

当前阶段目标：

- 四入口可构建、可验收（`npm run build:exe`、`npm run test:entrypoints`）
- 驱动基线：`driver-playwright`（Web 默认）+ `driver-selenium`（Web 可选）+ `driver-appium`（Android/iOS/HarmonyOS NEXT）+ `driver-harmony`（鸿蒙 hypium）
- 支持 CLI/GUI 首启配置与任务队列（`inbox -> processed/failed`）
- MCP 以 `@ada-mcp/launcher` + `@ada-mcp/mcp-server` 同号发布（见接入手册）

非目标：

- 不实现 `ada-control`（延后二阶段）

---

## 2. 仓库结构

```text
ada/
  apps/
    ada-agent/              # CLI 入口
    ada-mcp-server/         # MCP 服务（stdio / 远程 HTTP）
    ada-mcp-launcher/       # npm：@ada-mcp/launcher
    ada-gui/                # Tauri 桌面 GUI
    ada-web/                # Web 控制台（pkg 入口）
  packages/
    agent-core/             # 统一能力面（health/doctor/install-deps/setup/start/run）
    contracts/              # 统一协议与类型
    core-kernel/            # 命令执行内核
    core-runtime/           # 日志、配置根目录、deepMerge
    plugin-sdk/             # 插件接口
    plugin-host/            # 插件注册与路由
    driver-rpc/             # 驱动 RPC 与 engine 解析
    download-probe/         # registry / CDN 测速（monorepo；launcher 已内联）
    transport-http/         # HTTP 传输适配
    transport-stream/       # 长连接传输适配
    native-drivers/         # 原生驱动桥接
    vision-contracts/       # 图形交互协议（骨架）
    graphics-safety/        # 图形交互安全策略（骨架）
    graphics-kernel/        # 图形编排内核（骨架）
  plugins/
    driver-playwright/      # Web（Playwright）
    driver-selenium/        # Web（Selenium，engine=selenium）
    driver-appium/          # Android / iOS / Harmony（Appium）
    driver-harmony/         # Harmony（hypium-driver + hdc）
  tools/                    # 内置工具（如 hdc.exe）
  config/
    default.yaml
  tasks/
    demo.tasks.json
    web-real.tasks.json
    appium-probe.tasks.json
    inbox/processed/failed   # 队列运行时目录
  docs/                     # 见 docs/README.md
```

---

## 3. 核心模块职责

- `packages/agent-core`
  - 对外统一能力面：`health`、`doctor`、`install-deps`、`setup`、`start`、`run` 等
  - 被 `ada-agent`、`ada-mcp-server`、`ada-gui`、`ada-web` 复用，避免入口层重复实现

- `apps/ada-agent/src/main.ts`
  - CLI 命令路由（`start/setup/run/health/plugins/install-deps/reset`）
  - 启动前依赖安装、鉴权检查、运行模式选择

- `apps/ada-mcp-server/src/main.ts`
  - MCP stdio 工具注册（21 个 `ada_*` 工具）与远程 HTTP 可选模式

- `apps/ada-gui` / `apps/ada-web`
  - 图形 / Web 交互；运维动作应走 `agent-core` 能力面

- `apps/ada-agent/src/dependency-installer.ts`（及 `bootstrap-deps.ts`）
  - 自动检测并安装 Playwright、Selenium、Appium、Harmony 相关依赖
  - 安装 Playwright 浏览器；Appium driver（`uiautomator2` / `xcuitest` / `harmonyos`）
  - registry / CDN 测速见 `packages/download-probe`（launcher 发布包内已内联）

- `apps/ada-agent/src/queue-runner.ts`
  - 队列任务消费
  - 失败重试与失败元数据写入
  - `--watch` 模式下轮询执行
  - 已支持透传 runtime transport（队列任务可走远程执行链路）

- `packages/contracts`
  - `CommandEnvelope`、`CommandResult`、`PluginManifest` 等统一模型

- `packages/plugin-host`
  - 按 platform 解析插件
  - 管理插件 manifest

- `packages/transport-http`
  - HTTP 请求-响应传输抽象
  - `connect/close/sendRequest/health` 接口实现
  - 在 `ada-agent` 中作为远程执行兜底通道（`transport.mode=http` 或 `auto` 回退）

- `packages/transport-stream`
  - 长连接传输抽象（WebSocket）
  - 支持 `requestId` 关联响应与超时控制
  - 在 `ada-agent` 中作为远程执行首选通道（`transport.mode=stream` 或 `auto` 首选）

- `apps/ada-agent/src/transport-client.ts`
  - `TransportSelector`（`stream/http/auto`）
  - 统一将 `CommandEnvelope` 透传为远程 `ada_execute` 请求（传输层 `action` 字段）
  - 将远端返回规范化为 `CommandResult`，并在 `auto` 模式下实现 `stream -> http` 回退

- `packages/core-runtime`
  - 提供通用 `resolveWorkspaceRoot`、`deepMerge` 与 JSON logger
  - 已被 `ada-agent` 与 `ada-mcp-server` 复用，避免重复实现

---

## 4. 本地开发流程

## 4.1 初始化

```bash
npm install
```

## 4.2 类型检查

```bash
npm run typecheck
```

## 4.2.1 打包可执行程序

```bash
npm run build:exe
```

说明：首次执行会下载 `pkg` 的 Node 基础二进制，耗时可能较长。

打包完成后产物位于 `release/`（Windows 示例）：

- `ada-agent-win.exe`、`ada-mcp-win.exe`、`ada-web-win.exe`
- `ada-gui-win.exe`（Tauri，仅 Windows 构建时复制）
- `config/`、`tasks/`、`plugins/`（驱动 bundle）
- `docs/ADA-GUI-操作手册.md`（用户手册）
- `tools/`（若仓库含 `hdc` 等，供 Harmony 使用）

macOS / Linux 下 agent / mcp / web 为 pkg 输出的无后缀可执行文件（名称与入口 bundle 一致）。

## 4.3 快速验证

```bash
npm run demo
npm run health
npm run plugins
npm run test:conformance
```

真实执行门禁验证（高优先推荐）：

```bash
npm run run:web-real:strict
```

说明：该命令会在出现 mock 回退时直接失败，防止误把“降级执行”当成通过。

## 4.4 队列模式验证

```bash
npm exec tsx -- apps/ada-agent/src/main.ts start --once --local-dev --skip-deps
```

说明：

- `--local-dev`：本地开发跳过鉴权
- `--skip-deps`：跳过启动自动安装

---

## 5. 运行命令规范

- `start --watch`：生产常驻模式
- `start --once`：单次处理模式
- `run --file=...`：直接执行任务文件
- `setup --mode=auto|cli|gui`：首启配置
  - `gui` 模式支持“原生引导程序优先，失败回退 Web”
- `install-deps`：手动安装驱动依赖（支持 `--only=playwright|mobile|android|ios|harmony|appium|drivers|all`）
- `health`：查看运行与依赖健康状态

---

## 6. 配置规范

配置文件：`config/default.yaml`

重点配置项：

- `bootstrapUI.mode`：`auto | cli | gui`
- `bootstrapUI.native.enabled`：是否启用原生引导程序
- `bootstrapUI.native.command`：原生引导程序命令（可执行文件）
- `bootstrapUI.native.args`：原生引导程序参数
- `bootstrapUI.native.timeoutMs`：原生引导程序超时时间
- `bootstrapUI.native.fallbackToWeb`：原生引导失败时是否回退 Web 引导
- `dependencies.autoInstallOnStart`
- `dependencies.playwrightBrowser`
- `dependencies.playwrightInstallTargets`
- `appium.requiredDrivers`（默认包含 `uiautomator2`、`xcuitest`、`harmonyos`）
- `monitoring.enabled / platforms / sampleEvery / outputDir`
- `monitoring.resolution.maxWidth / maxHeight / keepAspectRatio`
- `queue.inboxDir / processedDir / failedDir`
- `queue.pollIntervalMs`
- `queue.maxFileRetryAttempts`

原则：

- 新增配置必须在 `types.ts` 和 `config.ts` 同步默认值
- 配置变更要向后兼容，避免破坏已有部署

---

## 7. 开发约束与设计原则

- 业务层不得直接依赖具体驱动实现
- 统一通过 `contracts` 传递命令与结果
- 插件异常必须转换为标准错误，不向上抛原始引擎细节
- 日志使用结构化 JSON（便于后续接可观测平台）

---

## 8. 驱动开发规范

## 8.1 Playwright 插件

- 优先实现：`click/type/screenshot/assertVisible`
- 先保证语义定位（role/text/testId）一致性
- 错误统一映射 ADA 错误语义

推荐任务 payload 示例（真实执行）：

```json
[
  {
    "requestId": "web-real-001",
    "sessionId": "session-web-real",
    "platform": "web",
    "command": "click",
    "payload": {
      "url": "https://example.com",
      "locator": {
        "text": "More information"
      }
    }
  },
  {
    "requestId": "web-real-002",
    "sessionId": "session-web-real",
    "platform": "web",
    "command": "screenshot",
    "payload": {
      "url": "https://example.com"
    }
  }
]
```

说明：

- `url` 存在时会先导航再执行动作
- `screenshot` 产物默认输出到 `artifacts/<requestId>.png`

## 8.2 Appium 插件

- 统一 Android/iOS/Harmony 会话生命周期
- 动作能力保持与 Web 插件命令面一致
- 保留坐标动作为兜底，不作为主路径
- 当平台为 `harmony` 且未显式传入 capabilities 时，默认使用：
  - `platformName: harmonyos`
  - `appium:automationName: harmonyos`

## 8.3 Feature Negotiation（能力协商）

- `core-kernel` 在执行命令前会校验插件 manifest 的能力声明。
- 若命令未声明（例如插件不支持 `navigate`），直接返回 `DRIVER_CAPABILITY_UNSUPPORTED`。
- 该机制用于把“平台差异失败”前置到内核层，减少底层驱动不确定性。

---

## 9. 测试与验收

最低验收要求：

- `npm run typecheck` 全绿
- demo 与任务队列模式可运行
- 失败任务可进入 `tasks/failed` 并生成 `.error.json`
- `health/plugins` 输出正确
- `test:conformance` 通过（驱动契约一致性）

建议测试层次：

- 单元测试：配置、队列、命令解析
- 集成测试：插件路由与任务执行
- 端到端：真实 Playwright/Appium 执行链（后续阶段）

可执行冒烟命令（当前可直接用）：

```bash
npm run test:e2e:smoke
npm run test:e2e:smoke:strict
npm run test:e2e:smoke:full
```

说明：

- `test:e2e:smoke`：Web 真实链路 + Appium probe
- `test:e2e:smoke:strict`：Web 开启 `--require-real` + Appium probe
- `test:e2e:smoke:full`：同 `test:e2e:smoke:strict`（保留 npm 别名）

任务样例：`tasks/demo.tasks.json`、`web-real.tasks.json`、`appium-probe.tasks.json`。鸿蒙专项联调见 `plugins/driver-harmony` 的 `smoke:real`。

---

## 10. 文档同步要求

代码改动后必须同步文档（索引见 `docs/README.md`）：

- 架构变更：`ADA-架构设计方案.md`
- 部署命令或流程变更：`ADA-部署手册.md`
- MCP 工具 / Host 配置 / 镜像变量：`ADA-MCP-接入手册.md`
- 开发流程 / 测试门禁：`ADA-开发手册.md`（本文）
- Windows 发布包操作：`ADA-GUI-操作手册.md`
- Playwright 迁移映射：`Playwright-ADA-兼容映射.md`
- npm 发布 `@ada-mcp/*`：`scripts/README.md`

---

## 11. 常见开发问题

- **问题：启动进入 setup 阻塞联调**
  - 使用 `--local-dev` 跳过鉴权

- **问题：依赖下载慢或失败**
  - 使用 `install-deps` 手动安装
  - 必要时 `--skip-deps` 先完成核心联调

- **问题：任务文件未被消费**
  - 检查 `queue.inboxDir`
  - 检查 JSON 格式是否为命令数组
  - 查看 `failed` 与 `.error.json`
