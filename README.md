# ADA 项目说明

ADA（AllDriverAgent）是一个统一自动化执行平台，当前采用“统一核心能力层 + 多入口适配层”架构，移动端基线支持 Android / iOS / HarmonyOS NEXT：

- `ada-agent`：CLI 入口
- `ada-mcp`：MCP服务 入口
- `ada-gui`：Tauri 原生 GUI 入口
- `ada-web`：WEB 控制台入口

核心能力统一在 `agent-core`，入口层只负责交互与协议适配。

## 运行环境要求

- Node.js：`>=22`（默认 Node.js 22）
- npm：`>=10`
- Java：OpenJDK 11（用于 Appium Android 场景）
- Appium：项目默认 `3+`（当前依赖 `^3.3.1`）

## 快速开始

```bash
npm install
npm run typecheck
npm run build:exe
```

构建完成后会自动执行四入口验收；也可手工执行：

```bash
npm run test:entrypoints
```

## 文档导航

- 架构与边界：`docs/ADA-架构设计方案.md`（含第 3 节总体架构图）
- 部署与运维：`docs/ADA-部署手册.md`
- MCP 接入：`docs/ADA-MCP-接入手册.md`
- npm 发布（scripts）：[`scripts/README.md`](scripts/README.md)
- 脚本清单：[`scripts/脚本清单.md`](scripts/脚本清单.md)
- 开发规范：`docs/ADA-开发手册.md`
- 文档索引：`docs/README.md`

## 常用命令

- 类型检查：`npm run typecheck`
- 构建可执行程序：`npm run build:exe`
- MCP 开发启动：`npm run mcp:dev`
- npm 发布前冒烟：`npm run test:mcp:bundled`（见 `scripts/README.md`）

## 产物说明

`npm run build:exe` 输出目录为 `release/`，包含：

- `ada-agent-*`
- `ada-mcp-*`
- `ada-web-*`
- `ada-gui-win.exe`（Windows 原生 GUI）

