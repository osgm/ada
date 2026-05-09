# ADA MCP 接入手册

本文说明如何将 `ada-agent` 能力通过 MCP 对外暴露，供大模型像调用 Playwright MCP 一样调用 Web 与移动端能力。

Playwright 用例直接兼容映射请见：`docs/Playwright-ADA-兼容映射.md`。

## 文档边界说明

- 本文档只覆盖 MCP 工具、入参、示例调用与联调前置。
- 部署启动与运维流程请看 `ADA-部署手册.md`。
- 架构边界与分层设计请看 `ADA-架构设计方案.md`。
- 开发规范与测试门禁请看 `ADA-开发手册.md`。

---

## 1. 服务说明

当前 MCP 服务入口：

- 工作区包：`@ada/mcp-server`
- 启动命令：`npm run mcp:dev`
- 传输方式：stdio（适配 MCP Host）

---

## 2. 可用工具（Tools）

`ada-mcp-server` 当前暴露以下工具（MCP 工具 `name` 统一为 `ada_` + 蛇形命名，与下列一致）：

- `ada_health`：读取 Agent 健康快照
- `ada_diagnostics`：读取 Agent 综合诊断报告
- `ada_plugins`：读取内置驱动插件能力清单
- `ada_config`：读取当前有效配置
- `ada_install_deps`：安装运行依赖（playwright/appium/drivers）
- `ada_start_once`：以 `start --once` 模式执行一次队列处理
- `ada_execute`：执行一条标准 ADA 命令
- `ada_web_action`：便捷执行 Web 动作（driver-playwright）
- `ada_mobile_action`：便捷执行移动端动作（driver-appium）
- `ada_run_task_file`：执行任务文件
- `ada_batch_actions`：批量执行动作（单次请求内多步）
- `ada_extract`：页面数据提取（text/list/table）
- `ada_assertions`：断言助手（visible/text/url）
- `ada_mobile_extract`：移动端数据提取（text/pageSource）
- `ada_mobile_assertions`：移动端断言助手（visible/text）
- `ada_risk_policy`：高风险动作白名单管理

`ada_batch_actions` 的每个 action 支持：

- `timeoutMs`：单步超时（毫秒）
- `retry`：失败重试次数（0 表示不重试）

`ada_batch_actions` 顶层策略支持：

- `onFailure`：`stop | continue`
- `continueOnError`：兼容旧参数；建议优先使用 `onFailure`

批量返回包含 `summary`：

- `total` / `executed`
- `successCount` / `failureCount` / `timeoutCount`
- `stoppedOnFailure`

说明：`ada_execute` / `ada_web_action` / `ada_mobile_action` / `ada_run_task_file` / `ada_batch_actions` 默认是**严格真实执行**，若需要允许 mock 回退可传 `allowMock: true`。
高风险动作（如 `custom`、`launchApp`、`terminateApp`）默认需 `riskApproved=true`，可通过 `ada_risk_policy` 管理白名单。
上述 4 个执行类工具也支持可选 `monitor` 参数（单次调用监控开关），用于按调用粒度抓取监控截图。

当前动作覆盖（第一阶段增强）：

- Web：`navigate`、`click`、`hover`、`type`、`press`、`select`、`scroll`、`forward`、`newTab`、`switchTab`、`uploadFile`、`dragDrop`、`wait`、`assertVisible`、`assertText`、`getText`、`screenshot`、`back`、`reload`、`closeTab`、`custom`
- App（Android/iOS/Harmony）：`click`、`type`、`swipe`、`wait`、`assertVisible`、`assertText`、`getText`、`screenshot`、`back`、`home`、`launchApp`、`terminateApp`、`custom`

---

## 3. 示例调用

### 3.1 执行 Web 点击

工具：`ada_web_action`

输入示例：

```json
{
  "command": "click",
  "sessionId": "mcp-web-session-1",
  "monitor": {
    "enabled": true,
    "onFailureOnly": true,
    "groupBySession": true,
    "nonBlocking": true,
    "maxWidth": 1280,
    "maxHeight": 720,
    "keepAspectRatio": true
  },
  "payload": {
    "url": "https://example.com",
    "headless": false,
    "locator": {
      "text": "More information"
    }
  }
}
```

`monitor` 字段说明：

- `enabled`：是否启用本次调用监控
- `outputDir`：监控输出目录（默认 `artifacts/monitoring/mcp`）
- `onFailureOnly`：仅失败抓图，性能更优
- `groupBySession`：按 `sessionId/requestId` 分层归档
- `nonBlocking`：监控异步执行，不阻塞本次工具调用响应
- `maxWidth/maxHeight/keepAspectRatio`：监控分辨率与不变形策略

说明：

- 本地可视化验证时建议设置 `payload.headless=false`
- 若不传该字段，默认走无头模式（可用环境变量 `ADA_PLAYWRIGHT_HEADLESS=false` 全局关闭）

### 3.2 执行移动端截图（Android）

工具：`ada_mobile_action`

输入示例：

```json
{
  "platform": "android",
  "command": "screenshot",
  "sessionId": "mcp-mobile-session-1",
  "payload": {
    "real": true,
    "serverUrl": "http://127.0.0.1:4723",
    "capabilities": {
      "platformName": "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": "Android"
    }
  }
}
```

### 3.3 执行任务文件

工具：`ada_run_task_file`

输入示例：

```json
{
  "file": "tasks/web-real.tasks.json"
}
```

### 3.3.1 执行移动端截图（HarmonyOS NEXT）

工具：`ada_mobile_action`

输入示例：

```json
{
  "platform": "harmony",
  "command": "screenshot",
  "sessionId": "mcp-harmony-session-1",
  "payload": {
    "real": true,
    "serverUrl": "http://127.0.0.1:4723",
    "capabilities": {
      "platformName": "harmonyos",
      "appium:automationName": "harmonyos"
    }
  }
}
```

### 3.4 本地验证（App / 探活 + 可选真机）

不连设备、不启 Appium Server 时，可验证 MCP 与 Appium CLI 探活：

```bash
npm run test:mcp:app
```

本机已启动 Appium、已连设备/模拟器时，可额外走真实截图一次（`allowMock` 仍建议先为 `true` 联调，再关）：

```bash
node scripts/mcp-app-verify.mjs --real
```

### 3.5 安装依赖（MCP 内触发）

工具：`ada_install_deps`

输入示例：

```json
{
  "only": "playwright",
  "force": false
}
```

说明：

- `only` 可选：`all` / `playwright` / `mobile` / `android` / `ios` / `harmony` / `appium` / `drivers`
- `force=true` 时会强制重装对应范围

### 3.6 单次启动队列处理（MCP 内触发）

工具：`ada_start_once`

输入示例：

```json
{
  "localDev": false,
  "skipDeps": false
}
```

说明：

- 该工具执行一次 `start --once`，不会进入 `--watch` 常驻模式
- 适合在 MCP 编排中做“单轮拉取 + 执行”任务

### 3.7 移动端提取与断言（新增）

提取页面源码（Android 示例）：

```json
{
  "tool": "ada_mobile_extract",
  "arguments": {
    "platform": "android",
    "sessionId": "mcp-mobile-session-1",
    "type": "pageSource",
    "riskApproved": true
  }
}
```

提取返回统一结构：

- `items`：提取结果数组
- `meta`：`count/requestId/success/errorCode/errorMessage`
- `truncated`：是否因 `maxItems` 截断

断言文本（Harmony 示例）：

```json
{
  "tool": "ada_mobile_assertions",
  "arguments": {
    "platform": "harmony",
    "sessionId": "mcp-harmony-session-1",
    "type": "text",
    "payload": {
      "locator": { "accessibilityId": "search_input" },
      "expectedText": "搜索"
    }
  }
}
```

---

### 3.8 远程模式接入（HTTP + Token）

`ada-mcp` 新增远程模式，可通过可执行程序直接启动：

```bash
ada-mcp-win.exe server --host=127.0.0.1 --port=8787 --api-key=your_token --allow-risky=true --risky-mode=whitelist --risky-commands=custom,launchApp
```

说明：

- `--host`：监听地址，默认 `127.0.0.1`
- `--port`：监听端口，默认 `8787`
- `--api-key`：鉴权 Token，必填
- `--allow-risky`：高风险总开关，默认 `false`
- `--risky-mode`：风险命令策略，`whitelist` 或 `blacklist`，默认 `whitelist`
- `--risky-commands`：风险命令列表（逗号分隔），默认 `custom`

双模式说明：

- 白名单模式（推荐）：仅允许 `risky-commands` 列表中的风险命令
- 黑名单模式：禁止 `risky-commands` 列表中的风险命令
- 当 `allow-risky=false` 时，风险命令一律拒绝（总闸门优先）

可用接口：

- `GET /health`：健康检查（无需鉴权）
- `GET /status`：远程服务状态（无需鉴权）
- `GET /sessions`：当前活跃会话列表（需鉴权）
- `POST /tool/call`：工具调用（需鉴权）

`/status` 额外返回运行统计字段（便于压测与巡检）：

- `uptimeMs`：运行时长
- `totalRequests`：总请求数
- `toolCalls`：工具调用次数
- `authFailures`：鉴权失败次数
- `lastRequestAt`：最近请求时间戳
- `lastToolName`：最近一次调用的工具名

鉴权方式（二选一）：

- Header `x-api-key: your_token`
- Header `Authorization: Bearer your_token`

调用示例：

```bash
curl -X POST "http://127.0.0.1:8787/tool/call" ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: your_token" ^
  -d "{\"name\":\"ada_health\",\"arguments\":{}}"
```

---

### 3.9 npm / pnpm 在线安装（npx / dlx）

`ada-mcp` 支持作为 npm 包直接运行（stdio 本地模式）：

```bash
npx -y @ada/mcp-server
```

```bash
pnpm dlx @ada/mcp-server
```

Cursor MCP 配置示例（本地 stdio，无需鉴权）：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": ["-y", "@ada/mcp-server"]
    }
  }
}
```

如果要发布 npm 包（维护者）：

```bash
npm run mcp:pack:dry-run
npm run mcp:publish:dry-run
# 正式发布
npm publish --workspace=@ada/mcp-server --access public
```

---

## 4. 环境前置

建议先执行：

```bash
npm run install:deps
npm run health
npm run doctor
```

如果需要真实移动端执行，还需确保：

- Appium Server 已启动
- 设备已连接
- `appium.requiredDrivers` 中驱动安装完成

---

## 5. 常见问题

- `ada_web_action` 返回 mock：说明当前回退了 mock，请先检查 `install-deps` 与 `doctor`。
- `ada_mobile_action` 失败：优先检查 Appium Server 连通性、capabilities、设备连接状态。
- MCP 无输出：确认 MCP Host 使用 stdio 模式启动并指向 `npm run mcp:dev`。
