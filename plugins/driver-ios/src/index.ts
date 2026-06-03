import type { Platform } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import type { IOSAdapterSession, IOSPayload } from "./adapter.js";
import { iosSessionSignature } from "./session-signature.js";
import { WdaClientAdapter } from "./wda-http-adapter.js";

const adapter = new WdaClientAdapter();
const sessions = new Map<string, IOSAdapterSession>();

const iosPlugin: DriverPlugin = {
  manifest: {
    id: "driver-ios",
    version: "1.0.0",
    engine: "ios",
    platforms: ["ios"],
    capabilities: ["click", "type", "swipe", "pinch", "assertVisible", "screenshot", "wait", "getText", "assertText", "back", "pressHome", "home", "launchApp", "exitApp", "recipe", "custom", "deviceAdmin", "invoke"],
    semanticCommands: ["click", "type", "swipe", "pinch", "assertVisible", "screenshot", "wait", "getText", "assertText", "back", "pressHome", "home", "launchApp", "exitApp", "recipe", "custom", "deviceAdmin"],
    invoke: { modes: ["http"], targets: ["session"] }
  },
  async init() {},
  async createSession(platform: Platform): Promise<DriverSession> {
    return { id: `ios-${Date.now()}`, platform: platform === "ios" ? platform : "ios" };
  },
  async execute(session, command) {
    const payload = (command.payload ?? {}) as IOSPayload;
    const nextSignature = iosSessionSignature(payload);
    let state = sessions.get(session.id);
    if (!state || state.signature !== nextSignature) {
      if (state) {
        await adapter.destroySession(state).catch(() => undefined);
      }
      state = await adapter.createSession(payload);
      sessions.set(session.id, state);
    }
    return adapter.execute(state, command, payload);
  },
  async destroySession(session: DriverSession) {
    const state = sessions.get(session.id);
    if (!state) return;
    sessions.delete(session.id);
    await adapter.destroySession(state).catch(() => undefined);
  },
  async dispose() {
    const all = Array.from(sessions.values());
    sessions.clear();
    await Promise.allSettled(all.map((s) => adapter.destroySession(s)));
  },

  forceDispose() {
    const all = Array.from(sessions.values());
    sessions.clear();
    for (const s of all) {
      void adapter.destroySession(s).catch(() => undefined);
    }
  }
};

export default iosPlugin;
export { iosSessionSignature };
