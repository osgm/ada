# @ada-mcp/mcp-server

ADA MCP server package that supports:

- Local stdio mode (default) for MCP hosts
- Remote HTTP mode (`server`) with API key authentication
- MCP **Streamable HTTP** on `POST|GET|DELETE /mcp` (same port as legacy REST), with optional SSE per MCP spec (`@modelcontextprotocol/sdk` transport)

## 标准安装（Cursor / MCP）

请使用 **`@ada-mcp/launcher@0.1.27`** 拉起本包（见 [launcher README](../ada-mcp-launcher/README.md)）：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "pnpm",
      "args": ["dlx", "@ada-mcp/launcher@0.1.27"]
    }
  }
}
```

本包版本：**`@ada-mcp/mcp-server@0.1.27`**（由 launcher 默认拉取；依赖锁定 `playwright@1.59.1`）。

直接调试本包（无 launcher 拉包前测速）：

```bash
pnpm dlx @ada-mcp/mcp-server@0.1.27
# npx 等价：
npx -y @ada-mcp/mcp-server@0.1.27
```

## 启动时自动安装依赖（默认仅 Playwright）

进程启动前会按配置自动执行 `install-deps`（日志在 stderr）：

| 配置 | 含义 |
|------|------|
| （未配置） | 仅安装 **Playwright + 浏览器** |
| `playwright` | 仅 Playwright（显式写法，与默认相同） |
| `selenium` | **仅** Selenium 原生驱动（GeckoDriver/ChromeDriver） |
| `appium` | **仅** Appium 包 + 移动端驱动 |
| `playwright,selenium` | 组合（逗号连接多类） |
| `all` | 上述全部 |
| `none` / `skip` | 不自动安装 |

**环境变量**

- `ADA_MCP_INSTALL_DEPS`：范围，如 `playwright`、`playwright,selenium`、`all`、`none`
- `ADA_MCP_SKIP_INSTALL_DEPS=1`：跳过自动安装
- `ADA_MCP_INSTALL_DEPS_FORCE=1`：强制重装
- `ADA_MCP_GECKODRIVER_VERSION` / `ADA_MCP_CHROMEDRIVER_VERSION`：Selenium 驱动版本
- `ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS`：浏览器下载超时（默认 30 分钟 / 1800000ms）
- `ADA_INSTALL_STRATEGY_TIMEOUT_MS`：npm 装包超时（默认 2 分钟）

## 代理与镜像（`0.1.10+` 推荐）

| 阶段 | 自动探测最快镜像 |
|------|------------------|
| `pnpm dlx @ada-mcp/launcher` | **是** — 拉包前测速（推荐） |
| `pnpm dlx @ada-mcp/mcp-server` | tarball 仍走本机源；**同次安装的依赖**由 `preinstall` 测速（仅写入官方 Playwright CDN，`0.1.9+`） |
| 启动后 `install-deps` | 是 — 内置国内镜像测速（**无需配置**） |

默认 npm 探测候选（按优先级，延迟相同取靠前）：阿里云 npmmirror → 腾讯云 → 华为云 → npm 官方。

| 变量 | 说明 |
|------|------|
| `npm_config_registry` | 可选；仅加速 **dlx** 拉包（推荐 `https://registry.npmmirror.com`） |
| `ADA_REGISTRY_CANDIDATES` | 可选；在默认五镜像**之外**追加候选 |
| `ADA_NPM_PROXY_REGISTRY` / `ADA_PNPM_PROXY_REGISTRY` | 可选；覆盖探测主候选（默认 npmmirror） |
| `PLAYWRIGHT_DOWNLOAD_HOST` | 可选；Playwright 浏览器 CDN |

详见 [ADA-MCP-接入手册 §3.9.2](../../docs/ADA-MCP-接入手册.md#392-代理与镜像配置)。

**CLI 参数**（写在 MCP `args` 末尾）

- `--install-deps=playwright,selenium`
- `--skip-install-deps`
- `--install-deps-force`
- `--geckodriver-version=latest` `--chromedriver-version=match-chrome`

在标准 `args` 后追加，例如安装全部依赖：

```json
"args": ["dlx", "@ada-mcp/launcher@0.1.27", "--install-deps=all"]
```

## Cursor MCP 配置

**pnpm（推荐）**：`pnpm` + `dlx @ada-mcp/launcher@0.1.27`

**npx 等价**（`launcher@0.1.7+`）：`npx` + `-y @ada-mcp/launcher@0.1.27`（内层同样 `npx -y` mcp-server，测速逻辑与 pnpm 一致）

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": ["-y", "@ada-mcp/launcher@0.1.27"]
    }
  }
}
```

Windows 若找不到 `pnpm`，可将 `command` 改为 `pnpm.cmd` 绝对路径；无 pnpm 时只能直接 `npx -y @ada-mcp/mcp-server@0.1.27`（无 launcher 拉包测速）。

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
