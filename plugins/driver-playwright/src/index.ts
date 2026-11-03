import { randomUUID } from "node:crypto";
import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import { executePlaywrightCommand } from "./commands/index.js";
import {
  countActivePlaywrightBrowsers,
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
    // UUID：避免并发 createSession 在同一毫秒碰撞导致共用浏览器
    return { id: `pw-${randomUUID()}`, platform };
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
  },

  getActiveBrowserCount() {
    return countActivePlaywrightBrowsers();
  }
};

export default playwrightPlugin;
export { executeClickPath, executeFillSearch, observeViewOnPage } from "./web-interaction-recipe.js";
export { locatorFromPayload, summarizeLocator } from "./playwright-locator.js";
export { executePlaywrightCommand } from "./commands/index.js";
export { countActivePlaywrightBrowsers } from "./runtime.js";
