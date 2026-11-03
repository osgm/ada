import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { raceCommandTimeout } from "@ada/driver-rpc";
import {
  failResult,
  type HarmonyDriverLike,
  type HarmonyPayload,
  numberOr,
  opTimeoutMs,
  screenshotWithPayload
} from "../runtime.js";

export async function runScreenshot(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  const screenshot = await screenshotWithPayload(command, driver, payload);
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "harmony", mode: "real", command: "screenshot", screenshot }
  };
}

export async function runWait(
  command: CommandEnvelope,
  _driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  const timeoutMs = numberOr(payload.timeoutMs, 300);
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "harmony", mode: "real", command: "wait", timeoutMs }
  };
}

export async function runBack(
  command: CommandEnvelope,
  driver: HarmonyDriverLike
): Promise<CommandResult> {
  await driver.pressBack();
  return { requestId: command.requestId, success: true, data: { driver: "harmony", mode: "real", command: "back" } };
}

export async function runPressHome(command: CommandEnvelope, driver: HarmonyDriverLike): Promise<CommandResult> {
  await driver.pressHome();
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "harmony", mode: "real", command: "pressHome" }
  };
}

export async function runLaunchApp(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  const bundleName = String(payload.appId ?? payload.bundleId ?? "");
  if (!bundleName) {
    return failResult(command, "HARMONY_LAUNCH_APP_MISSING_BUNDLE", "launchApp requires payload.appId or payload.bundleId");
  }
  const abilityId = String(payload.abilityId ?? payload.ability ?? "").trim() || "EntryAbility";
  await raceCommandTimeout(driver.startApp(bundleName, abilityId), opTimeoutMs(payload, 60_000), "harmony.startApp");
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "harmony", mode: "real", command: "launchApp", bundleName, abilityId }
  };
}

export async function runExitApp(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  const bundleName = String(payload.appId ?? payload.bundleId ?? "");
  if (!bundleName) {
    return failResult(command, "HARMONY_EXIT_APP_MISSING_BUNDLE", "exitApp requires payload.appId or payload.bundleId");
  }
  await raceCommandTimeout(driver.stopApp(bundleName), opTimeoutMs(payload, 20_000), "harmony.stopApp");
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "harmony", mode: "real", command: "exitApp", bundleName }
  };
}
