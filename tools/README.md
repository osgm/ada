# ADA 内置工具目录（HarmonyOS NEXT）

将华为 DevEco / Command Line Tools 中的 **`hdc`** 等可执行文件放在本目录，ADA 会在启动、`install-deps` 与 `doctor` 时自动：

1. 设置 `ADA_TOOLS_DIR` / `HDC_HOME`
2. 将本目录 **prepend 到 PATH**（`driver-harmony` 可找到 `hdc`）

## 最低要求

| 文件 | 用途 |
|------|------|
| `hdc.exe`（Windows）或 `hdc`（macOS/Linux） | 纯血鸿蒙设备连接 |

可选：同目录下的 `hnpcli.exe`、`syscap_tool.exe` 等 SDK 工具。

## 环境变量（可选）

| 变量 | 说明 |
|------|------|
| `ADA_TOOLS_DIR` | 覆盖工具目录（绝对路径） |
| `ADA_TOOLS_RELATIVE_DIR` | 相对工作区子目录名，默认 `tools` |

## 验证

```powershell
# ADA 注入 PATH 后，或手动：
$env:PATH = "D:\path\to\ada\tools;" + $env:PATH
hdc list targets
```

```bash
pnpm dlx @ada-mcp/launcher@0.1.40 --install-deps=harmony
# 或
./ada-agent install-deps --only=harmony
./ada-agent doctor
```

设备需开启开发者模式；`hdc list targets` 应列出设备后再跑 `platform: harmony` 任务。

## 自动下载 hdc（可选）

`install-deps --only=harmony` 在 `tools/` 尚无 `hdc` 时会依次尝试：

1. 从本机 **PATH** 复制（含同目录 `libusb_shared.dll` 等依赖）
2. 按配置的 URL **下载**（见下）

| 变量 / 配置 | 说明 |
|-------------|------|
| `ADA_HARMONY_HDC_DOWNLOAD_URL` | 单个下载地址 |
| `ADA_HARMONY_HDC_DOWNLOAD_URLS` | 多个候选，逗号分隔 |
| `dependencies.harmonyHdcDownloadUrls` | `config/default.yaml` 中同上 |

URL 支持：

- **直链**：`.exe` 或裸二进制，保存为 `tools/hdc.exe`
- **ZIP 包**：路径以 `.zip` 结尾时，下载到临时目录、解压，在包内递归查找 `hdc.exe`/`hdc`，并将**同目录下全部文件**复制到 `tools/`（便于带上 `libusb_shared.dll` 等）

```yaml
# config/default.yaml 示例
dependencies:
  harmonyHdcDownloadUrls:
    - "https://your-internal-mirror/harmony-tools-win.zip"
```

Harmony 自动化依赖 **`hypium-driver`**（npm）与本目录 **`hdc`**，由 `driver-harmony` 插件直连，无需额外中心化 Server。
