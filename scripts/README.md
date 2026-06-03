# scripts 目录

本目录按职责分子目录，避免根目录脚本混杂。

```text
scripts/
├── README.md、脚本清单.md     # 说明与索引
├── build/                     # ADA 构建与工程工具
├── release/                   # npm 发布校验与发布包冒烟
├── test/                      # 仓库级自动化测试
├── lib/                       # ada-client.mjs + ada_client.py 等共用库
└── examples/                  # 学习 / 联调 E2E（只写步骤，引用 ../lib）
    ├── jd-*-e2e.mjs
    ├── python/、compare/
    └── dev/
```

| 子目录 | 读者 | 说明 |
|--------|------|------|
| [`build/`](build/) | 维护者 | 打包 exe、MCP npm、生成内嵌配置、同步 probe |
| [`release/`](release/) | 维护者 | 版本校验、`test:mcp:bundled` |
| [`test/`](test/) | 维护者 / CI | Agent 冒烟、exe 验收、开发排障 |
| [`lib/`](lib/README.md) | 学习者 | 示例共用：`ada` / `fluent` / `popups` |
| [`examples/`](examples/README.md) | 学习者 | 京东 E2E 薄脚本、Python 对照 |

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

**版本号必须一致**：`@ada-mcp/mcp-server` 与 `@ada-mcp/launcher` 的 `package.json` → `version` **必须相同**。发布前执行 `npm run mcp:check:versions` 校验。

**发布顺序**：先 **mcp-server**，再 **launcher**。

### 本目录涉及的发布脚本（`build/` + `release/`）

| 脚本 | 何时执行 | 作用 |
|------|----------|------|
| [`build/generate-bundled-config.mjs`](build/generate-bundled-config.mjs) | mcp-server `prebuild` / `build:npm` 前 | 从 `config/default.yaml` 生成内嵌配置 |
| [`build/build-mcp-npm.mjs`](build/build-mcp-npm.mjs) | 发布前 | esbuild 打包 `dist/cli.cjs` 与驱动插件 |
| [`release/mcp-bundled-smoke.mjs`](release/mcp-bundled-smoke.mjs) | 构建后、发布前 | stdio 连接 `dist/cli.cjs` 冒烟 |
| [`release/check-mcp-publish-versions.mjs`](release/check-mcp-publish-versions.mjs) | 发布前 | 校验两包 `version` 相同 |
| [`build/sync-download-probe-vendor.mjs`](build/sync-download-probe-vendor.mjs) | 改 `download-probe` 后（手工） | 同步内联脚本到 launcher / mcp-server |

`apps/ada-mcp-server` 的 **`prepublishOnly`** 会自动再跑一遍 `npm run build:npm`。

### 根目录 npm 脚本（发布相关）

| 命令 | 说明 |
|------|------|
| `npm run mcp:check:versions` | 校验 mcp-server / launcher 版本号一致 |
| `npm run mcp:pack:dry-run` | 在 mcp-server 包内 `build:npm` + `npm pack --dry-run` |
| `npm run build:npm -w @ada-mcp/mcp-server` | 仅构建发布产物（不发布） |
| `npm run test:mcp:bundled` | 发布包冒烟 |
| `npm run mcp:dev` | 开发态启动 mcp-server（`tsx src/cli.ts`，非 tarball） |

### 推荐发布命令（仓库根目录）

```powershell
npm run typecheck
npm run mcp:pack:dry-run
npm run build:npm -w @ada-mcp/mcp-server
npm run test:mcp:bundled

cd apps/ada-mcp-server
npm publish --access public --registry https://registry.npmjs.org/

cd ../ada-mcp-launcher
npm publish --access public --registry https://registry.npmjs.org/
```

更完整的 Host 配置、国内镜像与排障见 [`docs/ADA-MCP-接入手册.md`](../docs/ADA-MCP-接入手册.md) §1 与 §5。

---

## 其它脚本

| 类别 | 路径 | npm script |
|------|------|------------|
| 可执行文件 | `build/build-executable.mjs` | `build:exe` |
| Agent E2E | `test/e2e-smoke.mjs` | `test:e2e:smoke*` |
| exe 验收 | `test/verify-entrypoints.mjs` | `test:entrypoints` |
| 京东示例 | `examples/jd-*-e2e.mjs` | `test:jd-web` / `test:jd-android` / `test:jd-harmony` |

完整清单见 [`脚本清单.md`](脚本清单.md)。示例说明见 [`examples/README.md`](examples/README.md)。
