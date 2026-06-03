import { loadConfig } from "./config.js";
import { clearSecret } from "./secrets.js";
import { listBuiltInPluginManifests } from "./plugin-registry.js";
import { log } from "./logger.js";
import { runWeb } from "./web.js";
import {
  applyRemoteCredentials,
  getDeviceListForDisplay,
  getHealthSnapshot,
  getDoctorSnapshot,
  scanDevicesAndListForDisplay,
  installDependencies,
  type InstallDependencyExtras,
  runDemoFlow,
  runSetupFlow,
  runStartFlow,
  runTaskFileFlow
} from "@ada/agent-core";
import type { InstallScope } from "@ada/install-deps";

type Command =
  | "start"
  | "setup"
  | "run-demo"
  | "run"
  | "health"
  | "doctor"
  | "plugins"
  | "install-deps"
  | "reset"
  | "mcp"
  | "core"
  | "gui"
  | "web";

function parseCommand(argv: string[]): Command {
  const command = (argv[2] ?? "start") as Command;
  if (
    command === "start" ||
    command === "setup" ||
    command === "run-demo" ||
    command === "run" ||
    command === "health" ||
    command === "doctor" ||
    command === "plugins" ||
    command === "install-deps" ||
    command === "reset" ||
    command === "mcp" ||
    command === "core" ||
    command === "gui" ||
    command === "web"
  ) {
    return command;
  }
  return "start";
}

function readArg(argv: string[], name: string): string | undefined {
  const key = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(key));
  return hit ? hit.slice(key.length) : undefined;
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(`--${flag}`);
}

function readCommaList(argv: string[], name: string): string[] | undefined {
  const v = readArg(argv, name);
  if (v === undefined || v.trim() === "") {
    return undefined;
  }
  const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function installDepsExtras(argv: string[]): InstallDependencyExtras | undefined {
  const pwTargets = readCommaList(argv, "playwright-targets");
  if (pwTargets === undefined) {
    return undefined;
  }
  return {
    playwrightInstallTargetsOverride: pwTargets
  };
}

function parseInstallScope(value?: string): InstallScope {
  if (
    value === "all" ||
    value === "playwright" ||
    value === "drivers" ||
    value === "mobile" ||
    value === "android" ||
    value === "ios" ||
    value === "harmony"
  ) {
    return value;
  }
  return "all";
}

function printHelp(): void {
  console.log(
    [
      "ADA Agent commands:",
      "  start [--once|--watch] [--local-dev]  Start agent runtime",
      "  setup [--mode=auto|cli|gui]",
      "  run-demo                  Execute built-in demo tasks",
      "  run --file=path.json      Execute tasks from JSON file",
      "       --require-real       Fail if any task falls back to mock mode",
      "  plugins                   Print built-in plugin manifests",
      "  health                    Print runtime health snapshot",
      "  doctor                    Print diagnostics report",
      "  install-deps [--only=playwright|mobile|android|ios|harmony|drivers|all]",
      "              [--playwright-targets=...] [--force]",
      "  reset                     Clear local credentials",
      "mcp                       Run MCP (stdio) for MCP Host / IDE — same binary as packaged exe",
      "  core --action=...         Unified core bridge for GUI/Web/MCP (health|doctor|devices|setup|install-deps|patch-remote|start)",
      "  gui                       Alias of web mode (backward compatibility)",
      "  web                       Run local web console UI (single-file web mode)"
    ].join("\n")
  );
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv);

  if (command === "mcp") {
    const { launchMcp } = await import("./launch-mcp.js");
    await launchMcp();
    return;
  }

  if (command === "core") {
    const action = readArg(process.argv, "action");
    if (action === "health") {
      console.log(JSON.stringify(await getHealthSnapshot(), null, 2));
      return;
    }
    if (action === "doctor") {
      console.log(JSON.stringify(await getDoctorSnapshot(), null, 2));
      return;
    }
    if (action === "setup") {
      const modeArg = readArg(process.argv, "mode");
      const mode = modeArg === "auto" || modeArg === "cli" || modeArg === "gui" ? modeArg : undefined;
      await runSetupFlow(mode);
      return;
    }
    if (action === "install-deps") {
      const onlyArg = readArg(process.argv, "only");
      const only = parseInstallScope(onlyArg);
      const force = hasFlag(process.argv, "force");
      const summary = await installDependencies(only, force, (line) => console.log(line), installDepsExtras(process.argv));
      console.log(JSON.stringify({ installDeps: summary }, null, 2));
      return;
    }
    if (action === "patch-remote") {
      const serverUrl = readArg(process.argv, "server-url") ?? "";
      const token = readArg(process.argv, "token");
      await applyRemoteCredentials(serverUrl, token);
      console.log(JSON.stringify({ ok: true, event: "remote.patched" }, null, 2));
      return;
    }
    if (action === "start") {
      await runStartFlow({
        localDev: hasFlag(process.argv, "local-dev"),
        skipDeps: hasFlag(process.argv, "skip-deps"),
        skipSetup: hasFlag(process.argv, "skip-setup"),
        runOnce: hasFlag(process.argv, "once"),
        runWatch: hasFlag(process.argv, "watch")
      });
      return;
    }
    throw new Error("Unknown core action. Use --action=health|doctor|devices|setup|install-deps|patch-remote|start");
  }

  const config = await loadConfig();

  if (command === "setup") {
    const modeArg = readArg(process.argv, "mode");
    const mode = modeArg === "auto" || modeArg === "cli" || modeArg === "gui" ? modeArg : undefined;
    await runSetupFlow(mode);
    return;
  }

  if (command === "run-demo") {
    await runDemoFlow();
    return;
  }

  if (command === "run") {
    const file = readArg(process.argv, "file");
    if (!file) {
      throw new Error("Missing task file. Usage: run --file=path.json");
    }
    const executed = await runTaskFileFlow(file, {
      requireReal: hasFlag(process.argv, "require-real"),
      verifyArtifacts: hasFlag(process.argv, "verify-artifacts")
    });
    console.log(JSON.stringify({ executed }, null, 2));
    return;
  }

  if (command === "plugins") {
    console.log(JSON.stringify(listBuiltInPluginManifests(), null, 2));
    return;
  }

  if (command === "install-deps") {
    const onlyArg = readArg(process.argv, "only");
    const only = parseInstallScope(onlyArg);
    const force = hasFlag(process.argv, "force");
    const summary = await installDependencies(only, force, (line) => console.log(line), installDepsExtras(process.argv));
    console.log(JSON.stringify({ installDeps: summary }, null, 2));
    return;
  }

  if (command === "health") {
    console.log(JSON.stringify(await getHealthSnapshot(), null, 2));
    return;
  }

  if (command === "doctor") {
    console.log(JSON.stringify(await getDoctorSnapshot(), null, 2));
    return;
  }

  if (command === "reset") {
    await clearSecret();
    log("info", { event: "agent.credentials.cleared" });
    return;
  }

  if (command === "gui" || command === "web") {
    await runWeb(config);
    return;
  }

  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }

  await runStartFlow({
    localDev: hasFlag(process.argv, "local-dev"),
    skipDeps: hasFlag(process.argv, "skip-deps"),
    runOnce: hasFlag(process.argv, "once"),
    runWatch: hasFlag(process.argv, "watch")
  });
}

main().catch((error) => {
  log("error", {
    event: "agent.fatal",
    details: { message: error instanceof Error ? error.message : String(error) }
  });
  process.exit(1);
});
