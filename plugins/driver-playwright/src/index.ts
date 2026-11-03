import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import { executePlaywrightCommand } from "./commands/index.js";
import {
  destroyPlaywrightSession,
  disposePlaywrightRuntime,
  forceDisposePlaywrightRuntime,
  SEMANTIC_COMMANDS
} from "./runtime.js";

const playwrightPlugin: DriverPlugin = {
  manifest: {
    id: "driver-playwright",
    version: "0.1.0",
    engine: "playwright",
    platforms: ["web"],
    capabilities: [...SEMANTIC_COMMANDS, "invoke"],
    semanticCommands: [...SEMANTIC_COMMANDS],
    invoke: {
      modes: ["method"],
      targets: ["page", "context", "browser", "playwright", "locator"]
    },
    viewCapabilities: ["observeSnapshot", "resolveLocator"]
  },

  async init() {},

  async createSession(platform): Promise<DriverSession> {
    return { id: `pw-${Date.now()}`, platform };
  },

  async execute(session: DriverSession, command: CommandEnvelope): Promise<CommandResult> {
    return executePlaywrightCommand(session, command);
  },

  async destroySession(session: DriverSession) {
    await destroyPlaywrightSession(session);
  },

  async dispose() {
    await disposePlaywrightRuntime();
  },

  forceDispose() {
    forceDisposePlaywrightRuntime();
  }
};

export default playwrightPlugin;
export { executeClickPath, executeFillSearch, observeViewOnPage } from "./web-interaction-recipe.js";
export { locatorFromPayload, summarizeLocator } from "./playwright-locator.js";
export { executePlaywrightCommand } from "./commands/index.js";
