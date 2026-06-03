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

- `playwright` 与 Playwright 浏览器（默认 `chrome`，可配置多选）
- `hypium-driver`（HarmonyOS NEXT）
- 移动运行时：`adb`（Android）、`xcrun`/WDA（iOS）、`hdc`（Harmony）

当前项目运行时基线：

- Node.js `>=22`（默认 Node.js 22）
- npm `>=10`
- Java：OpenJDK 11（Android UIA2 场景可选）

安装策略顺序（自动回退）：

1. `pnpm`
2. `pnpm` + 代理 registry
3. `npm`
4. `npm` + 代理 registry

安装前会自动探测并选择最快地址：

- npm 依赖：从 registry 候选中测速后选最快
- Playwright 浏览器：从下载 host 候选中测速后选最快

安装过程会输出阶段进度日志（`deps.progress`），用于定位当前执行阶段：

- `registry.probe.*`
- `playwright.host.probe.*`
- `packages.install.*`
- `playwright.browser.install.*`
- `mobile.driver.install.*`

关键阶段会带序号标签（如 `[1/7]`、`[4/7]`），便于快速识别当前执行进度。

安装策略支持超时快速切换，可通过环境变量调整：

- `ADA_INSTALL_STRATEGY_TIMEOUT_MS`（默认 `120000` 毫秒，npm/pnpm 装包）
- `ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS`（默认 `900000` 毫秒，`playwright install` 下载浏览器）

可通过环境变量覆盖代理地址（`install-deps` / 启动时自动安装阶段会**测速选最快**；`pnpm dlx` 拉包本身不探测，见 `docs/ADA-MCP-接入手册.md` §5）：

| 变量 | 说明 |
|------|------|
| `npm_config_registry` | 本机 npm/pnpm 默认源；建议国内用户设置，加速 `dlx` / `npx` 拉包 |
| `ADA_NPM_PROXY_REGISTRY` | npm 代理探测主候选（默认 `https://registry.npmmirror.com`） |
| `ADA_PNPM_PROXY_REGISTRY` | pnpm 代理探测主候选（默认同上） |
| `ADA_REGISTRY_CANDIDATES` | 额外 registry，逗号分隔，与配置文件中候选合并后测速 |
| `PLAYWRIGHT_DOWNLOAD_HOST` | Playwright 浏览器 CDN（默认测速：`cdn.playwright.dev`、azureedge、npmmirror 等） |
| `ADA_PLAYWRIGHT_HOST_CANDIDATES` | 额外 Playwright CDN，逗号分隔 |
| `ADA_INSTALL_STRATEGY_TIMEOUT_MS` | npm/pnpm 装包超时（默认 `120000`） |
| `ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS` | `playwright install` 超时（默认 `900000`） |

配置文件 `config/default.yaml` → `dependencies.npmRegistryCandidates` 默认含阿里云(npmmirror)、腾讯云、华为云、npm 官方（按优先级测速）；**无需配置环境变量即可探测**。MCP npm 包无工作区时使用内置同序列表（见 `packages/install-deps`）。

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
- `--only` 支持：`all`、`playwright`、`mobile`、`android`、`ios`、`harmony`、`drivers`。

分步安装（提速/排障推荐）：

```bash
./ada-agent install-deps --only=playwright
./ada-agent install-deps --only=android
./ada-agent install-deps --only=ios
./ada-agent install-deps --only=harmony
./ada-agent install-deps --only=mobile
```

**语义说明**：

- `--only=playwright`：安装/检查 Playwright npm 包与浏览器运行时。
- `--only=android|ios|harmony|mobile|drivers`：**环境/工具链检查**（`adb`、xcrun/WDA、`hdc`、`hypium-driver` 等），写入 `installedDrivers` / `failedDrivers` 摘要；**不会**安装 Appium、Selenium 或中心化移动 Server。
- `doctor` 与 `install-deps` 的移动检查范围不同：`doctor` 受 `monitoring.platforms` 控制（默认仅 `web`）；`require-real` / MCP 预检按**任务平台**探测运行时。

强制忽略阶段缓存重装：

```bash
./ada-agent install-deps --only=playwright --force
```

安装完成后会输出结构化摘要（JSON），包含：

- `scope`：本次安装范围
- `installedPackages` / `skippedPackages`：包安装结果
- `requestedDrivers` / `installedDrivers` / `skippedDrivers` / `failedDrivers`：运行时组件（浏览器、hdc、adb、xcrun）检查结果
- `summaryLines`：面向 GUI/Web 的中文摘要行（如「已就绪: Playwright 浏览器」）
- `bestNpmRegistry` / `bestPlaywrightDownloadHost`：测速后写入 state 的镜像地址
- `elapsedMs`：耗时

`install-deps` 执行后会自动做基础自检：

- Playwright 浏览器启动自检（headless about:blank）
- 移动运行时检查（`adb` / `xcrun` / `hdc`）
- `hypium-driver` 包可用性检查

若自检失败，请按 3.3 章节进行分项手动安装与排查。

阶段缓存文件：

- `.ada-agent/deps-install-state.json`

### 3.3 手动分项安装（Playwright / Mobile）

若需要分别安装并控制版本，可在 Agent 运行目录手动执行：

#### 3.3.1 安装移动驱动依赖

```bash
./ada-agent install-deps --only=mobile
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

当前版本采用 **ada-agent 实现 + agent-core 导出 + 多入口适配**：

- `apps/ada-agent`：核心业务实现（依赖安装、doctor、任务执行、Web 控制台等）
- `packages/agent-core`：对外稳定导出层，供 MCP/GUI 统一 import
- `packages/install-deps`：依赖安装实现（npm/浏览器/hdc、`InstallSummary`）；`packages/runtime-probe`：adb/WDA 等运行时探针
- 入口程序：
  - `ada-agent`：CLI 入口（命令行运维与任务执行）
  - `ada-mcp`：MCP 入口（经 stdio 供 MCP Host / 大模型客户端调用）
  - `ada-gui`：桌面 GUI 入口（原生窗口）
  - Web 控制台：`ada-agent` 子命令 / 内嵌页面（`web-console.ts`，可打包为 `ada-web.exe`）

说明：

- `health / doctor / install-deps / setup / start / run` 由 `agent-core` 导出，实现位于 `apps/ada-agent`。
- 多入口只负责协议、交互与展示差异，不重复实现业务流程。
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

移动链路探活任务：

```bash
./ada-agent run --file=tasks/demo.tasks.json
```

仓库内任务样例仅保留 `demo.tasks.json`、`web-real.tasks.json`；其它场景请自建 `.tasks.json` 或通过 MCP `ada_run_task_file` 调用。

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

#### MCP Host 配置（研发环境，对应 `npm run mcp:dev`）

在支持 MCP 的客户端中配置本地 stdio：将下列 JSON 写入该 Host 要求的 MCP 配置文件（路径因产品而异，常见为项目级或用户级 `mcp.json`）。

**说明：**

- 使用 `command` + `args` 启动，为 **stdio 模式**，**不需要** API Key 或 OAuth。
- `cwd` 必须为 ADA **仓库根目录**（含 `package.json` 且定义了 `mcp:dev` 脚本）；勿填用户主目录，否则会出现 `Missing script: "mcp:dev"` 或找不到 `cli.ts`。
- 将配置中的 `D:\\WORKSPACE\\PLAN\\ada` 替换为本机实际仓库路径（注意大小写，如 `ada` / `ADA`）。
- 保存后请在 MCP Host 中重新加载该服务器配置（或重启客户端）。

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
- `doctor`：综合诊断（依赖、端口、队列目录、移动运行时连通性）
  - 包含 Playwright 浏览器可启动性检查
  - 包含 native bootstrap 命令可达性检查（启用时）
  - 包含 Java 运行时检查（`java -version`、`JAVA_HOME`），用于 Android UIA2 场景
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
- `dependencies.playwrightDownloadHost`：Playwright 浏览器 CDN 默认值（`https://cdn.playwright.dev`）；`playwrightHostCandidates` 含官方 CDN、azureedge、npmmirror 等，install-deps 时测速选取
- 移动驱动通过 `driver-android` / `driver-ios` / `driver-harmony` 插件配置，不再使用中心化 Server URL
- `transport.mode`：`auto | stream | http`（默认 `auto`，优先 stream 失败自动回退 http）
- `transport.streamProtocol`：当前支持 `websocket`
- `transport.requestPath` / `transport.healthPath` / `transport.streamPath`：远程执行与健康检查路径
- `transport.requestTimeoutMs`：远程请求超时
- `monitoring.enabled`：是否开启操作监控（Web/App）
- `monitoring.platforms`：平台范围（默认 `["web"]`）；`doctor` 仅对列表内平台做 adb/xcrun/hdc 等硬性检查，纯 Web 场景保持 `["web"]` 即可
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

若需单独验证移动链路基础可用性，可执行：

```bash
./ada-agent run --file=tasks/demo.tasks.json
```

若任务报 `require-real check failed`，说明当前执行路径回退到了 mock，
请先完成依赖安装与环境连通（`install-deps`、`doctor`）后重试。

`require-real` 失败信息已结构化输出，重点字段如下：

- `summary.dependencyMissing`：缺失依赖（如 `playwright` / `hypium-driver`）
- `summary.browserNotLaunchable`：Playwright 已安装但浏览器无法拉起
- `summary.mobileRuntimeUnready`：移动端运行时不可达（adb/xcrun/hdc）
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

### 8.5 移动驱动真实任务执行失败

请按顺序检查：

1. Android：`adb devices`；iOS：`xcrun` / WDA；Harmony：`hdc list targets`
2. 设备是否已连接并可被对应驱动识别
3. 任务 JSON 中 capabilities 是否匹配目标设备
4. 使用 `doctor` 检查移动运行时连通性
5. 使用 `demo.tasks.json` 先确认基础可用性
6. Android 场景额外检查 Java：
   - `java -version` 可执行
   - `doctor` 中 `checks.javaRuntime.ok=true`
   - 建议配置 `JAVA_HOME`

### 8.7 HarmonyOS NEXT 环境准备与排障

Harmony 真实执行前，请确认：

1. 设备可被 `hdc list targets` 识别
2. `hypium-driver` 已安装（可执行 `install-deps --only=harmony`）
3. `hdc` 可达且设备在线
4. 任务或能力参数中使用：
   - `platformName: harmonyos`
   - `automationName: harmonyos`

推荐验证顺序：

```bash
./ada-agent install-deps --only=harmony
# 鸿蒙真实动作见 plugins/driver-harmony 的 smoke:real，或自建 tasks/*.tasks.json
```

常见问题：

- `SESSION_CREATE_FAILED`：优先检查 `hdc` 与 `hypium-driver` 是否安装
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
