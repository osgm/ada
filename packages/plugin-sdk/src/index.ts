import type { CommandEnvelope, CommandResult, PluginManifest, Platform } from "@ada/contracts";

export interface DriverSession {
  id: string;
  platform: Platform;
}

export interface DriverPlugin {
  manifest: PluginManifest;
  init(): Promise<void>;
  createSession(platform: Platform): Promise<DriverSession>;
  execute(session: DriverSession, command: CommandEnvelope): Promise<CommandResult>;
  destroySession?(session: DriverSession): Promise<void>;
  dispose(): Promise<void>;
}
