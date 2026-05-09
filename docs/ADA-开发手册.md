# ADA 开发手册（第一阶段）

本手册用于指导 `ada-agent` 第一阶段研发，面向开发、测试与运维联调同学。

## 文档边界说明

- 本文档只覆盖研发流程、代码规范、测试门禁与本地联调。
- 线上部署与运维操作请看 `ADA-部署手册.md`。
- MCP 接口定义与调用示例请看 `ADA-MCP-接入手册.md`。
- 架构原理与模块边界请看 `ADA-架构设计方案.md`。

---

## 1. 目标与范围

第一阶段目标：

- 交付可执行的 `ada-agent`
- 驱动基线：`driver-playwright`（Web）+ `driver-appium`（Android/iOS/HarmonyOS NEXT）
- 支持 CLI/GUI 首启配置
- 支持任务队列执行（`inbox -> processed/failed`）

非目标：

- 不实现 `ada-control`
- 不实现完整桌面内嵌 GUI（当前 GUI 为 setup 引导页）

---

## 2. 仓库结构

```text
ada/
  apps/
    ada-agent/              # 可执行入口
    ada-mcp-server/         # MCP服务入口（stdio）
  packages/
    contracts/              # 统一协议与类型
    core-kernel/            # 执行内核
    core-runtime/           # 运行时通用能力（日志、配置根目录解析、通用merge）
    plugin-sdk/             # 插件接口
    plugin-host/            # 插件注册与路由
    transport-http/         # HTTP 传输适配
    transport-stream/       # 长连接传输适配
    vision-contracts/       # 图形交互协议（第一阶段最小骨架）
    graphics-safety/        # 图形交互安全策略（第一阶段最小骨架）
    graphics-kernel/        # 图形编排内核（第一阶段最小骨架）
  plugins/
    driver-playwright/      # Web 驱动插件
    driver-appium/          # Android/iOS/HarmonyOS NEXT 驱动插件
  config/
    default.yaml            # 默认配置
  tasks/
    inbox/processed/failed  # 队列目录
  docs/
    ADA-架构设计方案.md
    ADA-部署手册.md
    ADA-MCP-接入手册.md
```

---

## 3. 核心模块职责

- `apps/ada-agent/src/main.ts`
  - 命令路由（`start/setup/run/health/plugins/install-deps/reset`）
  - 启动前依赖安装、鉴权检查、运行模式选择

- `apps/ada-agent/src/dependency-installer.ts`
  - 自动检测并安装 `playwright`、`appium`
  - 安装 Playwright 浏览器
  - 安装后执行 Playwright/Appium 基础自检（含 `uiautomator2`/`xcuitest`/`harmonyos` 驱动）

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

打包完成后产物位于：

- `release/ada-agent-win-x64.exe`
- `release/ada-agent-macos-x64`
- `release/ada-agent-linux-x64`
- `release/config`
- `release/tasks`
- `release/docs/ADA-部署手册.md`

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
- `test:e2e:smoke:strict`：Web 开启 `--require-real`
- `test:e2e:smoke:full`：Web + Appium 真实链路均开启 `--require-real`

Harmony 便捷联调命令（新增）：

```bash
npm run run:appium-harmony-probe
npm run run:appium-harmony-real
```

说明：

- `run:appium-harmony-probe`：仅验证 Appium + harmony driver 链路探活
- `run:appium-harmony-real`：执行 Harmony 真实点击/截图/滑动样例

原生引导联调辅助命令：

```bash
npm run bootstrap:native:mock
```

说明：

- 该命令输出符合 `bootstrapUI.native` 协议的 JSON，可用于本地联调
- 可通过环境变量控制输出，例如：
  - `ADA_BOOTSTRAP_FAIL=1`：模拟原生引导失败
  - `ADA_BOOTSTRAP_SERVER_URL` / `ADA_BOOTSTRAP_TENANT` / `ADA_BOOTSTRAP_ENV`

---

## 10. 文档同步要求

代码改动后必须同步文档：

- 架构变更：更新 `ADA-架构设计方案.md`
- 部署命令或流程变更：更新 `ADA-部署手册.md`
- 开发流程/规范变更：更新 `ADA-开发手册.md`

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
