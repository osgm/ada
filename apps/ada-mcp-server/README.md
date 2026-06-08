# @ada-mcp/mcp-server

ADA MCP server package that supports:

- Local stdio mode (default) for MCP hosts
- Remote HTTP mode (`server`) with API key authentication
- MCP **Streamable HTTP** on `POST|GET|DELETE /mcp` with optional SSE per MCP spec (`@modelcontextprotocol/sdk` transport)

## 标准安装（MCP）

请使用 **`@ada-mcp/launcher@0.1.50`** 拉起本包（见 [launcher README](../ada-mcp-launcher/README.md)）：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "pnpm",
      "args": ["dlx", "@ada-mcp/launcher@0.1.50"]
    }
  }
}
```

本包版本：**`@ada-mcp/mcp-server@0.1.50`**（由 launcher 默认拉取；依赖锁定 `playwright@1.59.1`）。

直接调试本包（无 launcher 拉包前测速）：

```bash
pnpm dlx @ada-mcp/mcp-server@0.1.50
# npx 等价
npx -y @ada-mcp/mcp-server@0.1.50
```

## 启动时自动安装依赖（默认 Playwright）

进程启动前会按配置自动执行 `install-deps`（日志在 stderr）：

| 配置 | 含义 |
|------|------|
| （未配置） | 仅安装 **Playwright + 浏览器** |
| `playwright` | 装 Playwright（显式写法，与默认相同） |
| `mobile` | 装移动驱动依赖（Android/iOS 运行时检查 + Harmony 工具链） |
| `android` / `ios` / `harmony` | 按平台安装 |
| `playwright,mobile` | 组合（逗号连接多类） |
| `all` | Playwright + 移动驱动 + Harmony |
| `none` / `skip` | 不自动安装 |

**环境变量**

- `ADA_MCP_INSTALL_DEPS`：范围，如 `playwright`、`playwright,mobile`、`all`、`none`
- `ADA_MCP_SKIP_INSTALL_DEPS=1`：跳过自动安装
- `ADA_MCP_INSTALL_DEPS_FORCE=1`：强制重装
- `ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS`：每个 CDN 镜像的 `playwright install` 超时（默认 60 分钟）
- `ADA_INSTALL_STRATEGY_TIMEOUT_MS`：npm 装包超时（默认 2 分钟）

**依赖解析**：系统全局 npm → 工作区/环境 → `~/.ada/deps`；全局已装的不迁入共享目录。

## 代理与镜像

| 阶段 | 说明 |
|------|------|
| `pnpm dlx @ada-mcp/launcher` | 拉包前 registry 测速（推荐） |
| `pnpm dlx @ada-mcp/mcp-server` | 依赖安装、preinstall / `install-deps` 测速 |
| 启动后 `install-deps` | npm 与 Playwright CDN 候选测速 |

默认 npm 候选（相同时靠前）：**npmmirror（阿里）** → npmjs → 腾讯 → 上海交大 → 中科大 → 华为云。

| 变量 | 说明 |
|------|------|
| `npm_config_registry` | 可选；影响 **dlx** 拉包 |
| `ADA_REGISTRY_CANDIDATES` | 可选；在默认候选之外追加 |
| `ADA_NPM_PROXY_REGISTRY` / `ADA_PNPM_PROXY_REGISTRY` | 可选；探测时置顶 |
| `PLAYWRIGHT_DOWNLOAD_HOST` | 可选；Playwright 浏览器 CDN |

详见 [ADA-MCP-接入手册 §5](../../docs/ADA-MCP-接入手册.md#5-镜像与环境变量)。

**CLI 参数**（写在 MCP `args` 末尾）：

- `--install-deps=playwright,mobile`
- `--skip-install-deps`
- `--install-deps-force`
在标准 `args` 后追加，例如安装全部依赖：

```json
"args": ["dlx", "@ada-mcp/launcher@0.1.50", "--install-deps=all"]
```

## MCP Host 配置示例

**pnpm（推荐）**：`pnpm` + `dlx @ada-mcp/launcher@0.1.50`

**npx 等价**：`npx` + `-y @ada-mcp/launcher@0.1.50`（内层同样 `npx -y` mcp-server，测速逻辑与 pnpm 一致）

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": ["-y", "@ada-mcp/launcher@0.1.50"]
    }
  }
}
```

Windows 若找不到 `pnpm`，可将 `command` 改为 `pnpm.cmd` 绝对路径；无 pnpm 时只能直接 `npx -y @ada-mcp/mcp-server@0.1.50`（无 launcher 拉包测速）。

## Remote mode

Set API key in environment variable first:

```bash
export ADA_MCP_REMOTE_API_KEY=your_token
```

Windows PowerShell:

```powershell
$env:ADA_MCP_REMOTE_API_KEY="your_token"
```

Then run:

```bash
pnpm dlx @ada-mcp/mcp-server server --host=127.0.0.1 --port=8787 --allow-risky=true --risky-mode=whitelist --risky-commands=custom
```

### Streamable HTTP (`/mcp`)

- Endpoint: `http://<host>:<port>/mcp` — same API key headers as below (`x-api-key` or `Authorization: Bearer`).
- First request: `POST /mcp` with JSON-RPC `initialize` (no `Mcp-Session-Id`); server returns a session id in `Mcp-Session-Id` response header.
- Follow-up: `POST /mcp` with body + `Mcp-Session-Id`; for server-initiated streaming, open `GET /mcp` with `Accept: text/event-stream` and the same session header.
- Session teardown: `DELETE /mcp` with `Mcp-Session-Id`.

When listening on all interfaces (e.g. `--host=0.0.0.0`), set allowed Host headers to satisfy DNS rebinding checks:

```bash
pnpm dlx @ada-mcp/mcp-server server --host=0.0.0.0 --port=8787 --api-key=your_token --allowed-hosts=localhost,127.0.0.1
```
