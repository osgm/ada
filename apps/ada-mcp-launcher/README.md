# @ada-mcp/launcher

启动器：**零 npm 依赖**；探测最快 npm 镜像后，经 **pnpm dlx** 或 **npx -y** 拉起 `@ada-mcp/mcp-server`。

## 标准 MCP 配置

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

命令行：

```bash
pnpm dlx @ada-mcp/launcher@0.1.50
```

npx 等价：

```bash
npx -y @ada-mcp/launcher@0.1.50
```

**npx 示例**：

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

## 版本

- **使用**：`pnpm dlx @ada-mcp/launcher` 或 `@ada-mcp/launcher@0.1.51` 均可；不写 `@x.y.z` 时拉 npm **latest**（推荐生产环境钉版本）。
- **发布**：每次 `npm publish` 前必须在 `package.json` **递增 version**；不能重复发布同一版本。
- **0.1.44**：修复 `package.json` UTF-8 BOM 导致 JSON 解析失败；内联 download-probe，去掉未发布的 `@ada/download-probe` 依赖。
- **0.1.45**：Windows + `npx` 回退路径中 `npm install` 经 `cmd.exe /c` 执行，修复 `spawn EINVAL`。
- **0.1.46**：harmony 驱动、内联 registry/playwright 探测脚本等同号发布。
- **0.1.47**：MCP 21 工具与参数 schema 描述优化（`title` + 中英 `description`，便于 AI 客户端识别）。
- **0.1.48**：所有驱动与 MCP 工具默认真实执行（mock 仅 `allowMock: true` 或 `payload.mock: true`）；Appium/Harmony 不再要求显式 `real: true`。
- **0.1.49**：文档与 Host 配置示例版本同步；接入手册补充默认真实执行与排障说明。
- **0.1.50**：MCP 启动时自动设置 `ADA_TOOLS_DIR`/`HDC_HOME` 为工作区 `tools/`（含 hdc 探测与 PATH）；鸿蒙无需在 Host 中手写工具目录（仍可用 `cwd` 或 env 覆盖）。
- **0.1.51**：`install-deps --only=harmony` 自动下载 hdc（默认 `raw.githubusercontent.com/osgm/ada/main/tools/hdc.exe`）；支持 ZIP 解压与 GitHub blob 链接转 raw；失败时提示手动下载。

## 可选环境变量

| 变量 | 说明 |
|------|------|
| `ADA_MCP_PACKAGE_RUNNER` | `pnpm` \| `npx` \| `auto`（默认）：拉取 mcp-server 用的包管理器；`auto` 时与外层一致 |
| `ADA_MCP_REGISTRY` | 强制 npm registry（跳过测速），如 `https://registry.npmmirror.com/`；**勿**使用 `pnpm dlx --registry`（pnpm 不支持） |
| `ADA_MCP_SERVER_VERSION` | 覆盖 mcp-server 版本；**未设置时**从所选 registry 读取 **`latest`**。低于 launcher 包版本会被抬高 |
| `ADA_MCP_SKIP_REGISTRY_PROBE` | `1` 时跳过测速 |
| `ADA_MCP_INSTALL_DEPS` 等 | 写在 `args` 末尾，传给 mcp-server（见 `@ada-mcp/mcp-server` README） |

## 与直接 `dlx @ada-mcp/mcp-server` 的区别

| 方式 | 拉 MCP 包 | 安装 playwright 等 |
|------|-----------|-------------------|
| **`pnpm dlx @ada-mcp/launcher@0.1.51`**（标准） | launcher 测速 + `.npmrc` → `pnpm dlx` mcp-server | mcp-server preinstall + bootstrap |
| **`npx -y @ada-mcp/launcher@0.1.51`** | 同上 → **`npx -y` mcp-server** | 同上 |
| `pnpm dlx @ada-mcp/mcp-server@0.1.51` | 本机默认源 | 有 preinstall / bootstrap 测速 |
| `npx -y @ada-mcp/mcp-server@0.1.51` | 无 launcher 测速 | 有 preinstall / bootstrap 测速 |

内置 registry 测速候选顺序（相同时靠前优先）：**npmmirror（阿里）** → npmjs → 腾讯 → 上海交大 → 中科大 → 华为云。
