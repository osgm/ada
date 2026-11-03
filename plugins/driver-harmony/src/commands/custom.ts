import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { DriverSession } from "@ada/plugin-sdk";
import {
  executeCustom,
  type HarmonyDriverLike,
  type HarmonyPayload,
  invokeWithPayload
} from "../runtime.js";

export async function runCustom(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload,
  sessionId: string
): Promise<CommandResult> {
  return executeCustom(command, driver, payload, sessionId);
}

export async function runInvoke(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  const value = await invokeWithPayload(driver, payload);
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "harmony", mode: "real", command: "invoke", value }
  };
}

export type { DriverSession };
