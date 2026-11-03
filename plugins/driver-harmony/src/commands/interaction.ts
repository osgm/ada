import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import {
  buildOptionalUiMissResult,
  isOptionalUiPayload,
  resolveSwipeDurationMs,
  withSuppressedHypiumProbeLogs
} from "@ada/driver-rpc";
import { executeHarmonyDeviceAdmin } from "../device-admin.js";
import {
  asPoint2,
  clickWithPayload,
  failResult,
  type HarmonyDriverLike,
  type HarmonyPayload,
  pinchWithPayload,
  resolveElement,
  swipeWithPayload,
  typeWithPayload
} from "../runtime.js";

export async function runClick(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  if (isOptionalUiPayload(payload as Record<string, unknown>)) {
    return withSuppressedHypiumProbeLogs(async () => {
      try {
        const point = asPoint2(payload.point);
        if (!point) {
          const element = await resolveElement(driver, payload);
          if (!element) {
            const label = payload.locator?.text ?? payload.locator?.id ?? "locator";
            return buildOptionalUiMissResult(command, `optional click: ${label} not found`, {
              driver: "harmony",
              mode: "real",
              locator: payload.locator
            });
          }
        }
        await clickWithPayload(driver, payload);
      } catch (error) {
        const label = payload.locator?.text ?? payload.locator?.id ?? payload.point ?? "locator";
        return buildOptionalUiMissResult(
          command,
          `optional click: ${label} failed: ${error instanceof Error ? error.message : String(error)}`,
          {
            driver: "harmony",
            mode: "real",
            locator: payload.locator,
            point: payload.point
          }
        );
      }
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "harmony", mode: "real", command: "click" }
      };
    });
  }
  try {
    await clickWithPayload(driver, payload);
  } catch (error) {
    return failResult(command, "HARMONY_CLICK_FAILED", error instanceof Error ? error.message : String(error));
  }
  return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "click" } };
}

export async function runType(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  try {
    await typeWithPayload(driver, payload);
  } catch (error) {
    return failResult(command, "HARMONY_TYPE_FAILED", error instanceof Error ? error.message : String(error));
  }
  return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "type" } };
}

export async function runSwipe(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  await swipeWithPayload(driver, payload);
  const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, {
    envDefaultMs: Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS),
    fallbackMs: 300
  });
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "harmony", mode: "real", command: "swipe", durationMs, from: payload.from, to: payload.to }
  };
}

export async function runPinch(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  const { mode: pinchMode } = await pinchWithPayload(driver, payload);
  const durationMs = resolveSwipeDurationMs(payload as Record<string, unknown>, {
    envDefaultMs: Number(process.env.ADA_HARMONY_SWIPE_SPEED_MS),
    fallbackMs: 400
  });
  return {
    requestId: command.requestId,
    success: true,
    data: {
      driver: "harmony",
      mode: "real",
      command: "pinch",
      durationMs,
      pinchIn: payload.pinchIn,
      pinchMode
    }
  };
}

export async function runDeviceAdmin(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  return executeHarmonyDeviceAdmin(command, driver, payload as Record<string, unknown>);
}
