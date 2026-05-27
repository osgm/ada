# @ada/driver-harmony

HarmonyOS 原生驱动插件（与 `driver-appium` 同级），基于 `hypium-driver + hdc`。

## 能力范围

- 平台：`harmony`
- 语义命令：`click/tap`、`type`、`swipe`、`assertVisible`、`screenshot`、`wait`、`getText`、`assertText`、`back`、`home`、`launchApp`、`terminateApp`、`custom`
- 原生透传：`invoke`（method）

## 使用说明

1. 将 `hdc` 放入项目 `tools/`（或设置 `ADA_TOOLS_DIR`）。
2. 依赖安装：`npm run install:deps -- --only=harmony`（或 `--install-deps=all`）。
3. 任务中使用 `platform: "harmony"`，并在 payload 中开启 `real: true`。

## 真机冒烟测试（推荐先跑）

默认会自动执行 `hdc list targets` 识别设备（仅有一台设备时无需设置 SN）。
以下环境变量可用于覆盖自动识别：

- `ADA_HARMONY_DEVICE_SN`: 设备序列号（多设备时建议显式设置）
- `ADA_HARMONY_HDC_HOST` / `ADA_HARMONY_HDC_PORT`: 仅在你使用远程/转发 hdc 时需要（可选）

运行：

```bash
npm --workspace @ada/driver-harmony run smoke:real
```

脚本会依次执行：`home -> click(屏幕中心) -> swipe(上滑) -> screenshot`，截图输出到 `plugins/driver-harmony/artifacts/`。

## 发布

该包是独立 workspace，可单独执行：

```bash
npm --workspace @ada/driver-harmony run build
npm --workspace @ada/driver-harmony run typecheck
```
