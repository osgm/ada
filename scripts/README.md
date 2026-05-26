# scripts 目录

本目录脚本用于：**发布 `@ada-mcp/*` 到 [npmjs.org](https://www.npmjs.com/)**、发布前验证，以及 monorepo 内 E2E / MCP 联调。

| 文档 | 读者 | 内容 |
|------|------|------|
| **本文** | 维护者 | npm **发布流程**（必读） |
| [`脚本清单.md`](脚本清单.md) | 维护者 | 每个脚本的用途、npm 引用、删除影响 |
| [`docs/ADA-MCP-接入手册.md`](../docs/ADA-MCP-接入手册.md) §3.9 | 终端用户 | 安装、MCP Host 配置、镜像与排障 |
| [`apps/ada-mcp-launcher/README.md`](../apps/ada-mcp-launcher/README.md) | 终端用户 | `launcher` 的 Host JSON 示例 |

---

## 发布到 npmjs.org（维护者）

### 前置条件

- **Node.js ≥ 22**、**npm ≥ 10**（与根 `package.json` `engines` 一致）
- 已登录 npm 官方源：`npm login --registry https://registry.npmjs.org/`（或使用 `NPM_TOKEN` + CI）
- 对 scope `@ada-mcp` 有 **publish** 权限
- 本仓库根目录 `.npmrc` 默认指向**国内镜像**，**安装/发布到 npmjs 时必须显式 `--registry https://registry.npmjs.org/`**（见下方命令）

### 发布的包

| npm 包 | 源码目录 | 作用 |
|--------|----------|------|
| `@ada-mcp/mcp-server` | `apps/ada-mcp-server` | MCP 服务（`dist/cli.cjs` + `plugins/*.cjs`） |
| `@ada-mcp/launcher` | `apps/ada-mcp-launcher` | 零依赖启动器（registry 测速后 `dlx` 拉 mcp-server） |

**推荐用户入口**：`pnpm dlx @ada-mcp/launcher@<version>` 或 `npx -y @ada-mcp/launcher@<version>`（不写版本则安装 npm **latest**）。

**发布顺序**：先 **mcp-server**，再 **launcher**。launcher 通过 `MIN_MCP_SERVER_VERSION` 拉取已发布的 server；若 server 未上线就发 launcher，用户可能拉到旧 server 或解析失败。

### 本目录涉及的发布脚本

| 脚本 | 何时执行 | 作用 |
|------|----------|------|
| [`generate-bundled-config.mjs`](generate-bundled-config.mjs) | mcp-server `prebuild` / `build:npm` 前 | 从 `config/default.yaml` 生成内嵌配置 |
| [`build-mcp-npm.mjs`](build-mcp-npm.mjs) | 发布前 | esbuild 打包 `dist/cli.cjs` 与 `plugins/driver-{playwright,appium,selenium}.cjs` |
| [`mcp-bundled-smoke.mjs`](mcp-bundled-smoke.mjs) | 构建后、发布前 | stdio 连接 `dist/cli.cjs`：`ada_health` 为 ok、**3 个插件**已注册 |
| [`restore-workspace-src-main.mjs`](restore-workspace-src-main.mjs) | 发布后（可选） | 将 workspace 包 `main` 指回 `src`，便于本地开发 |

`apps/ada-mcp-server` 的 **`prepublishOnly`** 会自动再跑一遍 `npm run build:npm`（调用 `build-mcp-npm.mjs`）。

### 版本号要改哪里

发布前在仓库内**统一 bump**，并保持一致（当前示例版本 **0.1.28**）：

| 位置 | 说明 |
|------|------|
| `apps/ada-mcp-server/package.json` → `version` | mcp-server 包版本 |
| `apps/ada-mcp-launcher/package.json` → `version` | launcher 包版本（通常与 mcp-server 同号） |
| `apps/ada-mcp-launcher/launcher.mjs` → `MIN_MCP_SERVER_VERSION` | 内层拉取的 mcp-server **最低版本**（应与本次 server 版本一致） |
| `apps/ada-mcp-launcher/README.md`、接入手册中的 `@x.y.z` 示例 | 文档与 Host 配置示例 |
| `scripts/mcp-transport.mjs` 等里的默认版本（若有） | 本地联调默认值 |

npm **不允许**重复发布同一 `version`；若 `403` / `You cannot publish over the previously published version`，必须先改版本再 `publish`。

### 发布前检查清单

- [ ] `npm run typecheck` 通过
- [ ] `apps/ada-mcp-server` 与 `apps/ada-mcp-launcher` 的 `version` 已递增且两包同号
- [ ] `launcher.mjs` 中 `MIN_MCP_SERVER_VERSION` 与本次 mcp-server 版本一致
- [ ] `npm run mcp:pack:dry-run` 通过（查看 tarball 文件列表）
- [ ] `npm run test:mcp:bundled` 通过
- [ ] 使用 **`--registry https://registry.npmjs.org/`** 发布（勿依赖根 `.npmrc` 镜像）

### 根目录 npm 脚本（发布相关）

| 命令 | 说明 |
|------|------|
| `npm run mcp:pack:dry-run` | 在 mcp-server 包内 `build:npm` + `npm pack --dry-run` |
| `npm run build:npm -w @ada-mcp/mcp-server` | 仅构建发布产物（不发布） |
| `npm run test:mcp:bundled` | 发布包冒烟（见上表 `mcp-bundled-smoke.mjs`） |
| `npm run mcp:dev` | 开发态启动 mcp-server（`tsx src/cli.ts`，非 tarball） |

联调类（**不阻塞发布**，可选）：

| 命令 | 说明 |
|------|------|
| `npm run test:mcp:browser` | Web Chrome / 工作区 dev |
| `npm run test:mcp:firefox` | 本机 Firefox + Profile（Playwright） |
| `npm run test:mcp:firefox:selenium` | 同上（Selenium） |
| `npm run test:mcp:app` | App 真机（Node，local `cli.cjs`） |
| `npm run test:mcp:jd` | browser + app 组合 |

### 推荐发布命令（仓库根目录）

```powershell
# 0) 门禁
npm run typecheck
npm run mcp:pack:dry-run
npm run build:npm -w @ada-mcp/mcp-server
npm run test:mcp:bundled

# 1) 发布 mcp-server（prepublishOnly 会再次 build:npm）
cd apps/ada-mcp-server
npm publish --access public --registry https://registry.npmjs.org/

# 2) 发布 launcher（依赖上一步已上线的 server 版本）
cd ../ada-mcp-launcher
npm publish --access public --registry https://registry.npmjs.org/

# 3) 确认线上版本
npm view @ada-mcp/mcp-server version --registry https://registry.npmjs.org/
npm view @ada-mcp/launcher version --registry https://registry.npmjs.org/

# 4) 可选：从官方源试拉（需本机已装 pnpm 或 npx）
pnpm dlx @ada-mcp/launcher@<version> --help
```

在包目录内等价写法：

```powershell
npm run build:npm
npm publish --access public --registry https://registry.npmjs.org/
```

### 发布后（可选）

```powershell
# 恢复 monorepo 各包 main 指向 src（本地继续开发）
node scripts/restore-workspace-src-main.mjs
```

### 发布物说明

**`@ada-mcp/mcp-server`**（由 `apps/ada-mcp-server/package.json` 的 `files` 决定）：

| 路径 | 说明 |
|------|------|
| `dist/cli.cjs` | 单文件 MCP CLI（esbuild bundle） |
| `plugins/*.cjs` | playwright / appium / selenium 驱动 bundle |
| `scripts/preinstall-probes.mjs` 等 | `preinstall` 与镜像探测 |
| `README.md` | 包说明 |

**`@ada-mcp/launcher`**：`launcher.mjs`、`registry-probe.mjs`、`playwright-probe.mjs`、`README.md`。

**不包含** 本目录下的 Python/京东验证脚本；那些仅用于 monorepo 内联调（见 [`脚本清单.md`](脚本清单.md)）。

### 终端用户 vs 维护者

| 角色 | 做法 |
|------|------|
| 终端用户 | `pnpm dlx @ada-mcp/launcher@x.y.z`；Host 配置见接入手册 §3.9 |
| 维护者 | bump `version` → 官方 registry `npm publish` → 更新文档示例版本 |

### 常见问题

| 现象 | 处理 |
|------|------|
| 发布到了镜像而非 npmjs | 命令加 `--registry https://registry.npmjs.org/`；用 `npm view ... --registry` 核对 |
| `403` 版本已存在 | bump `package.json` 版本后重新发布 |
| `test:mcp:bundled` 失败 | 先 `npm run build:npm -w @ada-mcp/mcp-server`；检查 `dist/cli.cjs` 与 `plugins/` 是否存在 |
| launcher 拉到旧 server | 确认 `MIN_MCP_SERVER_VERSION` 与已发布的 server 版本；先发布 server |
| 需要 2FA | `npm publish` 时输入 OTP，或在 CI 使用 automation token |

更完整的 Host 配置、国内镜像与排障见 [`docs/ADA-MCP-接入手册.md`](../docs/ADA-MCP-接入手册.md) §3.9。

---

## 发布前本地验证（可选）

除 `test:mcp:bundled` 外，可在仓库根目录跑 MCP 联调（需 Python 时先安装依赖）：

```powershell
pip install -r scripts/requirements-mcp-verify.txt
npm run test:mcp:bundled          # 发布包 smoke（推荐，发布前必跑）
npm run test:mcp:browser          # Web Chrome（工作区 dev）
npm run test:mcp:app              # App 真机 Node（local cli.cjs）
```

脚本说明与「哪些可删」见 [`脚本清单.md`](脚本清单.md)。

---

## 其它脚本（非 npm 发布）

| 类别 | 示例 | 根目录 npm script |
|------|------|-------------------|
| 可执行文件 | `build-executable.mjs` | `build:exe` |
| Agent E2E | `e2e-smoke.mjs` | `test:e2e:smoke*` |
| exe 验收 | `verify-entrypoints.mjs` | `test:entrypoints` |

与 **npm 发布 `@ada-mcp/*` 无直接关系**；详见 [`脚本清单.md`](脚本清单.md)。
