import { spawn } from "node:child_process";

function runStep(name, command, args) {
  return new Promise((resolve, reject) => {
    let combined = "";
    const child = spawn(command, args, {
      shell: process.platform === "win32"
    });
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      combined += text;
      process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      combined += text;
      process.stderr.write(text);
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`${name} failed with exit code ${code}`));
        return;
      }
      if (/KERNEL_EXECUTION_FAILED|WEB_ENGINE_UNKNOWN|No plugin registered for platform/i.test(combined)) {
        reject(new Error(`${name} reported task execution failures (see log above)`));
        return;
      }
      resolve();
    });
    child.on("error", reject);
  });
}

async function probeWdaReachable() {
  if (process.platform !== "darwin") return false;
  try {
    const url = (process.env.ADA_WDA_SERVER_URL || "http://127.0.0.1:8100").replace(/\/$/, "");
    const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function probeUia2Reachable() {
  try {
    const url = (process.env.ADA_ANDROID_UIA2_SERVER_URL || "http://127.0.0.1:8200").replace(/\/$/, "");
    const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const strict = process.argv.includes("--strict");
  const mobile = process.argv.includes("--mobile") || strict;
  const mobileStrict = process.argv.includes("--mobile-strict") || (strict && mobile);

  await runStep("demo mobile smoke", "tsx", [
    "apps/ada-agent/src/main.ts",
    "run",
    "--file=tasks/demo.tasks.json"
  ]);

  if (mobile) {
    await runStep("android invoke mock", "tsx", [
      "apps/ada-agent/src/main.ts",
      "run",
      "--file=tasks/android-invoke-mock.tasks.json"
    ]);
    await runStep("ios mobile mock", "tsx", [
      "apps/ada-agent/src/main.ts",
      "run",
      "--file=tasks/ios-mock.tasks.json"
    ]);
  }

  if (mobileStrict) {
    await runStep("android adb invoke real", "tsx", [
      "apps/ada-agent/src/main.ts",
      "run",
      "--file=tasks/android-invoke-real.tasks.json",
      "--require-real"
    ]);
    if (process.platform === "darwin" && (await probeWdaReachable())) {
      await runStep("ios wda invoke real", "tsx", [
        "apps/ada-agent/src/main.ts",
        "run",
        "--file=tasks/ios-invoke-real.tasks.json",
        "--require-real"
      ]);
    } else {
      console.warn("[e2e-smoke] skip ios wda invoke real (requires macOS + reachable WDA /status)");
    }
    if (await probeUia2Reachable()) {
      await runStep("android uia2 invoke real", "tsx", [
        "apps/ada-agent/src/main.ts",
        "run",
        "--file=tasks/android-uia2-invoke-real.tasks.json",
        "--require-real"
      ]);
    } else {
      console.warn("[e2e-smoke] skip android uia2 invoke real (requires UIA2 /status at ADA_ANDROID_UIA2_SERVER_URL)");
    }
  }

  if (strict) {
    const webArgs = [
      "apps/ada-agent/src/main.ts",
      "run",
      "--file=tasks/web-real.tasks.json",
      "--verify-artifacts",
      "--require-real"
    ];
    await runStep("web-real strict smoke", "tsx", webArgs);
  }
}

main().catch((error) => {
  console.error(`[e2e-smoke] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
