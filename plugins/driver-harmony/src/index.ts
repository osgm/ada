import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import { executeHarmonyCommand } from "./commands/index.js";
import {
  destroyHarmonySession,
  disposeHarmonyRuntime,
  forceDisposeHarmonyRuntime,
  initHarmonyRuntime
} from "./runtime.js";

const harmonyPlugin: DriverPlugin = {
  manifest: {
    id: "driver-harmony",
    version: "0.1.0",
    engine: "harmony",
    platforms: ["harmony"],
    capabilities: [
      "tap",
      "click",
      "type",
      "swipe",
      "pinch",
      "deviceAdmin",
      "assertVisible",
      "screenshot",
      "wait",
      "getText",
      "assertText",
      "back",
      "pressHome",
      "home",
      "launchApp",
      "exitApp",
      "recipe",
      "custom",
      "invoke"
    ],
    semanticCommands: [
      "tap",
      "click",
      "type",
      "swipe",
      "pinch",
      "deviceAdmin",
      "assertVisible",
      "screenshot",
      "wait",
      "getText",
      "assertText",
      "back",
      "pressHome",
      "home",
      "launchApp",
      "exitApp",
      "recipe",
      "custom"
    ],
    invoke: {
      modes: ["method"],
      targets: ["session"]
    }
  },

  async init() {
    await initHarmonyRuntime();
  },

  async createSession(platform): Promise<DriverSession> {
    return { id: `harmony-${Date.now()}`, platform };
  },

  async execute(session: DriverSession, command: CommandEnvelope): Promise<CommandResult> {
    return executeHarmonyCommand(session, command);
  },

  async destroySession(session: DriverSession) {
    await destroyHarmonySession(session);
  },

  async dispose() {
    await disposeHarmonyRuntime();
  },

  forceDispose() {
    forceDisposeHarmonyRuntime();
  }
};

export default harmonyPlugin;
export { buildHarmonyPinchPointerMatrix, executeHarmonyPinch } from "./harmony-pinch.js";
export { executeHarmonyCommand } from "./commands/index.js";
