# @ada/e2e-kit

ADA 驱动 E2E 通用脚手架（**不包含任何 App/业务内置 preset**）。

## 何时用 e2e-kit vs 示例脚本

| 场景 | 推荐 |
|------|------|
| 学习 MCP 语义、快速改步骤 | [`scripts/examples/`](../scripts/examples/README.md) + [`scripts/lib/ada-client.mjs`](../scripts/lib/ada-client.mjs) |
| CI 报告、`summary.json`、失败自动 dump | 本包 `createE2eHarness` |
| profile / CLI 解析 | 本包 `resolveE2eTarget` |

京东学习示例（流利 API，非 harness）：

```bash
npm run test:jd-web
npm run test:jd-android    # 需真机 + ADA_ANDROID_APP_ID
npm run test:jd-harmony    # 需 hdc
```

## 目标解析

`resolveE2eTarget({ cwd, loadDefaultConfig })` 合并：

1. `config/default.yaml` 的 `appProfiles`（可选）
2. `ADA_APP_PROFILES_FILE` / profile 名
3. 环境变量
4. `overrides`

### CLI（与 env 并存，CLI 优先）

```bash
npx tsx scripts/examples/jd-android-e2e.mjs
# 或自建脚本引用 createE2eHarness：
npx tsx my-harness-script.mjs \
  --profile example \
  --app-id com.example.app \
  --session-id my-session \
  --search-text hello \
  --ui-heuristics-json '{"searchEntryLabels":["搜索"]}'
```

| 参数 | 环境变量 |
|------|----------|
| `--profile` | `ADA_APP_PROFILE` |
| `--profiles-file` | `ADA_APP_PROFILES_FILE` |
| `--app-id` | `ADA_*_APP_ID` |
| `--session-id` | `ADA_E2E_SESSION_ID` |
| `--search-text` | `ADA_E2E_SEARCH_TEXT` |
| `--command-timeout-ms` | `ADA_COMMAND_TIMEOUT_MS` |

## Harness

- `summary.json` 含 `recipePhase`、`recipeErrorCode`、`nodeCount`
- `ADA_E2E_AUTO_DUMP_ON_FAIL`（默认 true）：失败步骤自动 `dump_ui`
- `ADA_WAIT_UNTIL=ui_stable`：步骤间智能等待

## 脚本对照

| 路径 | 说明 |
|------|------|
| `scripts/examples/jd-*-e2e.mjs` | **推荐学习**：流利 API，扁平 ~80 行 |

可选依赖：`js-yaml`（读 YAML profile）。
