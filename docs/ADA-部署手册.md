# ADA 部署手册（可执行程序版）

本手册只面向**已打包完成的 `ada-agent` 可执行程序**，不包含源码开发命令。

## 文档边界说明

- 本文档只覆盖部署、启动、运维与故障排查。
- 架构原理请看 `ADA-架构设计方案.md`。
- MCP 工具调用请看 `ADA-MCP-接入手册.md`。
- 开发与测试流程请看 `ADA-开发手册.md`。

---

## 1. 交付物说明

发布包建议包含：

- `ada-agent` 可执行文件  
  - Windows: `ada-agent.exe`
  - macOS/Linux: `ada-agent`
- `config/default.yaml`
- `tasks/` 目录（含 `inbox/processed/failed`）
- （可选）启动脚本与服务注册脚本

---

## 1.1 构建产物来源（研发）

可执行程序由研发侧通过以下命令生成：

```bash
npm run build:exe
```

产物输出目录：`release/`

说明：首次构建会下载 `pkg` 目标运行时二进制，可能耗时较长。

构建完成后可执行统一入口验收（或由 `build:exe` 自动触发）：

```bash
npm run test:entrypoints
```

---

## 2. 首次部署步骤

1. 解压发布包到目标目录（示例：`D:\ada-agent` 或 `/opt/ada-agent`）
2. 确认可执行权限（Linux/macOS）
3. 执行首启配置（CLI 或 GUI）
4. 启动运行（单次或持续模式）

Linux/macOS 可执行权限：

```bash
chmod +x ./ada-agent
```

---

## 3. 驱动依赖安装（可执行程序）

### 3.1 自动安装（推荐）

默认情况下，`ada-agent` 在启动时会自动检查并安装：

- `playwright`
- `appium`（默认 3+）
- Playwright 浏览器（默认 `chrome`，可配置多选）
- Appium drivers（默认 `uiautomator2`、`xcuitest`、`harmonyos`）

当前项目运行时基线：

- Node.js `>=22`（默认 Node.js 22）
- npm `>=10`
- Java：OpenJDK 11（Android + Appium 场景）
- Appium 默认版本线：`3+`

安装策略顺序（自动回退）：

1. `pnpm`
2. `pnpm` + 代理 registry
3. `npm`
4. `npm` + 代理 registry

安装前会自动探测并选择最快地址：

- Appium/npm 依赖：从 registry 候选中测速后选最快
- Playwright 浏览器：从下载 host 候选中测速后选最快

安装过程会输出阶段进度日志（`deps.progress`），用于定位当前执行阶段：

- `registry.probe.*`
- `playwright.host.probe.*`
- `packages.install.*`
- `playwright.browser.install.*`
- `appium.driver.install.*`

关键阶段会带序号标签（如 `[1/7]`、`[4/7]`），便于快速识别当前执行进度。

安装策略支持超时快速切换，可通过环境变量调整：

- `ADA_INSTALL_STRATEGY_TIMEOUT_MS`（默认 `20000` 毫秒）

Appium driver 兼容性优化（默认开启）：

- 若检测到当前 Appium 为 2.x（历史环境），会自动尝试安装兼容版本的 driver 包
- 可通过环境变量覆盖兼容版本范围：
  - `ADA_APPIUM_DRIVER_RANGE_UIAUTOMATOR2`（默认 `<3`）
  - `ADA_APPIUM_DRIVER_RANGE_XCUITEST`（默认 `<8`）
- 也可直接覆盖安装包规格（仅历史 2.x 环境建议使用）：
  - `ADA_APPIUM_DRIVER_SPEC_UIAUTOMATOR2`（默认 `appium-uiautomator2-driver@2`）
  - `ADA_APPIUM_DRIVER_SPEC_XCUITEST`（默认 `appium-xcuitest-driver@7`）

可通过环境变量覆盖代理地址：

- `ADA_NPM_PROXY_REGISTRY`
- `ADA_PNPM_PROXY_REGISTRY`
- `PLAYWRIGHT_DOWNLOAD_HOST`（默认：`https://npmmirror.com/mirrors/playwright`）
- `ADA_REGISTRY_CANDIDATES`（逗号分隔，覆盖 registry 候选列表）
- `ADA_PLAYWRIGHT_HOST_CANDIDATES`（逗号分隔，覆盖 Playwright host 候选列表）

执行命令：

```bash
./ada-agent start
```

Windows:

```powershell
.\ada-agent.exe start
```

如需跳过自动安装：

```bash
./ada-agent start --skip-deps
```

### 3.2 手动安装

在运维策略要求下，可先手动安装依赖再启动：

```bash
./ada-agent install-deps
```

Windows:

```powershell
.\ada-agent.exe install-deps
```

在线加速安装（推荐）：

- 自动安装前先检查依赖是否缺失；仅对缺失项执行安装。
- 安装策略固定按顺序回退：`pnpm` -> `pnpm(代理)` -> `npm` -> `npm(代理)`。
- 在国内网络环境下优先走 pnpm 与镜像代理以提升成功率与速度。
- `--only` 支持：`all`、`playwright`、`mobile`、`android`、`ios`、`harmony`、`appium`、`drivers`。

分步安装（提速/排障推荐）：

```bash
./ada-agent install-deps --only=playwright
./ada-agent install-deps --only=android
./ada-agent install-deps --only=ios
./ada-agent install-deps --only=harmony
./ada-agent install-deps --only=mobile
```

强制忽略阶段缓存重装：

```bash
./ada-agent install-deps --only=playwright --force
```

安装完成后会输出结构化摘要（JSON），包含：

- `scope`：本次安装范围
- `installedPackages` / `skippedPackages`：包安装结果
- `requestedDrivers` / `installedDrivers` / `skippedDrivers`：驱动安装结果
- `elapsedMs`：耗时

`install-deps` 执行后会自动做基础自检：

- Playwright 浏览器启动自检（headless about:blank）
- Appium 本地包可用性自检（读取已安装版本）
- Appium drivers 检查与缺失自动安装

若自检失败，请按 3.3 章节进行分项手动安装与排查。

阶段缓存文件：

- `.ada-agent/deps-install-state.json`

### 3.3 手动分项安装（Playwright / Appium）

若需要分别安装并控制版本，可在 Agent 运行目录手动执行：

#### 3.3.1 安装 Appium

```bash
npm install appium
```

可选验证：

```bash
npx appium -v
```

#### 3.3.2 安装 Playwright

```bash
npm install playwright
```

安装浏览器（按需选择）：

```bash
npx playwright install chromium
```

如需全部浏览器：

```bash
npx playwright install
```

#### 3.3.3 安装完成后启动

```bash
./ada-agent start --watch --skip-deps
```

Windows:

```powershell
.\ada-agent.exe start --watch --skip-deps
```

---

## 4. 首启配置（CLI / GUI）

支持：

- `setup --mode=auto`
- `setup --mode=cli`
- `setup --mode=gui`

示例：

```bash
./ada-agent setup --mode=auto
```

Windows:

```powershell
.\ada-agent.exe setup --mode=auto
```

说明：

- Linux 无桌面环境建议使用 `--mode=cli`
- Windows/macOS 推荐 `--mode=auto` 或 `--mode=gui`
- 若配置了 `bootstrapUI.native.*`，`gui/auto` 会优先调用原生引导程序，失败可按配置自动回退 Web

原生引导程序集成约定（最小协议）：

- 由 `bootstrapUI.native.command` 指定可执行文件
- 程序退出码 `0` 表示成功
- 成功时 stdout 必须输出一段 JSON，字段至少包含：
  - `serverUrl`
  - `tenant`
  - `environment`
  - `authType`（`token` / `device_code`）
  - 可选：`token`、`transportMode`、`streamProtocol`、`deviceTags`

---

## 5. 启动与运行模式

### 5.0 统一核心层与多入口

当前版本采用统一核心能力层 `agent-core`，其余程序均为入口适配层：

- `ada-agent`：CLI 入口（命令行运维与任务执行）
- `ada-mcp`：MCP 入口（给 Cursor/IDE 通过 stdio 调用）
- `ada-gui`：桌面 GUI 入口（原生窗口）
- `ada-web`：WEB 控制台入口（浏览器页面）

说明：

- `health / doctor / install-deps / setup / start / run` 等核心流程由 `agent-core` 统一实现。
- 多入口只负责协议、交互与展示差异，不再各自维护一套业务逻辑。
- GUI 入口调用统一桥接命令：`ada-agent core --action=<health|doctor|setup|install-deps|start>`。
- WEB 入口通过同一核心能力面提供接口（内部调用 `agent-core`，不再复制业务实现）。
- MCP 入口已提供核心运维能力接口（如 `ada_health`、`ada_diagnostics`、`ada_install_deps`、`ada_start_once`）。

### 5.1 常驻监听模式（生产推荐）

```bash
./ada-agent start --watch
```

### 5.2 单次处理模式（批处理/调试）

```bash
./ada-agent start --once
```

### 5.3 指定任务文件执行

```bash
./ada-agent run --file=tasks/demo.tasks.json
```

真实 Web 回归任务（需已安装 Playwright 浏览器）：

```bash
./ada-agent run --file=tasks/web-real.tasks.json
```

如需本机可视化验证浏览器启动，可在任务 payload 中设置：

- `payload.headless: false`

如需额外校验截图产物（`artifacts/<requestId>.png`）：

```bash
./ada-agent run --file=tasks/web-real.tasks.json --verify-artifacts
```

如需强制要求“必须真实执行、禁止回退 mock”：

```bash
./ada-agent run --file=tasks/web-real.tasks.json --require-real --verify-artifacts
```

Appium 连通性探活任务：

```bash
./ada-agent run --file=tasks/appium-probe.tasks.json
```

Harmony Appium 连通性探活任务：

```bash
./ada-agent run --file=tasks/appium-harmony-probe.tasks.json
```

Appium 真实动作任务（需本机已启动 Appium Server 与设备）：

```bash
./ada-agent run --file=tasks/appium-real.tasks.json
```

Harmony 真实动作任务（需本机已启动 Appium Server 与 Harmony 设备）：

```bash
./ada-agent run --file=tasks/appium-harmony-real.tasks.json
```

Appium 断言失败预期样例（用于验证错误码与故障路径）：

```bash
./ada-agent run --file=tasks/appium-real-assert-fail.tasks.json
```

Appium 元素未找到预期样例（用于验证 `*_ELEMENT_NOT_FOUND`）：

```bash
./ada-agent run --file=tasks/appium-real-not-found.tasks.json
```

说明：

- `type` 与 `assertVisible` 支持目标指定方式：
  - `payload.elementId`
  - `payload.locator`（`id` / `accessibilityId` / `xpath` / `uiautomator`）
- `screenshot` 会输出到 `artifacts/*-appium.png`
- 元素查找失败会区分返回：
  - `*_MISSING_ELEMENT`
  - `*_ELEMENT_NOT_FOUND`
  - `*_LOOKUP_FAILED`

队列目录默认值：

- `tasks/inbox`
- `tasks/processed`
- `tasks/failed`

---

## 6. 常用运维命令（可执行程序）

```bash
./ada-agent health
./ada-agent doctor
./ada-agent plugins
./ada-agent reset
./ada-agent mcp
./ada-agent web
```

研发环境可补充执行契约测试：

```bash
npm run test:conformance
npm run test:e2e:smoke
npm run test:e2e:smoke:strict
npm run test:e2e:smoke:full
```

Windows:

```powershell
.\ada-agent.exe health
.\ada-agent.exe doctor
.\ada-agent.exe plugins
.\ada-agent.exe reset
.\ada-agent.exe mcp
.\ada-agent.exe web
```

MCP 服务（供大模型调用）开发启动：

```bash
npm run mcp:dev
```

#### Cursor MCP 配置（研发环境，对应 `npm run mcp:dev`）

在 Cursor 中配置本地 stdio MCP：写入用户级 `~/.cursor/mcp.json`，或项目级 `.cursor/mcp.json`（项目根目录下）。

**说明：**

- 使用 `command` + `args` 启动，为 **stdio 模式**，**不需要** API Key 或 OAuth。
- `cwd` 必须为 ADA **仓库根目录**（含 `package.json` 且定义了 `mcp:dev` 脚本）；勿填用户主目录，否则会出现 `Missing script: "mcp:dev"` 或找不到 `cli.ts`。
- 将配置中的 `D:\\WORKSPACE\\PLAN\\ada` 替换为本机实际仓库路径（注意大小写，如 `ada` / `ADA`）。
- 保存后请在 Cursor 中禁用再启用该 MCP 服务器，或重启 Cursor。

```json
{
  "mcpServers": {
    "ada-mcp-dev": {
      "command": "npx",
      "args": [
        "tsx",
        "D:\\WORKSPACE\\PLAN\\ada\\apps\\ada-mcp-server\\src\\cli.ts"
      ],
      "cwd": "D:\\WORKSPACE\\PLAN\\ada",
      "env": {
        "ADA_PLAYWRIGHT_HEADLESS": "true"
      }
    }
  }
}
```

发布包场景（无需 Node/tsx）可改用 `release/ada-mcp-win.exe`，示例见 `docs/ADA-GUI-操作手册.md` 第 4 节。

详细工具列表与远程 HTTP（`/mcp` + API Key）接入见：`docs/ADA-MCP-接入手册.md`

说明：

- `health`：轻量状态查看
- `doctor`：综合诊断（依赖、端口、队列目录、Appium Server 连通性）
  - 包含 Playwright 浏览器可启动性检查
  - 包含 native bootstrap 命令可达性检查（启用时）
  - 包含 Java 运行时检查（`java -version`、`JAVA_HOME`），用于 Android + Appium 场景
- `start` 运行时会自动打印环境检查日志：
  - `runtime.env.check.start`
  - `runtime.env.check.preflight`
  - `runtime.env.check.post-install`（启用自动安装且未 `--skip-deps` 时）

---

## 7. 配置项说明（关键）

文件：`config/default.yaml`

重点配置：

- `bootstrapUI.mode`：`auto | cli | gui`
- `dependencies.autoInstallOnStart`：启动自动安装依赖
- `dependencies.playwrightBrowser`：`chromium | firefox | webkit | all`
- `dependencies.playwrightInstallTargets`：Playwright 下载目标数组（如 `["chrome"]`、`["chromium","firefox"]`、`["all"]`）
- `dependencies.playwrightDownloadHost`：Playwright 浏览器下载镜像地址（默认 `https://npmmirror.com/mirrors/playwright`）
- `appium.serverUrl`：Appium Server 地址（`doctor` 会检查连通性）
- `appium.requiredDrivers`：Appium 必备 driver 列表（默认 `uiautomator2`、`xcuitest`、`harmonyos`）
- `transport.mode`：`auto | stream | http`（默认 `auto`，优先 stream 失败自动回退 http）
- `transport.streamProtocol`：当前支持 `websocket`
- `transport.requestPath` / `transport.healthPath` / `transport.streamPath`：远程执行与健康检查路径
- `transport.requestTimeoutMs`：远程请求超时
- `monitoring.enabled`：是否开启操作监控（Web/App）
- `monitoring.platforms`：开启监控的平台范围（如仅 `["web"]`）
- `monitoring.sampleEvery`：采样频率（性能优先建议 >1，如 5 表示每 5 条操作监控 1 条）
- `monitoring.outputDir`：监控截图输出目录
- `monitoring.onFailureOnly`：仅失败操作抓图（高性能推荐）
- `monitoring.groupBySession`：按 `sessionId/requestId` 分目录归档
- `monitoring.nonBlocking`：监控异步执行（默认 `true`，不阻塞主链路）
- `monitoring.resolution.maxWidth` / `maxHeight`：监控输出最大分辨率
- `monitoring.resolution.keepAspectRatio`：保持纵横比，避免变形（推荐 `true`）
- `queue.*`：任务队列目录与轮询间隔
  - `queue.maxFileRetryAttempts`：单个任务文件失败重试次数

监控配置示例（性能优先 + 不变形）：

```yaml
monitoring:
  enabled: true
  platforms: ["web", "android", "ios", "harmony"]
  sampleEvery: 5
  outputDir: "artifacts/monitoring"
  onFailureOnly: true
  groupBySession: true
  nonBlocking: true
  resolution:
    maxWidth: 1280
    maxHeight: 720
    keepAspectRatio: true
```

---

## 8. 常见问题

### 8.1 GUI 启动失败

改用 CLI：

```bash
./ada-agent setup --mode=cli
```

### 8.2 自动安装依赖失败

先执行手动安装：

```bash
./ada-agent install-deps
```

再启动：

```bash
./ada-agent start --watch
```

可通过以下命令查看依赖健康状态：

```bash
./ada-agent health
```

若需单独验证 Appium CLI 可用性，可执行：

```bash
./ada-agent run --file=tasks/appium-probe.tasks.json
```

若任务报 `require-real check failed`，说明当前执行路径回退到了 mock，
请先完成依赖安装与环境连通（`install-deps`、`doctor`）后重试。

`require-real` 失败信息已结构化输出，重点字段如下：

- `summary.dependencyMissing`：缺失依赖（如 `playwright` / `appium`）
- `summary.browserNotLaunchable`：Playwright 已安装但浏览器无法拉起
- `summary.appiumCliNotReady`：Appium 包存在但 CLI 检测失败
- `summary.appiumServerUnreachable`：移动端任务所需 Appium Server 不可达
- `summary.mockFallbacks`：发生 mock 回退的任务列表
- `summary.executionFailures`：真实执行失败的任务列表（含 `errorCode`、`errorType`）
- `summary.executionFailureTypes`：失败类型汇总（`environment` / `locator` / `assertion` / `driver`）
- `summary.remediationHints`：自动生成的修复建议

### 8.3 启动提示端口占用（17650）

说明本地已有残留 setup 进程，占用引导端口。结束该进程后重试。

### 8.6 原生引导程序不可用

若 `doctor` 中 `checks.nativeBootstrap.commandReachable=false`，请检查：

1. `bootstrapUI.native.command` 是否填写正确（相对路径建议相对 Agent 根目录）
2. 可执行文件是否有执行权限（Linux/macOS）
3. 若使用命令名而非路径，命令是否在系统 PATH 中
4. 若允许回退，确保 `bootstrapUI.native.fallbackToWeb=true`

### 8.4 队列任务执行失败如何排查

失败任务会被移动到 `tasks/failed`，并生成同名错误元数据文件：

- `<原文件名>.error.json`

其中包含失败时间、重试次数、错误信息，可用于回放与排错。

### 8.5 Appium 真实任务执行失败

请按顺序检查：

1. Appium Server 是否可达（默认 `http://127.0.0.1:4723`）
2. 设备是否已连接并可被对应驱动识别
3. `tasks/appium-real.tasks.json` 中 capabilities 是否匹配目标设备
4. 使用 `doctor` 检查 `appium.serverUrl` 连通性
5. 使用 `appium-probe` 先确认基础可用性
6. Android 场景额外检查 Java：
   - `java -version` 可执行
   - `doctor` 中 `checks.javaRuntime.ok=true`
   - 建议配置 `JAVA_HOME`

### 8.7 HarmonyOS NEXT 环境准备与排障

Harmony 真实执行前，请确认：

1. 设备可被 `hdc list targets` 识别
2. `appium-harmonyos-driver` 已安装（可执行 `install-deps --only=harmony`）
3. Appium Server 版本为 3.x，且启动正常
4. 任务或能力参数中使用：
   - `platformName: harmonyos`
   - `appium:automationName: harmonyos`

推荐验证顺序：

```bash
./ada-agent install-deps --only=harmony
./ada-agent run --file=tasks/appium-harmony-probe.tasks.json
./ada-agent run --file=tasks/appium-harmony-real.tasks.json
```

常见问题：

- `APPIUM_SESSION_CREATE_FAILED`：优先检查 Appium Server 与 `harmonyos` driver 是否安装
- 设备不在线：检查 USB、开发者模式与 `hdc` 连接状态
- 命令不支持：查看插件能力声明，内核会返回 `DRIVER_CAPABILITY_UNSUPPORTED`

---

## 9. 生产部署建议流程

1. 下发可执行包与配置模板
2. 执行 `setup --mode=auto` 完成鉴权与参数配置
3. 执行 `install-deps`（或启用启动自动安装）
4. 执行 `start --watch` 进入常驻
5. 使用 `health` 进行巡检

---

## 10. 进程停止与退出

`start --watch` 支持优雅退出：

- Linux/macOS: `Ctrl + C` 或发送 `SIGTERM`
- Windows: 控制台中断（`Ctrl + C`）

收到停止信号后，Agent 会在当前轮询周期结束后安全退出。
