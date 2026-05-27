use once_cell::sync::Lazy;
use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};
use serde::Deserialize;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

static INSTALL_DEPS_RUNNING: AtomicBool = AtomicBool::new(false);
static INSTALL_DEPS_PID: AtomicU32 = AtomicU32::new(0);

#[derive(Clone, Serialize)]
struct InstallDepsFinished {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    elapsed_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    step_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary_lines: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

static AGENT_CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));
static MCP_CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));
static MCP_REMOTE_CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

const TRAY_MENU_SHOW_ID: &str = "show_main_window";
const TRAY_MENU_EXIT_ID: &str = "exit_app_now";

fn split_release_dir_from_path(p: &str) -> Option<PathBuf> {
    let path = PathBuf::from(p);
    path.parent().map(|v| v.to_path_buf())
}

fn kill_child_if_running(slot: &Mutex<Option<Child>>, app: &AppHandle, name: &str) {
    if let Ok(mut locked) = slot.lock() {
        if let Some(mut child) = locked.take() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = app.emit("agent-log", format!("{name} 进程已停止"));
        }
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(false);
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit("agent-log", "已从托盘恢复 GUI 窗口");
    }
}

fn hide_main_window_to_tray(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
        let _ = window.set_skip_taskbar(true);
        let _ = app.emit("agent-log", "GUI 已最小化到系统托盘，点击托盘图标可恢复。");
    }
}

fn ask_close_action() -> bool {
    let result = MessageDialog::new()
        .set_level(MessageLevel::Info)
        .set_title("关闭 ADA GUI")
        .set_description("是否后台运行？\n\n选择“是”将隐藏到系统托盘；选择“否”将立即退出并停止相关进程。")
        .set_buttons(MessageButtons::YesNo)
        .show();
    matches!(result, MessageDialogResult::Yes)
}

fn terminate_app_services(app: &AppHandle) {
    kill_child_if_running(&AGENT_CHILD, app, "Agent");
    kill_child_if_running(&MCP_CHILD, app, "MCP");
    kill_child_if_running(&MCP_REMOTE_CHILD, app, "MCP远程服务");
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpRemoteStartInput {
    host: String,
    port: u16,
    api_key: String,
    allow_risky: bool,
    risky_mode: String,
    risky_commands: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct McpRemoteStatus {
    running: bool,
    host: String,
    port: u16,
    pid: Option<u32>,
}

fn spawn_child_exit_watcher(slot: &'static Mutex<Option<Child>>, app: AppHandle, name: &'static str) {
    std::thread::spawn(move || loop {
        let mut should_break = false;
        match slot.lock() {
            Ok(mut locked) => {
                if let Some(child) = locked.as_mut() {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let code = status.code().unwrap_or(-1);
                            let _ = app.emit("agent-log", format!("{name} 进程已退出(code={code})"));
                            let _ = locked.take();
                            should_break = true;
                        }
                        Ok(None) => {}
                        Err(e) => {
                            let _ = app.emit("agent-log", format!("{name} 进程状态检查失败: {e}"));
                        }
                    }
                } else {
                    should_break = true;
                }
            }
            Err(_) => {
                should_break = true;
            }
        }
        if should_break {
            break;
        }
        std::thread::sleep(Duration::from_millis(1200));
    });
}

/// 将 stdio MCP 接入说明与示例 JSON 打到日志，便于用户粘贴到 Cursor / Claude Desktop 等客户端。
fn emit_mcp_client_config(app: &AppHandle, mcp_exe: &str) {
    let work_dir = split_release_dir_from_path(mcp_exe)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));
    let cwd_str = work_dir.to_string_lossy().to_string();
    let config = serde_json::json!({
        "mcpServers": {
            "ada": {
                "command": mcp_exe,
                "args": [],
                "cwd": cwd_str,
                "env": {
                    "ADA_PLAYWRIGHT_HEADLESS": "true",
                    "ADA_INSTALL_STRATEGY_TIMEOUT_MS": "30000"
                }
            }
        }
    });
    let pretty = serde_json::to_string_pretty(&config).unwrap_or_else(|_| "{}".to_string());
    let msg = format!(
        "【MCP · 大模型客户端配置】\n\
         以下为 stdio 方式：与当前 GUI 启动的 MCP 子进程一致。\n\
         · Cursor：项目或用户目录下的 MCP 配置（如 .cursor/mcp.json），将 ada 合并进已有 mcpServers。\n\
         · Claude Desktop：编辑 claude_desktop_config.json 的 mcpServers。\n\
         · 其它兼容 MCP stdio 的 IDE：command / args / cwd / env 含义相同。\n\
         · 若客户端限制工具名字符，仅使用下划线工具名（如 ada_install_deps / ada_web_action）。\n\n\
         {pretty}\n\n\
         路径说明：command = 上表一体包可执行文件绝对路径；cwd = release 工作目录（与 exe 同目录，便于加载 config / tasks）。\n\
         参数说明：env 为推荐性能与稳定性参数，可按网络与环境实际调整。\n\
         npm/Playwright 镜像由 install-deps 测速后写入 ~/.ada/deps-install-state.json；可选 ADA_REGISTRY_CANDIDATES、ADA_PLAYWRIGHT_HOST_CANDIDATES 追加候选。"
    );
    let _ = app.emit("agent-log", msg);
}

fn agent_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(explicit) = std::env::var("ADA_AGENT_EXE") {
        out.push(PathBuf::from(explicit));
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for p in [
        cwd.join("../../release/ada-agent-win.exe"),
        cwd.join("../release/ada-agent-win.exe"),
        cwd.join("release/ada-agent-win.exe"),
        cwd.join("ada-agent-win.exe"),
    ] {
        out.push(p);
    }
    out
}

fn first_existing(paths: Vec<PathBuf>) -> Option<String> {
    for p in paths {
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    None
}

fn resolve_agent_path(input: Option<String>) -> Result<String, String> {
    let explicit = input.unwrap_or_default().trim().to_string();
    if !explicit.is_empty() {
        return Ok(explicit);
    }
    first_existing(agent_candidates())
        .ok_or_else(|| "未找到本地 ada-agent-win.exe，请将其放在 GUI 同目录或设置 ADA_AGENT_EXE".to_string())
}

#[cfg(windows)]
fn mcp_binary_name() -> &'static str {
    "ada-mcp-win.exe"
}

#[cfg(target_os = "macos")]
fn mcp_binary_name() -> &'static str {
    "ada-mcp-macos"
}

#[cfg(all(not(windows), not(target_os = "macos")))]
fn mcp_binary_name() -> &'static str {
    "ada-mcp-linux"
}

fn mcp_candidates(agent_path_hint: Option<&str>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(explicit) = std::env::var("ADA_MCP_EXE") {
        out.push(PathBuf::from(explicit));
    }
    if let Some(agent_path) = agent_path_hint {
        if let Some(parent) = PathBuf::from(agent_path).parent() {
            out.push(parent.join(mcp_binary_name()));
        }
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    out.push(cwd.join("release").join(mcp_binary_name()));
    out.push(cwd.join(mcp_binary_name()));
    out
}

fn resolve_mcp_path(agent_path_hint: Option<&str>) -> Result<String, String> {
    first_existing(mcp_candidates(agent_path_hint)).ok_or_else(|| {
        format!(
            "未找到本地 {}，请将其放在 GUI/Agent 同目录或设置 ADA_MCP_EXE",
            mcp_binary_name()
        )
    })
}

#[cfg(windows)]
fn hide_subprocess_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000);
}

#[cfg(not(windows))]
fn hide_subprocess_console(_cmd: &mut Command) {}

fn run_capture(agent_path: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new(agent_path);
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    hide_subprocess_console(&mut cmd);
    let output = cmd.output().map_err(|e| format!("启动命令失败: {e}"))?;
    let mut text = String::new();
    text.push_str(&String::from_utf8_lossy(&output.stdout));
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    if output.status.success() {
        Ok(text.trim().to_string())
    } else {
        Err(format!(
            "命令执行失败(code={:?}): {}",
            output.status.code(),
            text.trim()
        ))
    }
}

#[tauri::command]
fn pick_android_home_dir() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择 ANDROID_HOME 目录")
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn apply_android_home(android_home: String) -> Result<String, String> {
    let p = android_home.trim();
    if p.is_empty() {
        return Err("ANDROID_HOME 不能为空".to_string());
    }
    let path = PathBuf::from(p);
    if !path.exists() {
        return Err("ANDROID_HOME 目录不存在".to_string());
    }
    if !path.is_dir() {
        return Err("ANDROID_HOME 必须是目录".to_string());
    }
    let sdk = path.to_string_lossy().to_string();
    std::env::set_var("ANDROID_HOME", &sdk);
    std::env::set_var("ANDROID_SDK_ROOT", &sdk);
    Ok(format!(
        "已设置进程环境变量:\nANDROID_HOME={sdk}\nANDROID_SDK_ROOT={sdk}"
    ))
}

#[tauri::command]
fn pick_appium_home_dir() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择 APPIUM_HOME 目录")
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn apply_appium_home(appium_home: String) -> Result<String, String> {
    let p = appium_home.trim();
    if p.is_empty() {
        return Err("APPIUM_HOME 不能为空".to_string());
    }
    let path = PathBuf::from(p);
    if !path.exists() {
        return Err("APPIUM_HOME 目录不存在".to_string());
    }
    if !path.is_dir() {
        return Err("APPIUM_HOME 必须是目录".to_string());
    }
    let home = path.to_string_lossy().to_string();
    std::env::set_var("APPIUM_HOME", &home);
    Ok(format!("已设置进程环境变量:\nAPPIUM_HOME={home}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HomeDirs {
    android_home: Option<String>,
    appium_home: Option<String>,
}

fn non_empty_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn existing_dir(p: String) -> Option<String> {
    let path = PathBuf::from(&p);
    if path.exists() && path.is_dir() {
        Some(path.to_string_lossy().to_string())
    } else {
        None
    }
}

fn detect_android_home_dir() -> Option<String> {
    if let Some(v) = non_empty_env("ANDROID_HOME").and_then(existing_dir) {
        return Some(v);
    }
    if let Some(v) = non_empty_env("ANDROID_SDK_ROOT").and_then(existing_dir) {
        return Some(v);
    }
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let guessed = PathBuf::from(local_app_data).join("Android").join("Sdk");
        if guessed.exists() && guessed.is_dir() {
            return Some(guessed.to_string_lossy().to_string());
        }
    }
    None
}

fn detect_appium_home_dir() -> Option<String> {
    if let Some(v) = non_empty_env("APPIUM_HOME").and_then(existing_dir) {
        return Some(v);
    }
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let user_home = PathBuf::from(user_profile);
        if user_home.exists() && user_home.is_dir() {
            return Some(user_home.to_string_lossy().to_string());
        }
    }
    None
}

#[tauri::command]
fn detect_home_dirs() -> HomeDirs {
    HomeDirs {
        android_home: detect_android_home_dir(),
        appium_home: detect_appium_home_dir(),
    }
}

#[tauri::command]
fn detect_agent_path() -> String {
    first_existing(agent_candidates()).unwrap_or_default()
}

#[tauri::command]
fn run_health(agent_path: Option<String>, _control_url: Option<String>) -> Result<String, String> {
    let resolved = resolve_agent_path(agent_path)?;
    run_capture(&resolved, &["core", "--action=health"])
}

#[tauri::command]
fn run_setup_gui(agent_path: Option<String>, _control_url: Option<String>) -> Result<String, String> {
    let resolved = resolve_agent_path(agent_path)?;
    run_capture(&resolved, &["core", "--action=setup", "--mode=gui"])
}

#[tauri::command]
fn apply_patch_remote(
    agent_path: Option<String>,
    server_url: String,
    api_key: Option<String>,
) -> Result<String, String> {
    let resolved = resolve_agent_path(agent_path)?;
    let url = server_url.trim();
    if url.is_empty() {
        return Err("远程管理平台地址不能为空".to_string());
    }
    let url_arg = format!("--server-url={}", url);
    let mut parts = vec![
        "core".to_string(),
        "--action=patch-remote".to_string(),
        url_arg,
    ];
    if let Some(ref t) = api_key {
        let tt = t.trim();
        if !tt.is_empty() {
            parts.push(format!("--token={}", tt));
        }
    }
    let args: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
    run_capture(&resolved, &args)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallDepStep {
    only: String,
    #[serde(default)]
    playwright_targets: Option<Vec<String>>,
    #[serde(default)]
    appium_drivers: Option<Vec<String>>,
}

/// 流式输出 install-deps 到 agent-log（无额外 CMD 窗口），并汇总返回文本
fn run_agent_install_deps_streaming(
    app: &AppHandle,
    agent_path: &str,
    args: &[String],
) -> Result<String, String> {
    let work_dir = split_release_dir_from_path(agent_path)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));

    let mut cmd = Command::new(agent_path);
    cmd.args(args)
        .current_dir(&work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_subprocess_console(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动 install-deps 失败: {e}"))?;
    INSTALL_DEPS_PID.store(child.id(), Ordering::SeqCst);
    let _ = app.emit(
        "agent-log",
        format!(
            "[deps] 子进程已启动 pid={} exe={} args={}",
            child.id(),
            agent_path,
            args.join(" ")
        ),
    );

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_out = app.clone();
    let out_handle = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                buf.push_str(&line);
                buf.push('\n');
                let _ = app_out.emit("agent-log", line);
            }
        }
        buf
    });

    let app_err = app.clone();
    let err_handle = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                buf.push_str(&line);
                buf.push('\n');
                let _ = app_err.emit("agent-log", format!("[stderr] {}", line));
            }
        }
        buf
    });

    let status = match child.wait() {
        Ok(s) => {
            INSTALL_DEPS_PID.store(0, Ordering::SeqCst);
            s
        }
        Err(e) => {
            INSTALL_DEPS_PID.store(0, Ordering::SeqCst);
            return Err(format!("等待 install-deps 结束失败: {e}"));
        }
    };

    let out_str = out_handle.join().unwrap_or_default();
    let err_str = err_handle.join().unwrap_or_default();
    let combined = format!("{}{}", out_str, err_str);

    if status.success() {
        Ok(combined.trim().to_string())
    } else {
        let hint = format!(
            "install-deps 退出码 {:?}",
            status.code()
        );
        let _ = app.emit("agent-log", hint.clone());
        Err(format!("{}\n{}", hint, combined.trim()))
    }
}

fn format_elapsed_ms(ms: u128) -> String {
    if ms >= 1000 {
        format!("{:.1}s", ms as f64 / 1000.0)
    } else {
        format!("{ms}ms")
    }
}

#[tauri::command]
fn stop_install_deps() -> Result<(), String> {
    if !INSTALL_DEPS_RUNNING.load(Ordering::SeqCst) {
        return Err("当前没有运行中的安装任务".to_string());
    }
    let pid = INSTALL_DEPS_PID.load(Ordering::SeqCst);
    if pid == 0 {
        return Err("安装任务正在启动或已结束，未获取到可停止的进程".to_string());
    }
    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("停止安装失败: {e}"))?;
        if !status.success() {
            return Err(format!("停止安装失败，taskkill exit={:?}", status.code()));
        }
    }
    #[cfg(not(windows))]
    {
        let status = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("停止安装失败: {e}"))?;
        if !status.success() {
            return Err(format!("停止安装失败，kill exit={:?}", status.code()));
        }
    }
    Ok(())
}

/// 与 Web 控制台一致：按步骤调用 core install-deps（支持 playwright-targets / appium-drivers）。
/// 实际安装在后台线程执行，避免长时间占用 IPC 导致界面假死；结果通过 `install-deps-finished` 投递。
fn run_install_deps_plan_blocking(
    app: &AppHandle,
    resolved: &str,
    steps: Vec<InstallDepStep>,
    force: bool,
) -> Result<(Vec<String>, u128), String> {
    let started = std::time::Instant::now();
    let mut summary_lines: Vec<String> = Vec::new();
    let total_steps = steps.len();
    for step in steps {
        let step_started = std::time::Instant::now();
        let only_flag = format!("--only={}", step.only.trim());
        let _ = app.emit(
            "agent-log",
            format!("──────── install-deps {} ────────", step.only.trim()),
        );
        let mut parts = vec![
            "core".to_string(),
            "--action=install-deps".to_string(),
            only_flag,
        ];
        if let Some(ref t) = step.playwright_targets {
            if !t.is_empty() {
                parts.push(format!("--playwright-targets={}", t.join(",")));
            }
        }
        if let Some(ref d) = step.appium_drivers {
            if !d.is_empty() {
                parts.push(format!("--appium-drivers={}", d.join(",")));
            }
        }
        if force {
            parts.push("--force".to_string());
        }
        let _part = run_agent_install_deps_streaming(app, resolved, &parts)?;
        let step_elapsed = step_started.elapsed().as_millis();
        let step_summary = format!(
            "步骤 {}：成功（耗时 {}）",
            step.only.trim(),
            format_elapsed_ms(step_elapsed)
        );
        summary_lines.push(step_summary.clone());
        let _ = app.emit(
            "agent-log",
            format!("[deps] {}", step_summary),
        );
    }
    let elapsed_ms = started.elapsed().as_millis();
    let total_summary = format!(
        "总计：{} 个步骤全部成功（总耗时 {}）",
        total_steps,
        format_elapsed_ms(elapsed_ms)
    );
    summary_lines.push(total_summary.clone());
    let _ = app.emit(
        "agent-log",
        format!("install-deps：{}", total_summary),
    );
    Ok((summary_lines, elapsed_ms))
}

#[tauri::command]
fn run_install_deps_plan(
    app: AppHandle,
    agent_path: Option<String>,
    steps: Vec<InstallDepStep>,
    force: bool,
) -> Result<(), String> {
    let resolved = resolve_agent_path(agent_path)?;
    if steps.is_empty() {
        return Err("安装步骤为空：请勾选「完整安装」或至少一类组件".to_string());
    }
    if INSTALL_DEPS_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("已有依赖安装任务在运行，请等待结束后再试".to_string());
    }

    let app2 = app.clone();
    let resolved2 = resolved;
    let _ = app.emit(
        "agent-log",
        format!(
            "[deps] 启动安装计划：agent={} steps={} force={}",
            resolved2,
            steps.len(),
            force
        ),
    );
    std::thread::spawn(move || {
        let result = run_install_deps_plan_blocking(&app2, &resolved2, steps, force);
        match &result {
            Ok((summary_lines, elapsed_ms)) => {
                let _ = app2.emit(
                    "agent-log",
                    format!(
                        "【安装结果】成功：依赖安装已完成（{}）。",
                        format_elapsed_ms(*elapsed_ms)
                    ),
                );
                for line in summary_lines {
                    let _ = app2.emit("agent-log", format!("【安装摘要】{line}"));
                }
            }
            Err(e) => {
                let _ = app2.emit("agent-log", format!("【安装结果】失败：{e}"));
            }
        }
        let payload = match result {
            Ok((summary_lines, elapsed_ms)) => InstallDepsFinished {
                ok: true,
                elapsed_ms: Some(elapsed_ms as u64),
                step_count: Some(summary_lines.len().saturating_sub(1)),
                summary_lines: Some(summary_lines),
                output: None,
                error: None,
            },
            Err(e) => InstallDepsFinished {
                ok: false,
                elapsed_ms: None,
                step_count: None,
                summary_lines: None,
                output: None,
                error: Some(e),
            },
        };
        let _ = app2.emit("install-deps-finished", payload);
        INSTALL_DEPS_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(())
}

fn spawn_mcp_process(app: &AppHandle, mcp_path: &str) -> Result<(), String> {
    let mut locked = MCP_CHILD
        .lock()
        .map_err(|_| "内部状态锁异常".to_string())?;
    if locked.is_some() {
        emit_mcp_client_config(app, mcp_path);
        let _ = app.emit("agent-log", "MCP 已在运行，跳过重复启动");
        return Ok(());
    }

    let work_dir = split_release_dir_from_path(mcp_path)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));

    let mut cmd = Command::new(mcp_path);
    cmd.arg("--skip-install-deps")
        .env("ADA_MCP_SKIP_INSTALL_DEPS", "1")
        .current_dir(work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_subprocess_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("启动 MCP 失败: {e}"))?;

    if let Some(stdout) = child.stdout.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let _ = app2.emit("agent-log", format!("[mcp] {line}"));
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = app2.emit("agent-log", format!("[mcp-stderr] {line}"));
            }
        });
    }

    *locked = Some(child);
    spawn_child_exit_watcher(&MCP_CHILD, app.clone(), "MCP");
    emit_mcp_client_config(app, mcp_path);
    let _ = app.emit("agent-log", "MCP 进程已启动（独立 ada-mcp 可执行程序，stdio 已就绪）");
    Ok(())
}

#[tauri::command]
fn start_mcp_server(app: AppHandle, agent_path: Option<String>) -> Result<(), String> {
    let agent_hint = resolve_agent_path(agent_path).ok();
    let mcp_path = resolve_mcp_path(agent_hint.as_deref())?;
    spawn_mcp_process(&app, &mcp_path)
}

#[tauri::command]
fn stop_mcp_server(app: AppHandle) -> Result<(), String> {
    let mut locked = MCP_CHILD
        .lock()
        .map_err(|_| "内部状态锁异常".to_string())?;
    if let Some(mut child) = locked.take() {
        let _ = child.kill();
        let _ = child.wait();
        let _ = app.emit("agent-log", "MCP 进程已停止");
    }
    Ok(())
}

#[tauri::command]
fn start_mcp_remote_server(app: AppHandle, agent_path: Option<String>, input: McpRemoteStartInput) -> Result<(), String> {
    if input.host.trim().is_empty() {
        return Err("监听地址不能为空".to_string());
    }
    if input.api_key.trim().is_empty() {
        return Err("鉴权 Token 不能为空".to_string());
    }
    // 启动前端口占用校验
    let probe = std::net::TcpListener::bind((input.host.as_str(), input.port))
        .map_err(|e| format!("端口占用或不可监听: {e}"))?;
    drop(probe);

    let mut locked = MCP_REMOTE_CHILD
        .lock()
        .map_err(|_| "内部状态锁异常".to_string())?;
    if locked.is_some() {
        return Err("MCP 远程服务已在运行".to_string());
    }

    let agent_hint = resolve_agent_path(agent_path).ok();
    let mcp_path = resolve_mcp_path(agent_hint.as_deref())?;
    let work_dir = split_release_dir_from_path(&mcp_path)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));

    let mut cmd = Command::new(&mcp_path);
    cmd.arg("--skip-install-deps")
        .env("ADA_MCP_SKIP_INSTALL_DEPS", "1")
        .arg("server")
        .arg(format!("--host={}", input.host))
        .arg(format!("--port={}", input.port))
        .arg(format!("--allow-risky={}", if input.allow_risky { "true" } else { "false" }))
        .arg(format!("--risky-mode={}", input.risky_mode))
        .arg(format!("--risky-commands={}", input.risky_commands))
        .current_dir(work_dir)
        .env("ADA_MCP_REMOTE_API_KEY", input.api_key.trim())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_subprocess_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("启动 MCP 远程服务失败: {e}"))?;

    if let Some(stdout) = child.stdout.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let _ = app2.emit("agent-log", format!("[mcp-remote] {line}"));
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = app2.emit("agent-log", format!("[mcp-remote-stderr] {line}"));
            }
        });
    }

    let pid = child.id();
    *locked = Some(child);
    spawn_child_exit_watcher(&MCP_REMOTE_CHILD, app.clone(), "MCP远程服务");
    let _ = app.emit("agent-log", format!("MCP 远程服务已启动：http://{}:{} (pid={})", input.host, input.port, pid));
    Ok(())
}

#[tauri::command]
fn stop_mcp_remote_server(app: AppHandle) -> Result<(), String> {
    let mut locked = MCP_REMOTE_CHILD
        .lock()
        .map_err(|_| "内部状态锁异常".to_string())?;
    if let Some(mut child) = locked.take() {
        let _ = child.kill();
        let _ = child.wait();
        let _ = app.emit("agent-log", "MCP 远程服务已停止");
    }
    Ok(())
}

#[tauri::command]
fn get_mcp_remote_status(host: String, port: u16) -> Result<McpRemoteStatus, String> {
    let locked = MCP_REMOTE_CHILD
        .lock()
        .map_err(|_| "内部状态锁异常".to_string())?;
    let (running, pid) = if let Some(child) = locked.as_ref() {
        (true, Some(child.id()))
    } else {
        (false, None)
    };
    Ok(McpRemoteStatus { running, host, port, pid })
}

/// 按勾选启动：可仅 Agent、仅 MCP，或两者同时（默认建议两者勾选）
#[tauri::command]
fn start_services(app: AppHandle, agent_path: Option<String>, run_agent: bool, run_mcp: bool) -> Result<(), String> {
    if !run_agent && !run_mcp {
        return Err("请至少勾选 Agent 或 MCP".to_string());
    }
    let resolved = resolve_agent_path(agent_path)?;

    if run_agent {
        let mut locked = AGENT_CHILD
            .lock()
            .map_err(|_| "内部状态锁异常".to_string())?;
        if locked.is_some() {
            return Err("Agent 已在运行".to_string());
        }
        let work_dir = split_release_dir_from_path(&resolved)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| PathBuf::from("."));

        let mut cmd = Command::new(&resolved);
        cmd.arg("core")
            .arg("--action=start")
            .arg("--watch")
            .arg("--skip-deps")
            .arg("--skip-setup")
            .current_dir(work_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        hide_subprocess_console(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| format!("启动 Agent 失败: {e}"))?;

        if let Some(stdout) = child.stdout.take() {
            let app2 = app.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
                    let _ = app2.emit("agent-log", line);
                }
            });
        }
        if let Some(stderr) = child.stderr.take() {
            let app2 = app.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    let _ = app2.emit("agent-log", format!("[stderr] {line}"));
                }
            });
        }

        *locked = Some(child);
        spawn_child_exit_watcher(&AGENT_CHILD, app.clone(), "Agent");
        let _ = app.emit("agent-log", "Agent 进程已启动");
    }

    if run_mcp {
        let mcp_path = resolve_mcp_path(Some(&resolved))?;
        spawn_mcp_process(&app, &mcp_path)?;
    }
    Ok(())
}

/// 按勾选停止：可仅停 Agent、仅停 MCP，或两者同时
#[tauri::command]
fn stop_services(app: AppHandle, stop_agent: bool, stop_mcp: bool) -> Result<(), String> {
    if !stop_agent && !stop_mcp {
        return Err("请至少勾选 Agent 或 MCP".to_string());
    }
    if stop_agent {
        let mut agent_locked = AGENT_CHILD
            .lock()
            .map_err(|_| "内部状态锁异常".to_string())?;
        if let Some(mut child) = agent_locked.take() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = app.emit("agent-log", "Agent 进程已停止");
        }
    }
    if stop_mcp {
        let mut mcp_locked = MCP_CHILD
            .lock()
            .map_err(|_| "内部状态锁异常".to_string())?;
        if let Some(mut child) = mcp_locked.take() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = app.emit("agent-log", "MCP 进程已停止");
        }
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let quit_item = MenuItemBuilder::with_id(TRAY_MENU_EXIT_ID, "立即关闭").build(app)?;
            let show_item = MenuItemBuilder::with_id(TRAY_MENU_SHOW_ID, "打开 ADA GUI").build(app)?;
            let tray_menu = MenuBuilder::new(app).items(&[&show_item, &quit_item]).build()?;

            // 显式复用窗口图标，避免某些系统下托盘显示白块/不可见图标。
            let tray_icon = app.default_window_icon().cloned();

            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("ADA GUI")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(&tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    TRAY_MENU_SHOW_ID => show_main_window(app),
                    TRAY_MENU_EXIT_ID => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = tray_icon {
                tray_builder = tray_builder.icon(icon);
            }
            let _tray = tray_builder.build(app)?;

            let _ = app.handle().emit("agent-log", "ADA 已就绪");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_agent_path,
            run_health,
            run_setup_gui,
            apply_patch_remote,
            pick_android_home_dir,
            apply_android_home,
            pick_appium_home_dir,
            apply_appium_home,
            detect_home_dirs,
            run_install_deps_plan,
            stop_install_deps,
            start_mcp_server,
            stop_mcp_server,
            start_mcp_remote_server,
            stop_mcp_remote_server,
            get_mcp_remote_status,
            start_services,
            stop_services
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle();
                if ask_close_action() {
                    hide_main_window_to_tray(&app);
                } else {
                    terminate_app_services(&app);
                    app.exit(0);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                terminate_app_services(app);
            }
            _ => {}
        });
}
