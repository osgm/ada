import { UiDriver } from "hypium-driver";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

function envInt(key, fallback) {
  const raw = process.env[key];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envStr(key, fallback = "") {
  const v = process.env[key];
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

async function runCommandCapture(command, args) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolve({ ok: false, stdout: "", stderr: String(error), code: -1 });
    });
    child.on("exit", (code) => {
      resolve({ ok: code === 0, stdout, stderr, code: code ?? -1 });
    });
  });
}

function resolveHdcCommand() {
  const isWin = process.platform === "win32";
  const hdcBin = isWin ? "hdc.exe" : "hdc";
  const fromEnvDir = envStr("ADA_TOOLS_DIR");
  if (fromEnvDir) {
    const p = path.resolve(fromEnvDir, hdcBin);
    if (existsSync(p)) return p;
  }

  // 从插件目录回溯到仓库根，再找 tools/hdc(.exe)
  const workspaceRoot = path.resolve(process.cwd(), "..", "..");
  const toolsHdc = path.join(workspaceRoot, "tools", hdcBin);
  if (existsSync(toolsHdc)) return toolsHdc;

  return "hdc";
}

function applyHdcEnv(hdcCommand) {
  if (!path.isAbsolute(hdcCommand)) {
    return;
  }
  const hdcDir = path.dirname(hdcCommand);
  process.env.ADA_TOOLS_DIR = process.env.ADA_TOOLS_DIR || hdcDir;
  process.env.HDC_HOME = process.env.HDC_HOME || hdcDir;
  const prev = process.env.PATH || "";
  const parts = prev.split(path.delimiter).filter(Boolean);
  if (!parts.includes(hdcDir)) {
    process.env.PATH = `${hdcDir}${path.delimiter}${prev}`;
  }
}

function parseDeviceSnFromHdcTargets(text) {
  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const sns = [];
  for (const line of lines) {
    // 常见输出:
    // 192.168.1.8:5555
    // R8M1234567 device
    // emulator-5554 offline
    const m = line.match(/^([^\s]+)(?:\s+(device|online))?$/i);
    if (!m?.[1]) continue;
    const sn = m[1].trim();
    const state = (m[2] ?? "").toLowerCase();
    if (state && state !== "device" && state !== "online") continue;
    sns.push(sn);
  }
  return Array.from(new Set(sns));
}

async function resolveDeviceSn() {
  const fromEnv =
    envStr("ADA_HARMONY_DEVICE_SN") ||
    envStr("HARMONY_DEVICE_SN") ||
    envStr("ADA_HARMONY_UDID") ||
    envStr("HDC_DEVICE_SN");
  if (fromEnv) return fromEnv;

  const hdcCmd = resolveHdcCommand();
  applyHdcEnv(hdcCmd);
  const probe = await runCommandCapture(hdcCmd, ["list", "targets"]);
  if (!probe.ok) {
    throw new Error(
      `缺少设备序列号，且自动探测失败。请设置 ADA_HARMONY_DEVICE_SN。hdc 命令=${hdcCmd}，错误: ${probe.stderr || probe.stdout || "unknown"}`
    );
  }
  const sns = parseDeviceSnFromHdcTargets(probe.stdout);
  if (sns.length === 0) {
    throw new Error("未检测到在线设备。请先连接鸿蒙手机并执行 hdc list targets 确认可见。");
  }
  if (sns.length > 1) {
    throw new Error(
      `检测到多台设备: ${sns.join(", ")}。请设置 ADA_HARMONY_DEVICE_SN 指定目标设备。`
    );
  }
  return sns[0];
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds()
  )}`;
}

async function main() {
  const hdcCmd = resolveHdcCommand();
  applyHdcEnv(hdcCmd);
  const deviceSn = await resolveDeviceSn();
  const hdcHost = envStr("ADA_HARMONY_HDC_HOST", "");
  const hdcPort = envInt("ADA_HARMONY_HDC_PORT", undefined);

  if (!deviceSn) {
    throw new Error(
      "缺少设备序列号。请先设置环境变量 ADA_HARMONY_DEVICE_SN（例如 hdc list targets 输出的 SN）。"
    );
  }

  const artifactsDir = path.resolve(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const screenshotPath = path.join(artifactsDir, `harmony-smoke-${nowStamp()}.png`);

  const opts = {
    deviceSn,
    udid: deviceSn,
    hdcHost: hdcHost || undefined,
    hdcPort: typeof hdcPort === "number" ? hdcPort : undefined
  };

  console.log("[harmony-smoke] connecting…", { deviceSn, hdcHost: opts.hdcHost, hdcPort: opts.hdcPort });
  const driver = await UiDriver.connect(opts);
  try {
    const size = await driver.getDisplaySize();
    const width = Number(size?.width ?? size?.x ?? 0) || 1080;
    const height = Number(size?.height ?? size?.y ?? 0) || 1920;
    console.log("[harmony-smoke] display", { width, height });

    // 操作 1：回到桌面
    console.log("[harmony-smoke] pressHome");
    await driver.pressHome();
    await driver.wait(500);

    // 操作 2：轻点屏幕中间（用于验证输入事件链路）
    const cx = Math.round(width * 0.5);
    const cy = Math.round(height * 0.5);
    console.log("[harmony-smoke] click center", { cx, cy });
    await driver.click(cx, cy);
    await driver.wait(500);

    // 操作 3：上滑（模拟回到桌面/浏览列表等）
    const sx = Math.round(width * 0.5);
    const sy1 = Math.round(height * 0.8);
    const sy2 = Math.round(height * 0.3);
    console.log("[harmony-smoke] swipe", { from: [sx, sy1], to: [sx, sy2] });
    await driver.swipe(sx, sy1, sx, sy2, 6000);
    await driver.wait(800);

    // 操作 4：截图落盘
    console.log("[harmony-smoke] screenshot ->", screenshotPath);
    await driver.screenCap(screenshotPath);
    console.log("[harmony-smoke] ok");
  } finally {
    console.log("[harmony-smoke] disconnect");
    await driver.disconnect().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("[harmony-smoke] failed:", err?.stack || String(err));
  process.exitCode = 1;
});

