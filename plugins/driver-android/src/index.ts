import type { CommandEnvelope } from "@ada/contracts";
import type { Platform } from "@ada/contracts";
import type { DriverPlugin, DriverSession } from "@ada/plugin-sdk";
import type { AndroidAdapterSession, AndroidPayload } from "./adapter.js";
import { androidSessionSignature } from "./session-signature.js";
import { Uia2AdbAdapter } from "./uia2-adb-adapter.js";

const adapter = new Uia2AdbAdapter();
const sessions = new Map<string, AndroidAdapterSession>();

const androidPlugin: DriverPlugin = {
  manifest: {
    id: "driver-android",
    version: "1.0.0",
    engine: "android",
    platforms: ["android"],
    capabilities: ["click", "type", "swipe", "pinch", "assertVisible", "screenshot", "wait", "getText", "assertText", "back", "pressHome", "home", "launchApp", "exitApp", "recipe", "custom", "deviceAdmin", "invoke"],
    semanticCommands: ["click", "type", "swipe", "pinch", "assertVisible", "screenshot", "wait", "getText", "assertText", "back", "pressHome", "home", "launchApp", "exitApp", "recipe", "custom", "deviceAdmin"],
    invoke: { modes: ["http", "method"], targets: ["session", "adb", "device"] }
  },
  async init() {},
  async createSession(platform: Platform): Promise<DriverSession> {
    return { id: `android-${Date.now()}`, platform: platform === "android" ? platform : "android" };
  },
  async execute(session, command) {
    const payload = (command.payload ?? {}) as AndroidPayload;
    const nextSignature = androidSessionSignature(payload);
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

export default androidPlugin;
export { androidSessionSignature };
