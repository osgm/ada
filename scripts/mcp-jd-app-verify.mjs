/**
 * 京东 App 真机验证（Node.js + ada-mcp MCP stdio）。
 *
 * 用法：
 *   node scripts/mcp-jd-app-verify.mjs
 *   node scripts/mcp-jd-app-verify.mjs --probe
 *   node scripts/mcp-jd-app-verify.mjs --server local
 *
 * 前置（推荐手动常驻，少闪窗）：
 *   set APPIUM_HOME=D:\WORKSPACE\PLAN\ada\APPIUM_HOME
 *   set ANDROID_HOME=<你的 Android SDK>
 *   npx appium --address 127.0.0.1 --port 4723
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createAdaMcpTransport, repoRoot } from "./mcp-transport.mjs";

const LONG_REQ = { timeout: 360_000 };
const APP_SESSION = "jd-mcp-verify-app";
const JD_APP_PACKAGE = process.env.ADA_JD_APP_PACKAGE ?? "com.jingdong.app.mall";
const JD_APP_ACTIVITY = process.env.ADA_JD_APP_ACTIVITY ?? ".MainFrameActivity";
const APPIUM_URL = process.env.ADA_APPIUM_URL ?? "http://127.0.0.1:4723";

const WIN_SPAWN = process.platform === "win32" ? { windowsHide: true } : {};

function parseArgs(argv) {
  const args = {
    probe: false,
    server: "local",
    installMobileDeps: false,
    allowMock: false,
    skipAdbLaunch: false,
    appPackage: JD_APP_PACKAGE,
    appActivity: JD_APP_ACTIVITY,
    appiumUrl: APPIUM_URL,
    appWaitMs: 4000,
    outputDir: "artifacts",
    launcherVersion: process.env.ADA_MCP_LAUNCHER_VERSION ?? "0.1.28"
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--probe") args.probe = true;
    else if (a === "--install-mobile-deps") args.installMobileDeps = true;
    else if (a === "--allow-mock") args.allowMock = true;
    else if (a === "--skip-adb-launch") args.skipAdbLaunch = true;
    else if (a === "--server") args.server = argv[++i] ?? "local";
    else if (a === "--app-package") args.appPackage = argv[++i] ?? JD_APP_PACKAGE;
    else if (a === "--app-activity") args.appActivity = argv[++i] ?? JD_APP_ACTIVITY;
    else if (a === "--appium-url") args.appiumUrl = argv[++i] ?? APPIUM_URL;
    else if (a === "--output-dir") args.outputDir = argv[++i] ?? "artifacts";
    else if (a === "--launcher-version") args.launcherVersion = argv[++i] ?? "0.1.28";
    else if (a === "--help" || a === "-h") {
      console.log(`用法: node scripts/mcp-jd-app-verify.mjs [选项]
  --probe                 仅 Appium 探活
  --server local|dev|npm  默认 local（node dist/cli.cjs，少闪 cmd）
  --install-mobile-deps   经 MCP 安装 mobile 依赖（会闪 cmd，仅首次需要）
  --skip-adb-launch       不先用 adb 拉起京东 App
  --app-activity <name>   默认 .MainFrameActivity`);
      process.exit(0);
    }
  }
  return args;
}

function adbSpawn(args, label) {
  const proc = spawnSync("adb", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...WIN_SPAWN
  });
  if (proc.status !== 0) {
    const err = String(proc.stderr ?? proc.stdout ?? "").trim();
    throw new Error(`${label} 失败: ${err || `exit ${proc.status}`}`);
  }
  return proc;
}

function parseToolPayload(toolResult) {
  if (toolResult?.isError) {
    const text = toolResult.content?.map((b) => b.text).filter(Boolean).join("\n");
    throw new Error(text || "MCP tool error");
  }
  const text = toolResult?.content?.[0]?.text ?? "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function assertSuccess(data, step, allowMock) {
  if (data?.success === false) {
    throw new Error(`${step} failed: ${data.errorCode ?? ""} ${data.errorMessage ?? JSON.stringify(data)}`);
  }
  const inner = data?.data;
  if (!allowMock && inner?.mode === "mock" && inner?.reason) {
    throw new Error(`${step} fell back to mock: ${inner.reason}`);
  }
}

async function callTool(client, name, arguments_) {
  const raw = await client.callTool({ name, arguments: arguments_ }, CallToolResultSchema, LONG_REQ);
  return parseToolPayload(raw);
}

function preflightAndroidDevice() {
  let proc;
  try {
    proc = spawnSync("adb", ["devices"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...WIN_SPAWN
    });
  } catch {
    return { ok: false, message: "未找到 adb" };
  }
  const lines = String(proc.stdout ?? "")
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter(Boolean);
  const devices = lines.slice(1).filter((ln) => ln.includes("\tdevice"));
  if (devices.length === 0) {
    return { ok: false, message: "无已连接 Android 设备或 USB 未授权" };
  }
  return { ok: true, deviceId: devices[0].split("\t")[0] };
}

function preflightJdAppInstalled(appPackage) {
  const proc = spawnSync("adb", ["shell", "pm", "list", "packages", appPackage], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...WIN_SPAWN
  });
  if (!String(proc.stdout ?? "").includes(appPackage)) {
    return { ok: false, message: `未安装 ${appPackage}` };
  }
  return { ok: true };
}

function launchJdAppViaAdb(args, deviceId) {
  const component = `${args.appPackage}/${args.appActivity.startsWith(".") ? args.appActivity : args.appActivity}`;
  console.log(`  [app] adb 启动京东: ${component}`);
  adbSpawn(["-s", deviceId, "shell", "am", "start", "-W", "-n", component], "adb am start");
}

function appPayloadBase(args, deviceId) {
  const activity = args.appActivity.startsWith(".")
    ? `${args.appPackage}${args.appActivity}`
    : args.appActivity;
  const capabilities = {
    platformName: "Android",
    "appium:automationName": "UiAutomator2",
    "appium:deviceName": "Android",
    "appium:udid": deviceId,
    "appium:noReset": true,
    "appium:fullReset": false,
    "appium:autoLaunch": false,
    "appium:appPackage": args.appPackage,
    "appium:appActivity": activity,
    "appium:appWaitActivity": "*",
    "appium:appWaitDuration": 30000,
    "appium:ignoreHiddenApiPolicyError": true,
    "appium:newCommandTimeout": 300
  };
  return {
    real: true,
    serverUrl: args.appiumUrl,
    capabilities
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.isAbsolute(args.outputDir)
    ? args.outputDir
    : path.join(repoRoot, args.outputDir);
  fs.mkdirSync(outDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const shot1 = path.join(outDir, `jd-mcp-app-${ts}-1.png`);
  const shot2 = path.join(outDir, `jd-mcp-app-${ts}-2.png`);
  const steps = [];

  console.log(
    `[app] MCP server=${args.server}  package=${args.appPackage}  activity=${args.appActivity}\n`
  );

  const transport = createAdaMcpTransport({
    server: args.server,
    installDeps: "skip",
    launcherVersion: args.launcherVersion
  });
  const client = new Client({ name: "mcp-jd-app-verify", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  try {
    console.log("  [app] probe …");
    const probe = await callTool(client, "ada_mobile_action", {
      platform: "android",
      command: "swipe",
      sessionId: APP_SESSION,
      requestId: `jd-app-probe-${ts}`,
      allowMock: true,
      payload: { probe: true }
    });
    steps.push({ name: "probe", ok: true, detail: probe });

    if (args.probe) {
      console.log("  [app] --probe：仅探活\n");
      console.log(JSON.stringify({ ok: true, steps }, null, 2));
      return;
    }

    const dev = preflightAndroidDevice();
    if (!dev.ok) throw new Error(`真机检查: ${dev.message}`);
    console.log(`  [app] 设备: ${dev.deviceId}`);

    const pkg = preflightJdAppInstalled(args.appPackage);
    if (!pkg.ok) throw new Error(pkg.message);

    if (args.installMobileDeps) {
      console.log("  [app] install_mobile_deps（可能闪 cmd）…");
      await callTool(client, "ada_install_deps", { only: "mobile", force: false });
    }

    if (!args.skipAdbLaunch) {
      launchJdAppViaAdb(args, dev.deviceId);
      await sleep(2000);
    }

    const base = appPayloadBase(args, dev.deviceId);

    console.log("  [app] 创建会话并截图 …");
    const open = await callTool(client, "ada_mobile_action", {
      platform: "android",
      command: "screenshot",
      sessionId: APP_SESSION,
      requestId: `jd-app-open-${ts}`,
      allowMock: args.allowMock,
      payload: { ...base, screenshotPath: shot1 }
    });
    assertSuccess(open, "screenshot_home", args.allowMock);
    steps.push({ name: "screenshot_home", ok: true, screenshot: open.data?.screenshot ?? shot1 });
    console.log(`  [app] 截图1: ${open.data?.screenshot ?? shot1}`);

    await sleep(args.appWaitMs);

    async function swipeOnce(index) {
      console.log(`  [app] swipe_right_${index} …`);
      const swipe = await callTool(client, "ada_mobile_action", {
        platform: "android",
        command: "swipe",
        sessionId: APP_SESSION,
        requestId: `jd-app-swipe-${ts}-${index}`,
        allowMock: args.allowMock,
        payload: { ...base, from: [0.2, 0.5], to: [0.8, 0.5] }
      });
      assertSuccess(swipe, `swipe_right_${index}`, args.allowMock);
      steps.push({ name: `swipe_right_${index}`, ok: true });
    }

    for (let i = 0; i < 2; i += 1) {
      try {
        await swipeOnce(i + 1);
      } catch (firstErr) {
        console.warn(`  [app] swipe_right_${i + 1} 失败，等待后重试一次…`);
        await sleep(1500);
        await swipeOnce(i + 1);
      }
      await sleep(500);
    }

    console.log("  [app] 滑动后截图 …");
    const shot = await callTool(client, "ada_mobile_action", {
      platform: "android",
      command: "screenshot",
      sessionId: APP_SESSION,
      requestId: `jd-app-shot2-${ts}`,
      allowMock: args.allowMock,
      payload: { ...base, screenshotPath: shot2 }
    });
    assertSuccess(shot, "screenshot_after_swipe", args.allowMock);
    steps.push({ name: "screenshot_after_swipe", ok: true, screenshot: shot.data?.screenshot ?? shot2 });
    console.log(`  [app] 截图2: ${shot.data?.screenshot ?? shot2}`);

    console.log("\n[app] 完成\n");
    console.log(JSON.stringify({ ok: true, steps }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      null,
      2
    )
  );
  console.error(`
[排查]
  1) 先手动启动 Appium（推荐，避免脚本反复拉起）:
     set APPIUM_HOME=${path.join(repoRoot, "APPIUM_HOME")}
     npx appium --address 127.0.0.1 --port 4723
  2) adb devices 显示 device
  3) npx appium driver install uiautomator2
  4) 使用: node scripts/mcp-jd-app-verify.mjs --server local
  5) 勿用 python --real-app（已废弃 App 路径）`);
  process.exit(1);
});
