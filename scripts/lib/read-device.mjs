/**
 * 探测已连接移动设备（adb / hdc），供 open(device(...)) 合并使用
 */
import { spawn } from "node:child_process";
import { resolveToolBin } from "./resolve-tools.mjs";

const ADB = resolveToolBin("adb");
const HDC = resolveToolBin("hdc");

function runCapture(command, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      ...(process.platform === "win32" ? { windowsHide: true } : {})
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, stdout, stderr: "timeout" });
    }, timeoutMs);
    child.stdout?.on("data", (d) => {
      stdout += d;
    });
    child.stderr?.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: "", stderr: String(err) });
    });
  });
}

function parseAdbDevices(stdout) {
  const rows = [];
  for (const line of stdout.split(/\r?\n/).slice(1)) {
    const t = line.trim();
    if (!t || t.startsWith("*")) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 2) continue;
    rows.push({ id: parts[0], authorized: parts[1] === "device" });
  }
  return rows;
}

function parseHdcTargets(stdout) {
  const rows = [];
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^empty/i.test(t) || /^count/i.test(t)) continue;
    const parts = t.split(/\s+/);
    const id = parts[0];
    const state = (parts[1] ?? "Connected").toLowerCase();
    const authorized = state === "connected" || state === "online" || state === "device";
    rows.push({ id, authorized });
  }
  return rows;
}

/** 示例占位符（如「设备序列号」）视为未指定，走自动选设备 */
function normalizeDeviceId(deviceId) {
  const p = deviceId?.trim();
  if (!p) return undefined;
  if (/^(设备序列号|device[_\s-]?id|your[_\s-]?device|xxx+)$/i.test(p)) return undefined;
  return p;
}

function pickDeviceId(rows, preferred) {
  const pref = normalizeDeviceId(preferred) ?? "";
  if (pref && rows.some((r) => r.id === pref && r.authorized)) return pref;
  const authorized = rows.filter((r) => r.authorized);
  if (authorized.length === 1) return authorized[0].id;
  const physical = authorized.find((r) => !/emulator|127\.0\.0\.1/i.test(r.id));
  return physical?.id ?? authorized[0]?.id;
}

function parseScreenSize(stdout, fallback = { width: 1080, height: 2400 }) {
  const m = stdout.match(/(\d+)x(\d+)/);
  return m ? { width: +m[1], height: +m[2] } : fallback;
}

async function readAndroid(deviceId) {
  const preferred =
    deviceId?.trim() ||
    process.env.ADA_ANDROID_UDID?.trim() ||
    process.env.ADA_DEVICE_ID?.trim() ||
    "";

  const listed = await runCapture(ADB, ["devices"]);
  if (!listed.ok) throw new Error(listed.stderr || "adb devices 失败");

  const udid = pickDeviceId(parseAdbDevices(listed.stdout), preferred);
  if (!udid) throw new Error("未检测到 adb 设备，请连接手机并执行 adb devices");

  const sizeRes = await runCapture(ADB, ["-s", udid, "shell", "wm", "size"]);
  const screen = parseScreenSize(sizeRes.stdout);

  return {
    capabilities: { udid },
    screenWidth: screen.width,
    screenHeight: screen.height
  };
}

async function readHarmony(deviceId) {
  const preferred =
    deviceId?.trim() ||
    process.env.ADA_HARMONY_DEVICE_SN?.trim() ||
    process.env.ADA_DEVICE_ID?.trim() ||
    "";

  const listed = await runCapture(HDC, ["list", "targets"]);
  if (!listed.ok) throw new Error(listed.stderr || listed.stdout || "hdc list targets 失败");

  const sn = pickDeviceId(parseHdcTargets(listed.stdout), preferred);
  if (!sn) throw new Error("未检测到 hdc 设备，请连接鸿蒙设备并执行 hdc list targets");

  const sizeRes = await runCapture(HDC, ["-t", sn, "shell", "wm", "size"]);
  const screen = parseScreenSize(sizeRes.stdout);

  return {
    capabilities: { deviceSn: sn },
    screenWidth: screen.width,
    screenHeight: screen.height
  };
}

/**
 * 探测移动设备信息（屏幕尺寸 + 设备 ID）
 * @param {object} [opts]
 * @param {"android"|"harmony"} [opts.type="android"] 平台
 * @param {string} [opts.deviceId] 指定设备 ID（`device_id` 同义；省略则用默认已连接设备）
 * @param {string} [opts.device_id] 同 deviceId
 * @returns {Promise<{ capabilities: object, screenWidth: number, screenHeight: number }>}
 */
export async function readDevice(opts = {}) {
  const type = opts.type ?? opts.platform ?? "android";
  const deviceId = normalizeDeviceId(opts.deviceId ?? opts.device_id);
  if (type === "android") return readAndroid(deviceId);
  if (type === "harmony") return readHarmony(deviceId);
  throw new Error(`readDevice: 不支持的 type "${type}"`);
}
