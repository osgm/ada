# ADA MCP 插件配置说明

Cursor / JoyCode 等 MCP Host 的 **`mcp.json` 字段注解**（含可选参数取值范围）。工具语义、调用示例见 [`ADA-MCP-接入手册.md`](ADA-MCP-接入手册.md)；环境变量 canonical 列表见 [`ADA-MCP-环境变量.md`](ADA-MCP-环境变量.md)。

| 主题 | 文档 |
|------|------|
| 工具 / 接入流程 | [`ADA-MCP-接入手册.md`](ADA-MCP-接入手册.md) |
| 环境变量 | [`ADA-MCP-环境变量.md`](ADA-MCP-环境变量.md) |
| 研发 stdio 示例 | [`../config/mcp.cursor.example.json`](../config/mcp.cursor.example.json) |

> JSON 本身不支持注释。本文用字段表说明「填什么、范围、含义」；复制到 Host 时请去掉说明性段落，只保留合法 JSON。

---

## 1. 配置文件位置

| 范围 | 路径（Cursor） | 说明 |
|------|----------------|------|
| 全局 | `~/.cursor/mcp.json`（Windows：`%USERPROFILE%\.cursor\mcp.json`） | 所有工作区可用 |
| 项目 | `<repo>/.cursor/mcp.json` | 仅当前项目；**同名 server 时项目级覆盖全局** |

根对象只有一个字段：`mcpServers`（`Record<serverName, ServerConfig>`）。`serverName` 建议字母数字 / `-` / `_`，勿重复。

---

## 2. 传输类型 `type`

| 取值 | 必填性 | 何时使用 | 解释 |
|------|--------|----------|------|
| `"stdio"` | 有 `command` 时可省略，建议显式写 | 本机拉起进程 | Cursor 管理生命周期，走 stdin/stdout |
| `"http"` | 有 `url` 时可省略，建议显式写 | 远程 Streamable HTTP | 多用户 / 已部署 MCP 服务 |
| `"sse"` | 同上 | 远程 SSE | 提供方仅暴露 SSE 端点时 |

**互斥规则**：一条 server 配置应走 **stdio（`command`）** 或 **远程（`url`）** 之一，不要混写两套必填字段。

---

## 3. STDIO 字段（本地插件）

| 字段 | 必填 | 类型 | 取值范围 / 填法 | 解释 |
|------|------|------|-----------------|------|
| `type` | 建议 | string | 仅 `"stdio"` | 标明传输 |
| `command` | **是** | string | PATH 命令或绝对路径：`npx` / `node` / `pnpm` / `python` / `docker` / `C:\\...\\exe` | 启动 MCP 的可执行文件 |
| `args` | 否 | `string[]` | 任意字符串数组；顺序由该 MCP CLI 决定 | 传给 `command` 的参数 |
| `env` | 否 | `Record<string,string>` | key=变量名；value=字面量或插值（§5） | 注入子进程；密钥优先 `${env:NAME}` |
| `envFile` | 否 | string | 相对/绝对路径，如 `"${workspaceFolder}/.env"` | **仅 stdio**；从文件加载更多环境变量 |
| `cwd` | 否 | string | 已存在的目录；可用 `${workspaceFolder}` | 工作目录；源码相对路径 / 写本地状态时需要。云端 Agent stdio **不支持** `cwd` |

### 3.1 历史 / 非官方字段（部分 Host 仍认）

| 字段 | 取值范围 | 解释 |
|------|----------|------|
| `disabled` | `true` \| `false` | 是否禁用该 server；Cursor 现更推荐 Customize 开关 |
| `autoApprove` | `string[]`（工具名）或 `[]` | 免确认工具列表；现更推荐 Agent Approvals / `permissions.json` |

---

## 4. HTTP / SSE 字段（远程插件）

| 字段 | 必填 | 类型 | 取值范围 / 填法 | 解释 |
|------|------|------|-----------------|------|
| `type` | 建议 | string | `"http"` 或 `"sse"` | 标明传输 |
| `url` | **是** | string | `http(s)://host[:port]/path` | MCP 端点；HTTP 常见 `/mcp`，SSE 常见 `/sse` |
| `headers` | 否 | `Record<string,string>` | 合法 HTTP 头；常见 `Authorization`、`X-Api-Key` | 每次请求携带；密钥用插值 |
| `auth` | 否 | object | 见 §4.1 | 静态 OAuth（提供方不支持动态客户端注册时） |
| `env` / `envFile` | — | — | **远程无效，勿依赖** | 用 `headers` + `${env:...}` |

### 4.1 `auth` 子字段

| 字段 | 必填 | 取值范围 | 解释 |
|------|------|----------|------|
| `CLIENT_ID` | **是** | 提供方发放的 Client ID；可 `${env:...}` | 静态 OAuth 客户端 ID |
| `CLIENT_SECRET` | 否 | 机密客户端 secret；可 `${env:...}` | 公开客户端可省略 |
| `scopes` | 否 | `string[]`，如 `["read","write"]`；省略则走服务端 `scopes_supported` | 需 refresh 时常加提供方要求的 `offline_access` |

**Cursor OAuth 回调**（在提供方应用中登记）：

- Web / Agents：`https://www.cursor.com/agents/mcp/oauth/callback`
- Desktop：`http://localhost:8787/callback`

---

## 5. 配置插值

可用于：`command`、`args`、`env`、`url`、`headers`、`auth` 内字符串。

| 写法 | 取值来源 | 解释 |
|------|----------|------|
| `${env:NAME}` | 本机环境变量 `NAME` | 密钥、token；未设置可能导致鉴权失败 |
| `${userHome}` | 用户主目录 | 跨机路径 |
| `${workspaceFolder}` | 含 `.cursor/mcp.json` 的项目根 | 项目相对脚本 / `.env` |
| `${workspaceFolderBasename}` | 项目根目录名 | 标识 / 日志 |
| `${pathSeparator}` / `${/}` | `\` 或 `/` | 拼跨平台路径 |

---

## 6. 完整结构示例（三种传输）

```json
{
  "mcpServers": {
    "local-stdio": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "D:/data"],
      "cwd": "${workspaceFolder}",
      "envFile": "${workspaceFolder}/.env",
      "env": {
        "API_KEY": "${env:API_KEY}",
        "LOG_LEVEL": "info"
      }
    },
    "remote-http": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MCP_TOKEN}"
      },
      "auth": {
        "CLIENT_ID": "${env:MCP_CLIENT_ID}",
        "CLIENT_SECRET": "${env:MCP_CLIENT_SECRET}",
        "scopes": ["read", "write"]
      }
    },
    "remote-sse": {
      "type": "sse",
      "url": "https://api.example.com/sse",
      "headers": {
        "Authorization": "Bearer ${env:MCP_TOKEN}"
      }
    }
  }
}
```

**可选字段怎么选：**

- `type`：三选一 `stdio` | `http` | `sse`
- `args`：无 Cursor 级枚举，填该 MCP 文档规定的 CLI
- `cwd`：任意可读目录；空则用 Host 默认 cwd（Mac 上可能落到 `/`，注意写文件权限）
- `envFile`：仅 stdio；文件必须存在且为 dotenv 文本
- `headers.Authorization`：常见 `Bearer <token>` 或 `Basic <base64>`
- `auth.scopes`：提供方文档中的 scope 名，不是 Cursor 自定义枚举

---

## 7. `ada-mcp` Host 配置

本节推荐 **自动跟随 npm `latest`**（不钉 semver）。每次 Host 拉起时由 `npx`/`pnpm dlx` 解析 registry 上的最新 `@ada-mcp/launcher`；launcher 默认再拉 **同号** `@ada-mcp/mcp-server`。稳定复现/生产请改回 `@ada-mcp/launcher@<semver>`（见接入手册文首）。

### 7.1 推荐配置（自动最新版，可直接粘贴）

**最小可用配置**（可不写 `env`）。未设置时服务端按下列默认处理：

| 行为 | 未设 env 时的默认 | 说明 |
|------|-------------------|------|
| `ADA_MCP_HIDE_ADVANCED` | **`0`（显示 T3）** | 暴露 `ada_invoke` / `ada_risk_policy` |
| `ADA_MCP_DESC_MODE` | **`advanced`** | 长工具说明；要短描述再显式设 `compact` |
| `ADA_PLAYWRIGHT_HEADLESS` | **`false`（有头）** | 本地可见浏览器；CI 再设 `true` |

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@ada-mcp/launcher@latest",
        "--install-deps=playwright"
      ]
    }
  }
}
```

国内镜像（可选，只加 registry）：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@ada-mcp/launcher@latest",
        "--install-deps=playwright"
      ],
      "env": {
        "ADA_MCP_REGISTRY": "https://registry.npmmirror.com"
      }
    }
  }
}
```

等价写法（不加 tag，同样解析 registry **latest**）：

```json
"args": ["-y", "@ada-mcp/launcher", "--install-deps=playwright"]
```

#### 7.1.1 字段注解（对应上表逐项）

| 路径 | 必填 | 本例取值 | 可选取值范围 | 解释 |
|------|------|----------|--------------|------|
| `mcpServers` | 是 | 对象 | 多个 server 名 → 配置 | Host 根对象 |
| `mcpServers["ada-mcp"]` | 是 | 对象 | key 建议 `ada-mcp`（字母数字/`-`/`_`） | 在 Cursor Customize 中显示的服务器名 |
| `command` | 是（stdio） | `"npx"` | `npx` / `pnpm` / `node` 等 PATH 命令或绝对路径 | 启动进程；Windows 亦可用 `npx.cmd` |
| `args` | 否 | 见下表 | 字符串数组，顺序有意义 | 传给 `command` 的参数 |
| `args[0]` | — | `"-y"` | `npx` 专用：`-y` / `--yes`；`pnpm dlx` 时不需要 | 同意临时安装包，避免交互确认卡住 Host |
| `args[1]` | — | `"@ada-mcp/launcher@latest"` | `@ada-mcp/launcher@latest` / `@ada-mcp/launcher`（自动最新）；或 `@ada-mcp/launcher@<semver>`（钉版本） | **本例自动取 registry latest**；内层 mcp-server 默认与 launcher 同号。可用 `ADA_MCP_SERVER_VERSION` 单独覆盖内层版本。**勿用 0.1.73 / 0.1.74** |
| `args[2]` `--install-deps` | 否 | `"--install-deps=playwright"` | 写法：`--install-deps=<scope>` 或 `--install-deps <scope>`。`<scope>` ∈ `playwright` / `mobile` / `android` / `ios` / `harmony` / `drivers` / `all`；可逗号组合（如 `playwright,mobile`）；`none` / `skip` 跳过。另可用开关 `--skip-install-deps`（等同 skip） | **启动时装依赖**。`playwright`= Playwright npm 包 + 浏览器；`mobile`/`android`/`ios`/`harmony`= 对应移动链；`drivers`= 仅移动工具链/驱动检查；`all`= Web+移动全量（易超 Host ~60s 握手，默认常被降为 `playwright`，需 `ADA_MCP_ALLOW_BOOTSTRAP_ALL=1` 才保留）。未写且未设 env 时默认倾向 `playwright`。与 `env.ADA_MCP_INSTALL_DEPS` **等价，勿重复冲突**；依赖已就绪后可改 `--skip-install-deps` 或启动后调 `ada_install_deps` |
| `env` | 否 | （最小配置可省略） | 任意 `string → string`；ada 常用键见 §7.4 | 注入 launcher / mcp-server；**不写时**上述三项行为仍按 `0` / `advanced` / `false` |
| `env.ADA_MCP_REGISTRY` | 否 | （可选） | 合法 npm registry URL | **强制**安装源并跳过测速；国内可写 `https://registry.npmmirror.com` |
| `env.ADA_MCP_HIDE_ADVANCED` | 否 | 未设 → **`0`** | `"0"` 显示 T3；`"1"` 隐藏 | 未设即显示 T3；仅当要隐藏时再写 `"1"`。脚本 `connectMcp()` 常注入 `1`，与 Host 不同 |
| `env.ADA_MCP_DESC_MODE` | 否 | 未设 → **`advanced`** | `advanced` / `full`（长）；`compact` / `short`（短 + 精简 schema） | 未设即长描述；要省 ListTools token 显式 `"compact"`（约可再省一半 schema） |
| `env.ADA_PLAYWRIGHT_HEADLESS` | 否 | 未设 → **`false`** | `"true"` 无头；`"false"` 有头 | 未设即有头可见；CI 再写 `"true"` |

**`--install-deps` 常用组合示例：**

| `args` 片段 | 适用场景 |
|-------------|----------|
| `"--install-deps=playwright"` | 仅 Web（本例默认） |
| `"--install-deps=playwright,mobile"` | Web + 移动通用依赖 |
| `"--install-deps=android"` / `ios` / `harmony` | 单端移动 |
| `"--install-deps=drivers"` | 仅驱动/工具链检查 |
| `"--install-deps=all"` | 全量（需配合 `ADA_MCP_ALLOW_BOOTSTRAP_ALL=1`，否则易被降级） |
| `"--install-deps=none"` 或 `"--skip-install-deps"` | 跳过启动安装 |

本例**未写**但常用的可选字段：

| 路径 | 可选取值范围 | 解释 |
|------|--------------|------|
| `type` | `"stdio"`（可省略，有 `command` 即推断） | 显式标明本地进程传输 |
| `cwd` | 已存在目录路径，或 `${workspaceFolder}` | 工作目录；纯 `npx launcher` 通常可不设；源码开发见 §7.2 |
| `envFile` | 如 `"${workspaceFolder}/.env"` | 从文件加载更多 env（仅 stdio） |
| `env.ADA_MCP_INSTALL_DEPS` | 同 `--install-deps=` 的 `<scope>` 集合 | **env 等价写法**；已在 `args` 写了 `--install-deps` 时不必再设 |
| `env.ADA_MCP_SKIP_INSTALL_DEPS` | `"1"` | 跳过启动安装（优先于 install-deps） |
| `env.ADA_MCP_ALLOW_BOOTSTRAP_ALL` | `"1"` | 允许启动时装 `all`；默认会把 `all` 降为 `playwright` 以优先握手 |
| `env.ADA_MCP_SERVER_VERSION` | 合法 semver，如 `0.1.90` | 仅覆盖内层 mcp-server 版本；launcher 仍跟 latest 时慎用 |
| `env.ADA_MCP_SLOW_START` | `"1"` | 关闭默认快速握手，完整 registry 测速 / latest 查询 |
| `env.ADA_MCP_LOG_LEVEL` | `info` / `error` 等 | 日志详细度；静默可用 `ADA_MCP_QUIET=1` |

`pnpm` 等价写法（同样自动 latest；`env` 可省略）：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "pnpm",
      "args": [
        "dlx",
        "@ada-mcp/launcher@latest",
        "--install-deps=playwright"
      ]
    }
  }
}
```

> 注意：
> - `pnpm dlx --registry URL ...` **无效**；要用镜像时设 `ADA_MCP_REGISTRY`（或本机 npmrc）。
> - `@latest` 以 **当前 registry 上的 latest** 为准；镜像落后时请改 `https://registry.npmjs.org/`。
> - 需要可复现构建时改为钉版本，例如 `"@ada-mcp/launcher@0.1.90"`。
> - `--install-deps` 与 `ADA_MCP_INSTALL_DEPS` 只保留一处，避免互相覆盖难排查。
> - 未写 `HIDE_ADVANCED` / `DESC_MODE` / `HEADLESS` 时，运行时按 **`0` / `advanced` / `false`** 处理。

### 7.2 本仓库源码开发

见 [`../config/mcp.cursor.example.json`](../config/mcp.cursor.example.json)：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": [
        "tsx",
        "apps/ada-mcp-server/src/cli.ts",
        "--skip-install-deps"
      ],
      "cwd": "D:/WORKSPACE/PLAN/ada",
      "env": {
        "ADA_MCP_SKIP_INSTALL_DEPS": "1",
        "ADA_PLUGIN_DIR": "D:/WORKSPACE/PLAN/ada/apps/ada-mcp-server/plugins"
      }
    }
  }
}
```

`cwd` 必须是 ADA **仓库根**（含 `package.json`）；`ADA_PLUGIN_DIR` 指向插件目录绝对路径。

### 7.3 `args` / 启动相关取值范围

| 项 | 可选取值范围 | 解释 |
|----|--------------|------|
| `--install-deps=` | `playwright` / `mobile` / `android` / `ios` / `harmony` / `drivers` / `all`；可逗号组合；或 `none` / `skip` | 启动时装依赖；**勿轻易 `all`**（易超 Host ~60s 握手） |
| 未配置 install-deps | 默认倾向 `playwright` | 见接入手册 §1.3 |
| `--skip-install-deps` | 开关参数 | 跳过启动安装；等同 `ADA_MCP_SKIP_INSTALL_DEPS=1` |

### 7.4 常用 `env` 取值范围（ada）

| 变量 | 可选取值 / 填法 | 解释 |
|------|-----------------|------|
| `ADA_MCP_REGISTRY` | 合法 npm registry URL，如 `https://registry.npmjs.org/`、`https://registry.npmmirror.com` | **强制**安装源，跳过测速 |
| `ADA_MCP_SKIP_INSTALL_DEPS` | `1` | 跳过启动时装依赖 |
| `ADA_MCP_INSTALL_DEPS` | 同 `--install-deps=` 取值集合 | 环境变量形式指定安装范围 |
| `ADA_MCP_HIDE_ADVANCED` | 未设=**`0`**；`"1"` 隐藏 | 控制 `ada_invoke` / `ada_risk_policy` |
| `ADA_MCP_TOOL_VISIBILITY` | `hide` / `1` / `primary-only` | 上项别名 |
| `ADA_MCP_DESC_MODE` | 未设=**`advanced`**；`compact`/`short` 短描述 | 工具描述长短 |
| `ADA_MCP_VERBOSE_RESULT` | `1` | 返回完整 `CommandResult` |
| `ADA_MCP_SLIM_RESULT` | `0` | 显式关闭 slim（等同 verbose） |
| `ADA_MCP_FAST_START` / `ADA_MCP_QUICK_START` | 默认开启 | 快速握手 |
| `ADA_MCP_SLOW_START` | `1` | 关闭快速握手，完整测速 |
| `ADA_MCP_ALLOW_BOOTSTRAP_ALL` | `1` | 允许 args 中 `--install-deps=all` 不被降级 |
| `ADA_MCP_PACKAGE_RUNNER` | `pnpm` \| `npx` \| `auto` | 包运行器 |
| `ADA_MCP_LOG_LEVEL` | 如 `info` / `error` | 日志级别；静默可用 `ADA_MCP_QUIET=1` |
| `ADA_PLAYWRIGHT_HEADLESS` | 未设=**`false`**；CI 用 `"true"` | 浏览器无头 |
| `ADA_PLUGIN_DIR` | 插件目录绝对路径 | 源码/自定义插件加载路径 |

完整变量与别名见 [`ADA-MCP-环境变量.md`](ADA-MCP-环境变量.md)；启动超时与镜像策略见接入手册 §1.4、§6。

### 7.5 远程 HTTP（自建 ada-mcp HTTP）

```json
{
  "mcpServers": {
    "ada-mcp-remote": {
      "type": "http",
      "url": "http://127.0.0.1:8787/mcp",
      "headers": {
        "Authorization": "Bearer ${env:ADA_MCP_API_KEY}"
      }
    }
  }
}
```

端口、鉴权与部署细节见接入手册远程章节与 [`ADA-部署手册.md`](ADA-部署手册.md)。

---

## 8. 配置检查清单

1. `mcpServers` 下每个 server 只有一套传输（`command` **或** `url`）。
2. stdio：`command` 在 PATH 中可执行；需要相对路径时设 `cwd`。
3. 密钥放 `${env:...}` 或 `envFile`，不要提交明文到仓库。
4. `ada-mcp` 首启：优先钉版本 + `ADA_MCP_REGISTRY`；避免 `--install-deps=all`。
5. 改完配置后在 Host 中 **重新加载 MCP** 或重启客户端；排障看 Output → MCP Logs。

---

## 9. 维护说明

- Host 通用字段（`type` / `command` / `url` / `auth` 等）以 [Cursor MCP 文档](https://cursor.com/docs/mcp) 为准。
- `ada-mcp` 的 CLI / env 取值以本仓库接入手册与环境变量文档为准，本文只收录 Host 配置常用子集。
- 示例 JSON 路径变更时，同步更新 `config/mcp.cursor.example.json` 与本节链接。
