# ADA 文档索引

## 文档分类

| 文档 | 读者 | 内容 |
|------|------|------|
| [`ADA-架构设计方案.md`](ADA-架构设计方案.md) | 架构 / 研发负责人 | 分层边界、模块职责、演进路线 |
| [`ADA-部署手册.md`](ADA-部署手册.md) | 运维 / 实施 | 安装、启动、依赖、排障与发布验证 |
| [`ADA-MCP-接入手册.md`](ADA-MCP-接入手册.md) | MCP 集成方 | 工具列表、Host 配置、镜像与环境变量 |
| [`ADA-开发手册.md`](ADA-开发手册.md) | 研发 / 测试 | 本地开发、测试门禁、驱动规范 |
| [`ADA-语义命令对照.md`](ADA-语义命令对照.md) | 脚本 / MCP 集成 | L0 流利 API ↔ MCP 工具 ↔ 语义命令 |
| [`ADA-GUI-操作手册.md`](ADA-GUI-操作手册.md) | 终端用户（Windows 发布包） | 四个 `.exe` 的用途与配置 |
| [`Playwright-ADA-兼容映射.md`](Playwright-ADA-兼容映射.md) | MCP / 自动化迁移 | Playwright 步骤到 ADA MCP 的映射 |

整体架构示意图见 [`ADA-架构设计方案.md`](ADA-架构设计方案.md) 第 3 节「总体架构」；可视化蓝图见仓库根目录 [`canvases/ada-architecture-blueprint.canvas.tsx`](../canvases/ada-architecture-blueprint.canvas.tsx)（与 §17.1 驱动执行层一致）。**实现**在 `apps/ada-agent`，**对外能力导出**在 `packages/agent-core`。

## 使用建议

1. 先读架构，再看部署；按角色阅读 MCP 接入手册或开发手册。
2. 命令类内容以部署手册 / 开发手册为准，避免在架构文档重复维护。
3. 接口与工具定义以 MCP 接入手册为准，避免在其他文档重复粘贴工具表。

## 维护原则

- 架构文档不写细粒度命令步骤。
- 部署文档不展开底层设计推导。
- MCP 文档不重复通用部署说明。
- 开发文档不重复线上运维操作。
- **npm 发布 `@ada-mcp/*`**：以 [`scripts/README.md`](../scripts/README.md) 为准，不在此重复维护发布步骤。
