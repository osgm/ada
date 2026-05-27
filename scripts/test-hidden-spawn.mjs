/**
 * Windows：验证 ADA 侧 spawn 是否带 windowsHide（不弹 cmd 窗）
 * 用法：node scripts/test-hidden-spawn.mjs
 */
import { spawn, spawnSync } from "node:child_process";

function testSpawnSyncHidden() {
  const r = spawnSync("where.exe", ["adb"], {
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  console.log("[spawnSync where adb] status=", r.status, "found=", Boolean(r.stdout?.trim()));
}

function testSpawnHidden() {
  return new Promise((resolve) => {
    const child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "echo ada-hidden-spawn-ok"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true
    });
    let out = "";
    child.stdout?.on("data", (c) => (out += c));
    child.on("close", (code) => {
      console.log("[spawn cmd /c echo] code=", code, "out=", out.trim());
      resolve();
    });
  });
}

async function main() {
  if (process.platform !== "win32") {
    console.log("skip: not Windows");
    return;
  }
  console.log("Watch for CMD flashes during the next 3 seconds...");
  testSpawnSyncHidden();
  testSpawnSyncHidden();
  await testSpawnHidden();
  console.log("Done. If no black CMD windows flashed, ADA-side spawn fix is OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
