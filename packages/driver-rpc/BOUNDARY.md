# @ada/driver-rpc 模块边界

`driver-rpc` 是 **命令信封归一化 + 跨端共享算法** 层，不是第二个 MCP 或第二个 mobile-ui。

## 职责

| 层 | 模块示例 | 用途 |
|----|----------|------|
| 契约 | `normalize-command`, `normalizeInvokePayload` | `CommandEnvelope` 字段别名与 recipe 展开 |
| Web | `web-engine`, `web-interaction-recipe` | viewTree / clickPath 共享逻辑（MCP + driver-playwright 复用） |
| Mobile | `mobile-recipes`, `mobile-view-tree`, `fill-search-*` | UI dump、tap_path、搜索 recipe |
| 手势 | `swipe-coords`, `pinch-*`, `harmony-gesture` | 坐标/时长解析，供 driver 插件消费 |

## 非职责

- **不** 直接启动浏览器或连接真机（由 `plugins/driver-*` 完成）
- **不** 实现 MCP 工具分发或 recovery 策略（`apps/ada-mcp-server`）
- **不** 替代 `@ada/mobile-ui` 的 hierarchy 解析（仅 re-export 必要类型/函数供 recipe 使用）

## 发布说明

`driver-playwright` 等 bundled `.cjs` 会内联部分 recipe 副本——属零依赖发布策略，与 monorepo 源码保持同步即可。

新能力优先加在 **语义清晰的子模块**，避免继续膨胀 `index.ts` 的 barrel export；MCP/脚本侧只 import 所需子路径。
