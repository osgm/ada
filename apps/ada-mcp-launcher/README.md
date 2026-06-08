# @ada-mcp/launcher

启动器：**零 npm 依赖**；探测最快 npm 镜像后，经 **pnpm dlx** 或 **npx -y** 拉起 `@ada-mcp/mcp-server`。

## 标准 MCP 配置

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "pnpm",
      "args": ["dlx", "@ada-mcp/launcher@0.1.75"]
    }
  }
}
```

命令行：

```bash
pnpm dlx @ada-mcp/launcher@0.1.75
```

npx 等价：

```bash
npx -y @ada-mcp/launcher@0.1.75
```

**npx 示例**：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": ["-y", "@ada-mcp/launcher@0.1.75"]
    }
  }
}
```

## 版本

- **使用**：`pnpm dlx @ada-mcp/launcher` 或 `@ada-mcp/launcher@0.1.75` 均可；不写 `@x.y.z` 时拉 npm **latest**（推荐生产环境钉版本）。
- **发布**：每次 `npm publish` 前必须在 `package.json` **递增 version**；不能重复发布同一版本。
- **0.1.44**：修复 `package.json` UTF-8 BOM 导致 JSON 解析失败；内联 download-probe，去掉未发布的 `@ada/download-probe` 依赖。
- **0.1.45**：Windows + `npx` 回退路径中 `npm install` 经 `cmd.exe /c` 执行，修复 `spawn EINVAL`。
- **0.1.46**：harmony 驱动、内联 registry/playwright 探测脚本等同号发布。
- **0.1.47**：MCP 21 工具与参数 schema 描述优化（`title` + 中英 `description`，便于 AI 客户端识别）。
- **0.1.48**：所有驱动与 MCP 工具默认真实执行（mock 仅 `allowMock: true` 或 `payload.mock: true`）；Harmony 不再要求显式 `real: true`。
- **0.1.49**：文档与 Host 配置示例版本同步；接入手册补充默认真实执行与排障说明。
- **0.1.50**：MCP 启动时自动设置 `ADA_TOOLS_DIR`/`HDC_HOME` 为工作区 `tools/`（含 hdc 探测与 PATH）；鸿蒙无需在 Host 中手写工具目录（仍可用 `cwd` 或 env 覆盖）。
- **0.1.51**：`install-deps --only=harmony` 自动下载 hdc（默认 `raw.githubusercontent.com/osgm/ada/main/tools/hdc.exe`）；支持 ZIP 解压与 GitHub blob 链接转 raw；失败时提示手动下载。
- **0.1.62**：下载测速优化——registry/Playwright **并行**探测、可配置超时；`ADA_MCP_FAST_START` 缩短 npx 冷启动并跳过 preinstall 测速，缓解 Host 60s 握手超时。
- **0.1.63**：默认输出 registry/Playwright 测速与 install-deps 日志；修复 Mac `/tools` 路径；Playwright 浏览器目录自动发现；依赖安装失败降级为 warn。
- **0.1.64**：外层 npx 自动对齐内层 runner；registry 测速文件锁 + 写入 `deps-install-state` 避免 bootstrap 重复测速；并发 launcher 跳过重复探测；Windows UTF-8 日志；mcp-server 首启装依赖期间忽略 stdin-close 释放会话。

## 可选环境变量

| 变量 | 说明 |
|------|------|
| `ADA_MCP_PACKAGE_RUNNER` | `pnpm` \| `npx` \| `auto`（默认）：`auto` 时优先识别 Host 的 **npx / pnpm dlx**（日志 `outer=npx runner=npx`） |
| `ADA_MCP_OUTER_RUNNER` | 只读：launcher 传给子进程的 Host 启动方式（`npx` / `pnpm` / `node`） |
| `ADA_MCP_REGISTRY` | 强制 npm registry（跳过测速），如 `https://registry.npmmirror.com/`；**勿**使用 `pnpm dlx --registry`（pnpm 不支持） |
| `ADA_MCP_FAST_START` / `ADA_MCP_QUICK_START` | **默认开启**（子进程自动注入）：3 镜像并行 ≤5s、跳过 preinstall、pin launcher 版本 |
| `ADA_MCP_SLOW_START` | `1` 关闭快速握手 |
| `ADA_MCP_ALLOW_BOOTSTRAP_ALL` | `1` 保留 `--install-deps=all`（默认降为 playwright） |
| `ADA_MCP_FORCE_NPX` | `1` 强制 Windows 走 npx 回退（默认：有缓存用 npx，否则 npx 安装） |
| `ADA_MCP_WINDOWS_PREFER_PNPM` | `1` 无缓存时优先 `pnpm dlx`（默认不用，避免镜像未同步时快速失败） |
| （Windows npx 回退） | 首次 `npm install` 写入 `~/.ada/mcp-server-run/<pkgSpec>/`，之后复用缓存 |
| `ADA_MCP_SKIP_PREINSTALL_PROBE` | `1` 时跳过 mcp-server preinstall 测速 |
| `ADA_PROBE_DOWNLOAD_TIMEOUT_MS` | 单次 Range 测速超时（ms） |
| `ADA_MCP_REGISTRY_PROBE_MAX_MS` | 并行 registry 测速整轮上限（ms） |
| `ADA_MCP_SERVER_VERSION` | 覆盖 mcp-server 版本；**未设置时**从所选 registry 读取 **`latest`**。低于 launcher 包版本会被抬高 |
| `ADA_MCP_LOG_LEVEL` | 默认 **`info`**（测速、安装进度）；仅要错误时设 `error`，或 `ADA_MCP_QUIET=1` |
| `ADA_MCP_LOG_INFO_STDERR` | `1` 时 info 仍写 stderr（部分 Host 会标成 error；**默认 info 写 stdout**） |
| `ADA_MCP_SKIP_REGISTRY_PROBE` | `1` 时跳过测速（用候选列表第一项） |
| `ADA_MCP_REGISTRY_PROBE_TTL_MS` | 测速缓存有效期（默认 **3600000**，即 1 小时） |
| `ADA_MCP_REGISTRY_PROBE_CACHE_FILE` | 覆盖缓存路径（默认 `~/.ada/launcher-registry-probe.json`） |
| `ADA_MCP_INSTALL_DEPS` 等 | 写在 `args` 末尾，传给 mcp-server（见 `@ada-mcp/mcp-server` README） |

## 与直接 `dlx @ada-mcp/mcp-server` 的区别

| 方式 | 拉 MCP 包 | 安装 playwright 等 |
|------|-----------|-------------------|
| **`pnpm dlx @ada-mcp/launcher@0.1.75`**（标准） | launcher 测速 + `.npmrc` → `pnpm dlx` mcp-server | mcp-server preinstall + bootstrap |
| **`npx -y @ada-mcp/launcher@0.1.75`** | 同上 → **`npx -y` mcp-server** | 同上 |
| `pnpm dlx @ada-mcp/mcp-server@0.1.75` | 本机默认源 | 有 preinstall / bootstrap 测速 |
| `npx -y @ada-mcp/mcp-server@0.1.75` | 无 launcher 测速 | 有 preinstall / bootstrap 测速 |

内置 registry 测速候选（仅 3 个，并行 ≤5s）：**npmmirror（阿里）** → **华为云** → **npmjs 官网**。默认 **快速握手**（`ADA_MCP_SLOW_START=1` 恢复完整测速）。
