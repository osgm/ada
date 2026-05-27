import { spawn } from "node:child_process";

function runStep(name, command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${name} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const strict = process.argv.includes("--strict");

  const webArgs = [
    "apps/ada-agent/src/main.ts",
    "run",
    "--file=tasks/web-real.tasks.json",
    "--verify-artifacts",
    ...(strict ? ["--require-real"] : [])
  ];
  await runStep("web smoke", "tsx", webArgs);

  await runStep("appium probe", "tsx", [
    "apps/ada-agent/src/main.ts",
    "run",
    "--file=tasks/appium-probe.tasks.json"
  ]);
}

main().catch((error) => {
  console.error(`[e2e-smoke] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
