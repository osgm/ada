# ADA 用户手册（Windows）

本文档仅说明发布包中 4 个可执行程序的用途与使用方法，不包含构建相关内容。

## 1. 可执行程序说明

- `ada-gui-win.exe`：桌面 GUI 程序（推荐日常使用入口）
- `ada-agent-win.exe`：Agent 核心入口（命令行模式）
- `ada-mcp-win.exe`：MCP 入口（供 MCP Host 接入）
- `ada-web-win.exe`：桌面 Web 程序（Web 控制台模式）

## 1.1 运行依赖说明（Node 22 / JDK）

### Node.js 22（建议同时 npm>=10）

以下场景需要安装：

- 在 GUI 中使用“安装依赖（Playwright / Appium / Drivers）”功能
- 需要本机执行 npm 相关安装/探测动作
- 需要直接运行仓库内脚本（开发/调试场景）

以下场景通常不强制要求：

- 仅使用已打包好的 `ada-gui-win.exe` / `ada-agent-win.exe` 做基础健康检查与常规操作
- 不在本机执行依赖安装步骤

### JDK（建议 JDK 8+）

以下场景需要安装：

- 使用 Android 设备 + Appium（UiAutomator2）执行真实移动端操作
- 需要通过 `ada-mcp-win.exe` 读取手机信息（如 App 列表、截图等真实设备能力）

以下场景通常不强制要求：

- 仅执行 Web 相关能力（Playwright）
- 不启用 Android 真机/模拟器相关能力

## 2. `ada-gui-win.exe` 使用方法（推荐）

1. 进入 `release/` 目录，双击 `ada-gui-win.exe`。
2. 在界面中按需配置远程管理平台地址与 API Key。
3. 如需环境准备，可在“安装依赖”区执行安装。
4. 关闭窗口时可选择“后台运行”或“立即关闭”。

适用场景：希望通过图形界面完成日常操作与状态查看。

### 2.1 在 GUI 中配置 `ANDROID_HOME`

当你需要使用移动端能力（Appium / adb）时，建议先在 GUI 中配置 Android SDK 路径：

1. 打开 `ada-gui-win.exe`，展开“远程管理平台（可选）”区域。
2. 在 `ANDROID_HOME` 输入框中直接填写 SDK 目录，或点击“选择目录”。
3. 点击“保存 ANDROID_HOME”。
4. 日志区出现“已设置进程环境变量”即表示已生效。

说明：
- GUI 会同时设置 `ANDROID_HOME` 与 `ANDROID_SDK_ROOT`。
- 该设置会保存到本机，下次打开 GUI 会自动恢复并尝试应用。
- 若目录变更，请重新选择并保存一次。

## 3. `ada-agent-win.exe` 使用方法

在 `release/` 目录打开终端后执行：

```powershell
.\ada-agent-win.exe health
.\ada-agent-win.exe doctor
.\ada-agent-win.exe start --watch
```

常见用途：
- `health`：查看健康状态
- `doctor`：查看诊断信息
- `start --watch`：持续处理任务

## 4. `ada-mcp-win.exe` 使用方法

该程序用于向 MCP Host 暴露 ADA 工具能力，通常由 MCP Host 拉起。

**npm 标准配置**（与 `docs/ADA-MCP-接入手册.md` §1.1 一致）：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "pnpm",
      "args": ["dlx", "@ada-mcp/launcher@0.1.49"]
    }
  }
}
```

**npx 等价**：`npx -y @ada-mcp/launcher@0.1.49`（与 pnpm 测速逻辑一致）

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": ["-y", "@ada-mcp/launcher@0.1.49"]
    }
  }
}
```

**本地 exe 配置**（`ada-mcp-win.exe` 走 stdio，不需要额外 `mcp` 参数）：

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "D:\\WORKSPACE\\PLAN\\ADA\\release\\ada-mcp-win.exe",
      "args": [],
      "cwd": "D:\\WORKSPACE\\PLAN\\ADA\\release",
      "env": {
        "ADA_PLAYWRIGHT_HEADLESS": "true",
        "ADA_NPM_PROXY_REGISTRY": "https://registry.npmmirror.com",
        "ADA_PNPM_PROXY_REGISTRY": "https://registry.npmmirror.com",
        "PLAYWRIGHT_DOWNLOAD_HOST": "https://npmmirror.com/mirrors/playwright",
        "ADA_INSTALL_STRATEGY_TIMEOUT_MS": "120000",
        "ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS": "900000"
      }
    }
  }
}
```

启动后可调用 `ada_health`、`ada_diagnostics`、`ada_web_action`、`ada_mobile_action` 等工具。

代理与镜像环境变量说明见 `docs/ADA-MCP-接入手册.md` §5（含 `npm_config_registry`、`ADA_REGISTRY_CANDIDATES` 等）。

## 5. `ada-web-win.exe` 使用方法

1. 在 `release/` 目录打开终端。
2. 执行 `./ada-web-win.exe`（PowerShell 中为 `.\ada-web-win.exe`）。
3. 按程序输出提示访问本地 Web 地址并操作。

适用场景：希望以 Web 页面方式使用 ADA，而非桌面 GUI。

## 6. 使用建议

- 日常首选：`ada-gui-win.exe`
- 需要脚本化/自动化：`ada-agent-win.exe`
- 需要给大模型或 MCP 客户端接入：`ada-mcp-win.exe`
- 需要浏览器式交互：`ada-web-win.exe`
