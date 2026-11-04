# ADA 文档索引

## 文档分类

| 文档 | 读者 | 内容 |
|------|------|------|
| [`ADA-使用说明手册.md`](ADA-使用说明手册.md) | **日常使用者（首选）** | 怎么操作：MCP、脚本、任务文件、CLI、Windows 四个 exe、脚本↔MCP 对照 |
| [`ADA-MCP-接入手册.md`](ADA-MCP-接入手册.md) | MCP 集成方 | 工具全表、调用示例、`mcp.json` 字段、环境变量与别名 |
| [`ADA-部署手册.md`](ADA-部署手册.md) | 运维 / 实施 | 发布包怎么装、常驻、依赖安装与发布验证 |
| [`ADA-开发手册.md`](ADA-开发手册.md) | 研发 / 测试 | 本地开发、测试门禁、驱动规范 |
| [`ADA-架构设计方案.md`](ADA-架构设计方案.md) | 架构 / 研发负责人 | 分层边界、模块职责、演进路线 |
| [`Playwright-ADA-兼容映射.md`](Playwright-ADA-兼容映射.md) | 从 Playwright 迁移 | Playwright 步骤到 ADA MCP 的映射 |

整体架构示意图见 [`ADA-架构设计方案.md`](ADA-架构设计方案.md) 第 3 节「总体架构」；可视化蓝图见仓库根目录 [`canvases/ada-architecture-blueprint.canvas.tsx`](../canvases/ada-architecture-blueprint.canvas.tsx)（与 §17.1 驱动执行层一致）。**实现**在 `apps/ada-agent`，**对外能力导出**在 `packages/agent-core`。

## 使用建议

1. 日常操作先读使用说明手册；要改架构或发布时再读架构、部署与开发手册。
2. 命令类内容以部署手册 / 开发手册为准，避免在架构文档重复维护。
3. 接口与工具定义以 MCP 接入手册为准，避免在其他文档重复粘贴工具表。

## 维护原则

- 使用说明手册写操作路径；工具全表、`mcp.json` 与环境变量只维护在 MCP 接入手册。
- Windows 发布包操作写在使用说明手册 §10.2，不再单列 GUI 手册。
- 架构文档不写细粒度命令步骤。
- 部署文档不展开底层设计推导。
- MCP 文档不重复通用部署说明。
- 开发文档不重复线上运维操作。
- **npm 发布 `@ada-mcp/*`**：以 [`scripts/README.md`](../scripts/README.md) 为准，不在此重复维护发布步骤。
