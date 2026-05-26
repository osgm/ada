# scripts 目录说明

本目录存放构建、发布、E2E 与 **ada-mcp 验证** 脚本。按用途分类如下。

## ada-mcp 验证（推荐）

| 脚本 | 说明 |
|------|------|
| [`ada_mcp_jd_verify.py`](ada_mcp_jd_verify.py) | **Web 验证**（Python，Chrome）：京东 www.jd.com 打开 → Esc → 滚动 → 截图 |
| [`mcp_jd_firefox_verify.py`](mcp_jd_firefox_verify.py) | **Web 验证**（Python，Firefox）：本机 Firefox + 系统 Profile（历史缓存）打开京东并截图 |
| [`mcp-jd-app-verify.mjs`](mcp-jd-app-verify.mjs) | **App 真机验证**（Node）：京东 App 截图 → 右滑×2 → 再截图 |
| [`mcp_jd_app_verify.py`](mcp_jd_app_verify.py) | **App 真机验证**（Python，与上表 Node 版等价） |
| [`mcp-transport.mjs`](mcp-transport.mjs) | Node MCP stdio 传输封装（dev / local / npm） |
| [`requirements-mcp-verify.txt`](requirements-mcp-verify.txt) | Python Web 验证依赖（仅需 `mcp`） |
| [`mcp-bundled-smoke.mjs`](mcp-bundled-smoke.mjs) | 发布包 smoke：`dist/cli.cjs` + 插件是否加载 |

```powershell
# Web Chrome（Python）
pip install -r scripts/requirements-mcp-verify.txt
python scripts/ada_mcp_jd_verify.py --server dev

# Web Firefox 本地（Python，默认本机 Firefox + 系统 Profile）
# 运行前请先关闭已打开的 Firefox
python scripts/mcp_jd_firefox_verify.py --server local
npm run test:mcp:firefox

# App 真机（Node / Python，默认 --server local）
node scripts/mcp-jd-app-verify.mjs --server local
python scripts/mcp_jd_app_verify.py --server local
npm run test:mcp:app

# 推荐：先手动常驻 Appium（只开一个窗口，脚本不再反复拉起）
#   set APPIUM_HOME=D:\WORKSPACE\PLAN\ada\APPIUM_HOME
#   npx appium --address 127.0.0.1 --port 4723

npm run test:mcp:bundled
```

## ada-agent 任务（与 MCP 同驱动栈）

| 脚本 | 说明 |
|------|------|
| [`run-erp-jd-chrome-tasks.mjs`](run-erp-jd-chrome-tasks.mjs) | 执行 `tasks/erp-jd-chrome.tasks.json`（`npm run run:erp-jd-chrome`） |
| [`close-web-sessions.ts`](close-web-sessions.ts) | 关闭 Playwright 会话（被 run-erp 脚本调用） |

## 构建 / 配置 / 发布

| 脚本 | 说明 |
|------|------|
| [`build-mcp-npm.mjs`](build-mcp-npm.mjs) | 打包 `@ada-mcp/mcp-server`（cli.cjs + plugins） |
| [`build-executable.mjs`](build-executable.mjs) | 打 pkg 可执行文件（`npm run build:exe`） |
| [`generate-bundled-config.mjs`](generate-bundled-config.mjs) | 从 `config/default.yaml` 生成 bundled config |
| [`restore-workspace-src-main.mjs`](restore-workspace-src-main.mjs) | 发布前将 workspace 包 main 指回 `src`（维护用） |

## 仓库级测试

| 脚本 | 说明 |
|------|------|
| [`e2e-smoke.mjs`](e2e-smoke.mjs) | ada-agent 冒烟（`npm run test:e2e:smoke`） |
| [`verify-entrypoints.mjs`](verify-entrypoints.mjs) | 检查 `release/*.exe` 入口（`npm run test:entrypoints`） |
| [`bootstrap-native-mock.mjs`](bootstrap-native-mock.mjs) | 本地 bootstrap UI mock |

## 开发 / 性能（可选）

| 脚本 | 说明 |
|------|------|
| [`mcp-web-appium-perf.mjs`](mcp-web-appium-perf.mjs) | Web + Appium 性能采样（`ada_perf_summary`，需 `mcp:dev`） |

---

## 已移除的冗余脚本

以下脚本已与上表合并或重复，不再保留：

- `jd_homepage_e2e.py`、`erp_jd_chrome.py` → 改用 `ada_mcp_jd_verify.py` 或 `run-erp-jd-chrome-tasks.mjs`（无需 Python Playwright）
- `mcp-smoke.mjs`、`mcp-browser-verify.mjs`、`mcp-app-verify.mjs` → Web 用 `ada_mcp_jd_verify.py`，App 用 `mcp-jd-app-verify.mjs`
- `mcp-browser-ops-verify.mjs`、`mcp-jd-food-test.mjs` → 示例/专项用例，由主验证脚本 + Cursor 工具调用覆盖
- `rebundle-core.mjs` → 由 `build-executable.mjs` / `build:npm` 覆盖
