# @ada/mobile-ui

通用移动端 UI 树解析与启发式定位（**无内置业务/App 预设**）。

## 能力

- `parseAndroidHierarchy(xml)` / `parseHarmonyLayoutJson(json)`
- `findUiNode(nodes, { role, screen, heuristics?, platform? })`
- `normalizedSwipePoints(screen, from, to, { relative?: true })` — 默认像素；`relative: true` 时按 0～1 比例

## 配置启发式（任选其一）

1. **payload**：`uiHeuristics` 或 `custom.heuristics`（由驱动传入 `findUiNode`）
2. **环境变量**：
   - `ADA_UI_HEURISTICS_JSON='{"searchEntryLabels":["搜索","search"]}'`
   - `ADA_UI_SEARCH_ENTRY_LABELS=search,query`
   - `ADA_UI_SEARCH_INPUT_LABELS=search,input`
   - `ADA_UI_HOME_TAB_LABELS=home,main`

默认仅使用英文通用关键词（`search`, `home`, `TextInput` 等）。
