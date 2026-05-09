# ADA Tauri GUI 本地构建环境准备（Windows）
# 用法：在项目根目录 PowerShell 执行 .\scripts\setup-tauri-env.ps1

$ErrorActionPreference = "Stop"

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (-not (Test-Path (Join-Path $cargoBin "cargo.exe"))) {
  Write-Host "[提示] 未检测到 cargo。正在下载 rustup-init 并静默安装 stable（minimal）..."
  $init = Join-Path $env:TEMP "rustup-init.exe"
  Invoke-WebRequest -Uri "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe" -OutFile $init -UseBasicParsing
  & $init "-y" "--default-toolchain" "stable-x86_64-pc-windows-msvc" "--profile" "minimal"
}

$env:Path = "$cargoBin;$env:Path"

Write-Host "rustc: $(rustc --version)"
Write-Host "cargo: $(cargo --version)"

$iconDir = Join-Path $PSScriptRoot "..\apps\ada-gui\src-tauri\icons"
$iconIco = Join-Path $iconDir "icon.ico"
if (-not (Test-Path $iconIco)) {
  Write-Host "[提示] 缺少 icons/icon.ico，正在生成占位图标..."
  New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap 64,64
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(37,99,235))
  $g.Dispose()
  $h = $bmp.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($h)
  $sw = [System.IO.File]::Create($iconIco)
  $icon.Save($sw)
  $sw.Close()
  $icon.Dispose()
  $bmp.Dispose()
}

Write-Host ""
Write-Host "在本会话中已将 cargo 加入 PATH。新开终端时请执行："
Write-Host '  $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"'
Write-Host ""
Write-Host "构建桌面 GUI（Tauri 产物名为 ada-gui.exe）："
Write-Host "  npm run gui:build"
Write-Host ""
Write-Host "产出路径：apps\ada-gui\src-tauri\target\release\ada-gui.exe"
Write-Host "全量打包到 release 时：npm run build:exe 仅输出 release\ada-gui-win.exe（不再复制为 release\ada-gui.exe）"
Write-Host ""
Write-Host "[说明] Windows 需已安装 Microsoft C++ Build Tools（link.exe）；WebView2 通常为系统自带。"
Write-Host "[说明] 仓库已关闭 NSIS 安装包步骤（bundle.active=false），避免网络超时；仅生成可执行文件。"
