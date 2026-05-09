# AllDriverAgent（ADA）架构设计方案

**版本**：1.0  
**状态**：草案  
**适用范围**：Web、Android、iOS、macOS、Linux、Windows 统一控制与自动化执行层  

## 文档边界说明

- 本文档聚焦架构目标、分层边界与演进路线。
- 命令级部署步骤不在本文维护，请看 `ADA-部署手册.md`。
- MCP 工具参数与示例不在本文维护，请看 `ADA-MCP-接入手册.md`。
- 研发执行细节与测试门禁请看 `ADA-开发手册.md`。

---

## 1. 背景与目标

### 1.1 背景

企业需要一套**跨端、可扩展、业务语义统一**的自动化与控制体系。第一阶段目标是先交付可运行的 `ada-agent`，底层驱动基线收敛为 **Playwright（Web）+ Appium（Android+iOS+HarmonyOS NEXT）**，并预留图形交互扩展能力；上层需支持**大模型通过 MCP 调用**，并适应**互联网接入**与**服务端主导控制**场景。

### 1.2 目标

| 维度 | 目标 |
|------|------|
| 业务层 | 与平台无关的统一 Locator / Action / Assertion / Artifact 模型 |
| 驱动层 | 插件化接入，能力声明与版本可治理 |
| 运行时 | Node.js 作为控制中枢，与原生驱动桥接 |
| 智能化 | MCP 暴露能力；大模型接入可插拔 |
| 通信 | 支持 HTTP 与双工长连接，按配置与网络策略选型；执行语义支持请求-响应成对 |
| 可靠性 | 会话隔离、幂等、重试分级、可观测与审计 |

### 1.3 非目标（首期可明确排除）

- 替代各平台官方应用商店上架流程或应用开发框架选型。
- 在移动端内嵌完整 Node.js 运行时作为 App 主运行时（不推荐）。

### 1.4 当前版本决策收敛（优化后）

为避免开发阶段目标发散，当前版本统一采用以下约束：

- 第一阶段以本地四入口交付为主（`ada-agent/ada-mcp/ada-gui/ada-web`），`ada-control` 延后到第二阶段。
- 驱动插件仅保留 `driver-playwright`、`driver-appium` 两条主链路（`driver-appium` 统一承载 Android/iOS/Harmony）。
- 图形交互层仅做接口与安全护栏预留，默认关闭，不进入首期关键路径。
- 执行主通道采用双工长连接；保留最小 HTTP 管理能力（注册/健康检查/配置）。
- 第一阶段成功标准：可执行程序在 Win/macOS/Linux 启动并完成 Web + Mobile 基础任务集。

### 1.5 当前实现映射（2026-04）

当前仓库已落地为“统一核心能力层 + 多入口适配层”：

- 核心层：`packages/agent-core`（唯一能力面）
- 入口层：
  - `ada-agent`（CLI）
  - `ada-mcp`（MCP/stdio）
  - `ada-gui`（Tauri 原生 GUI）
  - `ada-web`（WEB 控制台）

统一约束：

- 核心能力统一由 `agent-core` 提供（`health/doctor/install-deps/setup/start/run`）。
- 入口层仅做协议与交互适配，不重复实现业务流程。
- GUI/WEB/MCP 运维动作应优先通过核心能力面调用（如 `core --action=*` 或 `agent-core` API）。

---

## 2. 设计原则

1. **控制平面与数据平面分离**：编排、路由、策略、MCP 属于控制平面；具体点击、注入、截图等属于数据平面（驱动执行）。
2. **协议与实现分离**：统一 `CommandEnvelope` / `EventEnvelope`，不绑定单一传输层。
3. **插件优先**：新平台或新引擎以驱动插件扩展；新模型以 `IModelProvider` 扩展。
4. **默认安全**：鉴权、最小权限、敏感操作可审计；互联网场景默认 TLS。
5. **可降级**：长连接不可用时具备 HTTP 兜底路径（若产品策略允许）。

---

## 3. 总体架构

### 3.1 逻辑分层

```
┌─────────────────────────────────────────────────────────────┐
│  L6 应用层：测试流 / CI / 运营脚本 / 大模型 Agent              │
└───────────────────────────┬─────────────────────────────────┘
                            │ MCP Tools / SDK
┌───────────────────────────▼─────────────────────────────────┐
│  L5 ADA 业务 API：统一领域模型（定位、动作、断言、产物）        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  L4 编排与策略：路由、重试、熔断、回退、配额、抢占               │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  L3 能力图谱：平台 × 能力 × 稳定性 × 成本 → 选择驱动插件        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  L2 驱动插件运行时：Playwright / Appium（首期基线）             │
└───────────────────────────┬─────────────────────────────────┘
                            │ 桥接（HTTP/gRPC/WS/CLI）
┌───────────────────────────▼─────────────────────────────────┐
│  L1 基础设施：日志、链路追踪、指标、产物存储、密钥               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 部署视角（互联网 + 服务端控制）

- **ADA Agent（执行节点）**：部署在受控设备/仿真器/浏览器环境侧，负责长连接维持与驱动调用。
- **ADA Control（控制服务）**：部署在云端或企业内网，负责任务下发、会话管理、策略与 MCP 网关。
- **最小建议**：执行指令以**双工长连接**为主通道；**HTTP** 用于注册、鉴权、配置、健康检查及降级（见第 6 章）。

---

## 4. Node.js 定位

| 角色 | 说明 |
|------|------|
| 推荐 | **控制中枢**（TypeScript/Node）：会话、编排、插件加载、MCP、配置、观测 |
| 与移动端关系 | 移动应用本体仍由原生 / RN 等构建；Node 侧通过 **Appium（底层 UIA2/WDA 链路）** 驱动操作 |
| 与 Web | **Playwright** 等与 Node 生态契合度高，适合作为一等适配目标 |

**结论**：以 Node.js 实现 ADA **核心控制与插件体系完全可行**；各端深度能力通过 **Adapter + 外部进程/服务** 接入，避免“一个进程扛所有原生协议”的耦合。

---

## 5. 统一业务域模型（L5）

### 5.1 核心概念

- **Session**：一次可控会话（含目标平台、设备指纹、驱动实例、超时策略）。
- **Locator**：语义化优先（role、label、text、testId），带 **fallback 链**（无障碍 → 原生选择器 → 图像/OCR 等，由能力声明决定可用性）。
- **Action**：原子动作（click、type、swipe、key、launch、wait）与可组合业务动作（可选）。
- **Assertion**：存在性、可见性、值、区域图像比对等。
- **Artifact**：截图、录屏、视图层级、日志片段、网络 HAR（按平台能力）。

### 5.2 命令封装（与传输无关）

所有通道上传输同一套**命令信封**，以实现「仅长连接时仍具备类 HTTP 的请求-响应成对语义」：

- `requestId`：全局唯一，响应必须回带。
- `sessionId` / `agentId`：路由与隔离。
- `idempotencyKey`：写类、提交类动作防重。
- `seq`（可选）：同会话内顺序与断点续传。
- `payload`：平台无关的业务命令体；扩展字段由驱动插件 schema 约束。

消息类型建议枚举：**REQUEST**、**RESPONSE**、**EVENT**（服务端推送或执行过程流式事件）。

---

## 6. 通信架构

### 6.1 设计结论摘要

| 场景 | 建议 |
|------|------|
| 互联网 + 服务端主动控制 | **主通道：双工长连接**（WebSocket 或 gRPC 双向流） |
| 请求-响应语义 | 在长连接上实现 **RPC 语义**（`requestId` 成对），不依赖 HTTP |
| 跨网与运维 | 保留 **最小 HTTP 管理面**（注册、鉴权、配置、健康检查） |
| 强隔离网络 | 配置 `transport.mode=http` 或 **长轮询降级**，自动/手动切换 |

### 6.2 传输抽象

定义 `ITransport`（概念）：

- `connect` / `close`
- `sendRequest` → 返回 Promise（内部映射到 `requestId` 与超时）
- `subscribeEvents`（事件流）
- `health`

实现类：

- `StreamTransport`：WebSocket / gRPC stream
- `HttpTransport`：REST 任务拉取、状态上报、文件接口

### 6.3 策略选择器（配置驱动）

配置项建议包含：

- `transport.mode`：`auto` | `stream` | `http`
- `transport.stream.protocol`：`websocket` | `grpc`
- `transport.fallback.enabled`：是否允许降级
- 心跳间隔、读超时、重连退避、最大重试次数

**自动模式**：优先建立长连接；失败则降级 HTTP（轮询/长轮询）；长连接恢复后切回。

### 6.4 可靠性要点

- **心跳 + 超时 + 指数退避重连**（带 jitter）。
- **断线续传**：重连携带 `sessionId` + `lastAckSeq`（若启用 seq）。
- **幂等与重试**：区分「UI 抖动」与「基础设施故障」的重试策略。

---

## 7. 驱动插件层（L2）

### 7.1 插件契约（概念）

每个驱动插件提供：

- **Manifest**：`id`、`semver`、`platforms[]`、`capabilities[]`、`dependencies`、`healthcheck` 说明。
- **生命周期**：`init` → `createSession` → `execute` → `recover`（可选）→ `shutdown`。
- **能力声明**：例如 `screenshot`、`biometric`（若不支持则在能力图谱中不可选）。

### 7.2 参考映射（示例）

| 平台/场景 | 参考实现方向 |
|-----------|----------------|
| Web | Playwright |
| Android | Appium + UIAutomator2（首期） |
| iOS | Appium + WDA / XCUITest（首期） |
| HarmonyOS NEXT | Appium 3 + appium-harmonyos-driver（首期） |
| 跨端移动流 | Maestro（二期按场景评估） |
| 游戏/特殊 UI | Airtest / Poco（二期按需插件化） |
| 桌面 | 各 OS 原生自动化桥 + 统一 Adapter |

### 7.3 能力图谱（L3）

输入：目标平台、所需能力、SLA、成本策略。  
输出：排序后的驱动插件列表 + 主备与回退链。  
执行前需要进行 Feature Negotiation（能力协商），若命令未在插件 manifest 声明能力中，则在内核直接返回 `DRIVER_CAPABILITY_UNSUPPORTED`，避免运行时落到底层驱动后才失败。  
版本升级：插件 semver 与 **ADA 业务 API 主版本** 解耦，通过兼容矩阵发布。

---

## 8. MCP 与大模型接入

### 8.1 MCP 网关

- 将 ADA 能力注册为 **MCP Tools**（执行动作、查询状态、拉取产物等）。
- 结构化资源（如设备列表、会话状态）可作为 **MCP Resources**。
- **Schema 版本化**：工具入参/出参稳定演进，避免模型侧频繁断裂。

### 8.2 大模型插件化

- 定义 `IModelProvider`：`plan`、`reason`、`toolCall`、`summarize` 等（按产品裁剪）。
- 按模型能力打标签（规划、视觉、代码），由 **Prompt Router** 选择。
- **安全护栏**：危险操作（卸载、删数据、支付）走策略引擎，可要求二次确认或人工审批。

---

## 9. 安全与合规

- **传输**：TLS；企业场景可选 mTLS。
- **身份**：短期 Token + 刷新；Agent 与设备绑定。
- **授权**：RBAC + 会话级能力裁剪（某会话仅允许指定 appId / URL 域）。
- **审计**：指令级审计日志 + 关联 `traceId`。

---

## 10. 可观测性

- **Tracing**：OpenTelemetry，span 覆盖「编排 → 插件 → 桥接 → 驱动」。
- **Metrics**：成功率、P99 时延、重连次数、降级次数、插件错误分类。
- **Artifacts**：统一产物包格式，便于 CI 与模型 grounding。

---

## 11. 演进路线（建议）

| 阶段 | 内容 |
|------|------|
| Phase 0 | 冻结业务 API v0.1 + 信封协议 + 一种长连接实现 |
| Phase 1 | Web（Playwright）+ 一种移动栈（如 Android Appium）闭环 |
| Phase 2 | iOS（WDA）+ MCP 工具集 + 自动/降级传输 |
| Phase 3 | 桌面与扩展插件 + 能力图谱与熔断回退完善 |

---

## 12. 可执行程序化交付方案

ADA 当前交付建议为四个入口二进制（共享同一核心能力层）：

- `ada-agent`：CLI 入口（运维与任务执行）
- `ada-mcp`：MCP 入口（给 IDE/Agent 通过 stdio 调用）
- `ada-gui`：桌面 GUI 入口（Tauri 原生）
- `ada-web`：WEB 控制台入口（浏览器）

### 12.1 构建与产物形态

| 组件 | 运行方式 | 推荐产物 |
|------|----------|----------|
| ada-agent | 长驻进程（守护） | 单文件可执行程序（pkg） |
| ada-mcp | stdio 服务进程 | 单文件可执行程序（pkg） |
| ada-gui | 桌面应用 | 原生可执行程序（Tauri） |
| ada-web | 本地 WEB 控制台 | 单文件可执行程序（pkg） |
| driver plugins | 动态加载模块 | npm 包或独立 worker（按驱动隔离） |

建议在首期优先保证四入口版本统一由同一核心能力层构建并发布，避免能力漂移。

### 12.2 跨平台发布矩阵

| 目标系统 | 架构 | 建议发布名 |
|----------|------|------------|
| Windows | x64/arm64 | `ada-agent-win-x64.exe` |
| macOS | x64/arm64 | `ada-agent-darwin-arm64` 等 |
| Linux | x64/arm64 | `ada-agent-linux-x64` |

发布包建议包含：

- 可执行文件
- 默认配置模板（`config/default.yaml`）
- 插件清单与版本锁定文件（`plugins.lock`）
- 启停脚本（可选）

### 12.3 启动与运行模型

- 启动命令建议统一：`ada-agent start --config ./config/default.yaml`
- 运行模式：
  - `foreground`：开发调试
  - `daemon`：生产常驻（由 systemd / Windows Service / launchd 管理）
- 首次启动流程：读取配置 -> 鉴权注册 -> 建立长连接 -> 上报能力 -> 接收任务。

#### 12.3.1 Windows/macOS 首启交互页面（鉴权与配置）

为降低桌面端部署门槛，`ada-agent` 在 Windows/macOS 首次启动时应支持本地交互引导页面（Bootstrap UI）：

- 触发条件：缺少有效凭据、关键配置缺失、或显式执行 `ada-agent setup`。
- 展示方式：本地回环地址（如 `http://127.0.0.1:<port>`）打开轻量 Web 页面；仅本机可访问。
- 配置项：服务端地址、组织/环境、设备标签、传输模式（stream/http/auto）、日志级别。
- 鉴权方式：设备码登录或 Token 录入；凭据加密落盘（Windows Credential Manager / macOS Keychain）。
- 完成条件：配置校验通过并写入 `config` + `secrets`，自动关闭引导页并进入常驻模式。

安全要求：

- 引导页必须带一次性会话码与过期时间，防止本地端口被滥用。
- 不在日志中输出明文 Token；所有敏感字段仅显示掩码。
- 支持 `ada-agent setup --reset` 重新引导并安全清理旧凭据。

### 12.4 升级与回滚

- **版本规范**：主程序与协议按 semver；插件独立 semver。
- **灰度升级**：按设备组逐步升级，观察连接成功率与任务成功率。
- **快速回滚**：保留上一个稳定版本二进制与 `plugins.lock`，失败后秒级切回。
- **兼容策略**：后续 `ada-control` 统一维护最低版本门槛与兼容矩阵；第一阶段由发布流程约束入口与核心版本一致。

### 12.5 运维与稳定性要求（可执行程序维度）

- 崩溃自动拉起（systemd/Service/launchd）
- 启动自检（配置、证书、网络、插件完整性）
- 进程健康探针（本地 health endpoint 或心跳指标）
- 本地日志轮转与磁盘上限保护
- 产物目录 TTL 自动清理，避免磁盘打满

---

## 13. 第一阶段（仅 `ada-agent`）项目开发架构

第一阶段不开发 `ada-control`，以**本地四入口可执行程序**先完成核心能力闭环：任务执行、驱动插件、产物采集、可观测与可扩展通信。

### 13.1 第一阶段目标与范围

| 类型 | 范围 |
|------|------|
| 必做 | 统一业务命令模型、插件运行时、至少 2 类驱动（Web + Android/iOS 其一）、本地任务执行器、日志与产物体系 |
| 可选 | 长连接通信适配层（可先以 mock server/本地回环方式验证） |
| 不做 | 云端控制面、多租户管理、复杂权限中心 |

### 13.2 模块划分（高内聚、低耦合）

建议按 monorepo 组织：

| 包/目录 | 职责 | 依赖规则 |
|---------|------|----------|
| `apps/ada-agent` | 可执行入口（CLI、启动流程、进程生命周期） | 仅依赖 `core/*` 与插件加载器 |
| `packages/contracts` | 领域协议（Command/Event/Artifact/Plugin Manifest） | 无业务依赖；只放类型与 schema |
| `packages/core-kernel` | 核心内核（Session、TaskExecutor、StateMachine） | 不依赖任何具体驱动 |
| `packages/core-runtime` | 运行时基础能力（配置、日志、指标、存储、错误码） | 不依赖具体驱动 |
| `packages/plugin-sdk` | 插件开发 SDK（接口、生命周期、测试桩） | 仅依赖 contracts |
| `packages/plugin-host` | 插件发现、加载、隔离、版本与能力校验 | 依赖 plugin-sdk，不依赖具体插件实现 |
| `plugins/driver-*` | 各驱动插件实现 | 只依赖 plugin-sdk + 对应桥接库 |
| `packages/transport-*` | 传输实现（stream/http） | 依赖 contracts，不感知驱动 |

强约束：`core-*` 永远不能 import `plugins/*`；只能通过接口反转调用。

### 13.3 Agent 内核执行流水线

`ada-agent` 启动后执行如下流水线：

1. `Bootstrap`：加载配置、初始化日志/指标、环境自检。
2. `PluginHost`：扫描插件目录，校验 manifest 与版本兼容矩阵。
3. `CapabilityRegistry`：汇总插件能力，形成本地能力图谱。
4. `TaskExecutor`：接收任务命令（本地/API/长连接），编排执行。
5. `DriverSessionManager`：按平台创建/复用/销毁驱动会话。
6. `ArtifactPipeline`：统一收集截图、日志、页面层级等产物。
7. `Reporter`：输出执行结果（本地文件、stdout、可选上报通道）。

### 13.4 插件化驱动架构

#### 13.4.1 插件接口最小集合

- `manifest`: `id/version/platforms/capabilities/engine`
- `init(context)`
- `createSession(sessionOptions)`
- `execute(commandEnvelope)`
- `collectArtifacts(scope)`
- `recover(errorContext)`
- `dispose()`

#### 13.4.2 插件隔离策略

- 首期建议 **进程内加载 + 严格超时与熔断**（开发效率高）。
- 二期演进为 **插件独立 worker 进程**（防止单插件崩溃拖垮 agent）。
- 任何插件异常必须映射为标准错误码，不可向上抛出引擎原始异常。

### 13.5 底层驱动“参考开源实现，不直接复用”策略

原则：借鉴成熟项目的**协议语义、能力模型、稳定性经验**，但 `ada-agent` 保持自己的统一接口与实现边界。

| 驱动方向 | 参考点 | ADA 实施方式（不直接复用） |
|----------|--------|-----------------------------|
| Web（Playwright） | Auto-wait、Locator 语义、Tracing 思路 | 自研 `playwright-adapter`，仅调用官方库，统一映射 ADA Locator/Action |
| Android（Appium/UIA2） | 会话与命令语义、元素生命周期 | 自研 `appium-bridge` + 命令转换层，不透传 Appium 原始模型到业务层 |
| iOS（WDA/XCUITest） | WebDriverAgent 路由语义、稳定性实践 | 自研 `wda-bridge`，将端点封装为 ADA 标准动作，不暴露 WDA 细节 |
| Maestro/Airtest | 流程编排、视觉交互思路 | 抽取为可选能力插件（visual-flow/image-locator），避免耦合主执行链 |

落地要求：

- 不直接复制开源项目内部代码作为核心域模型；
- 开源实现作为“协议兼容与行为参考”，核心抽象在 `contracts` 固化；
- 每个插件都必须有 conformance tests（与 `plugin-sdk` 提供的标准用例对齐）。

### 13.6 推荐目录骨架

```text
ada/
  apps/
    ada-agent/
      src/
        bootstrap/
        cli/
        main.ts
  packages/
    contracts/
    core-kernel/
    core-runtime/
    plugin-sdk/
    plugin-host/
    transport-stream/
    transport-http/
    vision-contracts/
    graphics-safety/
    graphics-kernel/
  /plugins
    driver-playwright/
    driver-appium/
  test/
    conformance/
    integration/
  config/
    default.yaml
```

### 13.7 分层测试策略

- **contracts 测试**：schema backward compatibility 校验。
- **kernel 单测**：状态机、重试、幂等与超时逻辑。
- **插件一致性测试**：统一用例在所有驱动插件执行（同输入同语义输出）。
- **集成测试**：真实设备/模拟器冒烟（按平台最小集）。
- **发布前验收**：可执行程序冷启动、插件加载、单任务执行、产物落盘、退出回收。

### 13.8 第一阶段里程碑（仅 Agent）

| 里程碑 | 交付内容 |
|--------|----------|
| M1 | `contracts + core-kernel + plugin-sdk` 初版，命令闭环跑通 |
| M2 | `driver-playwright` 完成，可执行程序本地跑通 |
| M3 | `driver-appium` 完成（覆盖 Android + iOS + Harmony），三平台可用 |
| M4 | 插件一致性测试 + 打包发布（win/mac/linux） |
| M5 | 稳定性加固（重试/熔断/日志轮转/产物清理）并冻结 v1 |

### 13.9 首期驱动基线与图形交互预留设计

第一阶段明确采用如下底层驱动基线：

- **Web**：`driver-playwright`
- **Android + iOS + HarmonyOS NEXT**：`driver-appium`

为支持后续大模型视觉理解、图像定位、坐标交互等能力，`ada-agent` 需在不破坏主执行链路的前提下预留**图形交互层（Graphic Interaction Layer）**。

#### 13.9.1 设计目标

- 主链路保持元素语义自动化（Locator/Action/Assertion）优先。
- 图形交互作为能力扩展层，按配置开启，不默认介入主流程。
- 对业务层保持统一接口，避免暴露底层图像工具实现细节。

#### 13.9.2 模块拆分（新增）

| 模块 | 职责 | 与主链路关系 |
|------|------|--------------|
| `packages/graphics-kernel` | 图像识别与坐标转换编排（模板匹配、OCR、区域裁剪） | 通过 `core-kernel` 调用，不反向依赖驱动插件 |
| `packages/vision-contracts` | 图形交互协议（VisionTarget、Point、Confidence、Region） | 仅类型与 schema，供驱动与模型共享 |
| `plugins/vision-*` | 可插拔视觉能力（如 OCR/模板匹配实现） | 可选插件，失败不应拖垮主执行 |
| `packages/graphics-safety` | 图形动作护栏（边界校验、二次确认、误触防护） | 所有坐标动作必须经过该层 |

当前实现状态（第一阶段）：

- 已提供 `vision-contracts`、`graphics-safety`、`graphics-kernel` 的最小代码骨架与接口。
- 默认保持关闭，不会影响主链路语义自动化执行。

#### 13.9.3 统一动作模型（建议）

在现有 `Action` 基础上预留以下动作，不要求首期全部实现：

- `visualLocate(target)`：根据图像/OCR目标返回候选区域与置信度。
- `tapPoint(point)`：屏幕坐标点击（兜底动作）。
- `dragByPath(path)`：按路径拖拽（支持相对坐标）。
- `assertVisual(rule)`：视觉断言（区域存在/差异阈值）。

执行策略建议：

1. 先走语义定位（元素模式）。  
2. 语义失败且策略允许时，触发视觉定位。  
3. 视觉动作后必须做状态回读断言（防误触）。  

#### 13.9.4 与 `driver-playwright` / `driver-appium` 的协同

- `driver-playwright`：优先 DOM/ARIA 语义定位；图像动作仅用于 Canvas/WebGL/远程桌面类页面兜底。
- `driver-appium`：优先控件树定位（Android UIA2 / iOS WDA 链路）；图像模式用于复杂自绘界面与无障碍信息缺失场景。

#### 13.9.5 能力声明与开关控制

插件 manifest 新增能力标签建议：

- `capabilities.visual.locate`
- `capabilities.visual.tap`
- `capabilities.visual.assert`

运行时配置建议：

- `graphics.enabled`：是否启用图形交互层
- `graphics.fallbackOnSemanticFailure`：语义失败时是否自动降级视觉
- `graphics.minConfidence`：最低置信度阈值
- `graphics.requirePostAssert`：图形动作后是否强制断言

#### 13.9.6 工程边界（避免失控）

- 图形交互层不得直接调用具体驱动 API；必须经 `core-kernel` 与统一命令模型下发。
- 图像识别结果必须标准化（坐标系、屏幕方向、分辨率缩放）。
- 所有图形动作均产出审计日志与截图前后对比产物，便于回放和模型纠错。

---

## 14. 风险与对策

| 风险 | 对策 |
|------|------|
| 长连接在企业网受限 | HTTP 降级路径 + 明确运维文档 |
| 多驱动语义不一致 | 统一 Locator/Action 映射表 + 插件级单测矩阵 |
| 模型误触发危险操作 | 策略引擎 + 权限域 + 高危操作白名单 |
| 插件版本碎片化 | 兼容矩阵 + 控制面强制最低版本策略 |

---

## 15. 文档与实现衔接

- 本文档描述**逻辑架构与边界**；接口级 IDL（TypeScript / JSON Schema）建议在仓库 `packages/contracts` 中单独立项并版本发布。
- 若使用 Cursor，可在项目 `canvases/` 目录维护可视化架构蓝图（`.canvas.tsx`），与本文档同步迭代。

---

## 16. 详细开发方案（可直接执行）

本章给出第一阶段（仅 `ada-agent`）的执行级方案，按 12 周、6 个迭代组织，默认 5 人小队：

- 1 名架构/后端（kernel + runtime）
- 2 名驱动工程师（playwright / appium）
- 1 名前端/工具链工程师（CLI、打包、可执行发布）
- 1 名测试工程师（自动化、稳定性、回归）

### 16.1 工作分解结构（WBS）

| WBS | 模块 | 关键任务 | 输出物 |
|-----|------|----------|--------|
| 1 | `contracts` | 定义 Command/Event/Artifact/Plugin Manifest schema；版本策略 | `packages/contracts` + schema 校验工具 |
| 2 | `core-kernel` | TaskExecutor、SessionManager、RetryPolicy、ErrorMap | 核心执行引擎可运行 |
| 3 | `plugin-sdk` | 插件接口、上下文对象、测试桩、错误规范 | 插件开发 SDK 文档与示例 |
| 4 | `plugin-host` | 插件发现/加载/能力注册/兼容校验 | 插件管理运行时 |
| 5 | `driver-playwright` | Locator 映射、动作执行、断言、产物采集 | Web 驱动插件 |
| 6 | `driver-appium` | Android+iOS 统一桥接、会话管理、动作映射 | 移动驱动插件 |
| 7 | `graphics-reserved` | vision contracts、fallback 策略、安全护栏骨架 | 图形交互预留框架 |
| 8 | `agent-app` | CLI、配置加载、守护进程模式、健康检查 | `ada-agent` 可执行程序 |
| 9 | `quality` | conformance、integration、e2e、稳定性压测 | 测试报告与发布门禁 |
| 10 | `release` | 打包、签名、发布矩阵、升级回滚脚本 | 可发布制品与发布说明 |

### 16.2 12 周迭代计划

| 周次 | 目标 | 详细任务 | 完成标准 |
|------|------|----------|----------|
| W1-W2 | 架构与协议冻结 | 建立 monorepo、contracts v0.1、错误码体系、配置模型 | API 评审通过，schema 有兼容校验 |
| W3-W4 | 内核可跑 | 完成 TaskExecutor、Session 生命周期、PluginHost、CLI 启动 | 本地假插件可完成完整请求-响应闭环 |
| W5-W6 | Web 闭环 | 实现 `driver-playwright`（click/type/assert/screenshot） | Web demo 用例通过率 >= 95% |
| W7-W8 | 移动闭环 | 实现 `driver-appium`（Android+iOS 基础动作） | Android/iOS 冒烟各 >= 20 条通过 |
| W9-W10 | 质量加固 | conformance tests、重试/熔断、日志与产物标准化 | 插件一致性测试全绿，关键路径无 P1 |
| W11-W12 | 发布就绪 | 单文件可执行打包、跨平台发布、回滚与升级演练 | 3 平台可执行产物可启动并执行任务 |

### 16.3 模块级开发任务清单

#### A. `packages/contracts`

- 定义 `CommandEnvelope`、`ResponseEnvelope`、`EventEnvelope`
- 定义 `PluginManifest` 与 `Capability` 结构
- 定义 `ArtifactIndex` 与产物元数据 schema
- 生成 TS 类型与 JSON Schema 双产物

验收标准：

- schema 具备 backward compatibility 检查
- 示例命令能通过静态校验与运行时校验

#### A-1. `packages/bootstrap-ui`（Windows/macOS）

- 提供本地引导页服务（仅回环地址）
- 提供鉴权与配置向导（含参数校验）
- 与 secrets 存储模块集成（Keychain/Credential Manager）

验收标准：

- 无配置启动时可自动弹出引导流程
- 填写配置并鉴权成功后可无感重启进入执行模式
- 凭据不落明文文件且可安全重置

#### B. `packages/core-kernel`

- `TaskExecutor`：统一调度入口
- `DriverSessionManager`：创建/复用/销毁会话
- `RetryPolicyEngine`：错误分类重试（UI 抖动/基础设施）
- `ResultAssembler`：统一结果组装与错误映射

验收标准：

- 单元测试覆盖率 >= 80%
- 超时、取消、重试、幂等路径均有测试

#### C. `packages/plugin-sdk` + `packages/plugin-host`

- SDK：接口、生命周期、上下文、错误码 helper
- Host：插件扫描、版本约束、能力注册、健康检查
- 安全：插件异常隔离、超时中断、防止阻塞主线程

验收标准：

- 示例插件可 5 分钟内接入并执行测试命令
- 插件故障不会导致 agent 退出

#### D. `plugins/driver-playwright`

- Locator 映射：role/text/testId/css/xpath（受控）
- Action：click/type/hover/scroll/wait/navigation
- Assertion：exists/visible/text/value
- Artifact：screenshot、page source、console/network（可选）

验收标准：

- 标准 Web 用例通过率 >= 95%
- 常见失败场景返回 ADA 标准错误码

#### E. `plugins/driver-appium`

- 会话：Android/iOS capability 构建与生命周期
- Action：tap/input/swipe/back/home/launch
- Assertion：element exists/visible/text
- Artifact：screenshot、page source、device log（可选）

验收标准：

- Android+iOS 各至少 1 台设备稳定跑 2 小时
- 断连重试与会话恢复策略可验证

#### F. 图形交互预留（骨架）

- `vision-contracts`：Point/Region/Confidence 类型
- `graphics-kernel`：仅实现流程编排接口，不接复杂算法
- `graphics-safety`：坐标边界校验与后置断言钩子

验收标准：

- 语义失败时可配置触发视觉 fallback（mock）
- 视觉动作默认关闭，开启后不影响主链路稳定性

### 16.4 关键路径与并行策略（提效优化）

为保证 12 周按期交付，建议按“关键路径优先、非关键并行”执行：

- 关键路径：`contracts -> core-kernel -> plugin-sdk/plugin-host -> driver-playwright -> driver-appium -> 打包发布`
- 并行路径：`graphics-reserved`、文档、部分集成测试可与驱动开发并行推进。
- 冻结点：
  - W2 冻结协议与错误码（避免后续驱动反复改接口）
  - W6 冻结 Web 动作子集（保证移动端接入不受影响）
  - W10 冻结发布清单与配置项（保障打包与验收稳定）

建议引入每周例行机制：

- 周一：接口变更评审（是否破坏兼容）
- 周三：跨插件 conformance 回归
- 周五：端到端冒烟与风险清单更新

### 16.5 工程规范与门禁

| 类别 | 规则 |
|------|------|
| 分支策略 | `main` + 短分支；每个 PR 不超过 500 行有效改动（尽量） |
| 代码规范 | TypeScript strict 模式；ESLint + Prettier；提交前自动检查 |
| 测试门禁 | 单测必过；contracts 兼容检查必过；关键集成用例必过 |
| 可观测性 | 所有执行链路必须带 `traceId/requestId/sessionId` |
| 文档同步 | 每个模块交付必须更新 README 与接口示例 |

### 16.6 发布与验收清单（Go/No-Go）

发布前必须满足：

1. `driver-playwright` 与 `driver-appium` conformance 测试通过。  
2. 三平台可执行程序可启动并执行最小任务集。  
3. 崩溃恢复、日志轮转、产物清理策略验证通过。  
4. 升级与回滚演练各至少 1 次并记录。  
5. 已知问题列表（Known Issues）与规避策略已归档。  

补充发布验收项（执行程序视角）：

6. 首启自动依赖安装（Playwright/Appium）在目标网络环境可用或已提供手动安装替代流程。  
7. `start --watch` 支持优雅停止，停止后无任务文件丢失。  
8. 队列失败文件自动进入 `failed` 并生成错误元数据。  

### 16.7 后续二阶段预告（不在本期实现）

- 独立 `ada-control` 服务端控制面
- 插件进程级隔离（worker 模式）
- 真实视觉算法插件（OCR、模板匹配）
- MCP 工具正式对外暴露与权限体系

---

**附录：术语**

- **ADA**：AllDriverAgent，统一执行层代理。  
- **双工长连接**：服务端与客户端均可主动发送消息的双向通道。  
- **MCP**：Model Context Protocol，用于大模型与工具/资源的标准化集成。
