# @ada-mcp/launcher

零依赖启动器：探测最快 npm 镜像后，用 **pnpm dlx** 或 **npx -y** 拉起 `@ada-mcp/mcp-server`（同一套 registry 测速与 `.npmrc`）。**0.1.18+** 修复 Windows 上 `spawn EINVAL`；**0.1.27** 抬高最低 mcp-server 版本并统一文档。

## 标准 Cursor / MCP 配置

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

命令行：

```bash
pnpm dlx @ada-mcp/launcher@0.1.27
```

npx 等价（launcher 内部同样测速后使用 **`npx -y` 安装 mcp-server**，与外层一致）：

```bash
npx -y @ada-mcp/launcher@0.1.27
```

Cursor（npx）：

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

## 版本号

- **使用**：`pnpm dlx @ada-mcp/launcher` 与 `@ada-mcp/launcher@0.1.27` 均可；不写 `@x.y.z` 时拉 npm **latest**（推荐生产环境钉版本）。
- **发布**：每次 `npm publish` 前必须在 `package.json` **递增 version**；不能重复发布同一版本。

## 可选环境变量

| 变量 | 说明 |
|------|------|
| `ADA_MCP_PACKAGE_RUNNER` | `pnpm` \| `npx` \| `auto`（默认）：拉起 mcp-server 用的包管理器；`auto` 时与外层一致（npx 起 launcher → 内层 npx，pnpm dlx → 内层 pnpm） |
| `ADA_MCP_SERVER_VERSION` | 覆盖 mcp-server 版本；**未设置时**从所选 registry 读取 **`latest`**（与 `pnpm dlx @ada-mcp/mcp-server` 一致）。低于 `0.1.27` 会被抬高 |
| `ADA_MCP_SKIP_REGISTRY_PROBE` | `1` 时跳过测速 |
| `ADA_MCP_INSTALL_DEPS` 等 | 写在 `args` 末尾，传给 mcp-server（见 `@ada-mcp/mcp-server` README） |

## 与直接 `dlx @ada-mcp/mcp-server` 的区别

| 方式 | 拉 MCP 包 | 安装 playwright 等 |
|------|-----------|-------------------|
| **`pnpm dlx @ada-mcp/launcher@0.1.27`**（标准） | launcher 测速 + `.npmrc` → `pnpm dlx` mcp-server | mcp-server preinstall + bootstrap |
| **`npx -y @ada-mcp/launcher@0.1.27`** | 同上 → **`npx -y` mcp-server** | 同上 |
| `pnpm dlx @ada-mcp/mcp-server@0.1.27` | 本机默认源 | 仅 preinstall / bootstrap 测速 |
| `npx -y @ada-mcp/mcp-server@0.1.27` | 无 launcher 测速 | 仅 preinstall / bootstrap 测速 |
