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
  /** 立即杀进程/句柄，不等待优雅 close（脚本退出兜底） */
  forceDispose?(): void | Promise<void>;
}

/** 冻结接口：后续新增字段通过可选扩展，避免破坏既有插件。 */
export type DriverPluginV1 = DriverPlugin;
