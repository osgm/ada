import type { CommandEnvelope, CommandResult, InvokePayload } from "@ada/contracts";
import type { DriverSession } from "@ada/plugin-sdk";
import { normalizeInvokePayload } from "@ada/driver-rpc";
import {
  ensureReal,
  failResult,
  getOrCreateDriver,
  type HarmonyPayload,
  resolveDisplay
} from "../runtime.js";
import {
  runBack,
  runExitApp,
  runLaunchApp,
  runPressHome,
  runScreenshot,
  runWait
} from "./app.js";
import { runAssertText, runAssertVisible, runGetText } from "./assert.js";
import { runCustom, runInvoke } from "./custom.js";
import { runClick, runDeviceAdmin, runPinch, runSwipe, runType } from "./interaction.js";

export async function executeHarmonyCommand(
  session: DriverSession,
  command: CommandEnvelope
): Promise<CommandResult> {
  const payload = (command.payload ?? {}) as HarmonyPayload;

  if (payload.probe === true) {
    try {
      const driver = await getOrCreateDriver(session, payload);
      const size = await resolveDisplay(driver, session.id, payload);
      return {
        requestId: command.requestId,
        success: true,
        data: { driver: "harmony", platform: "harmony", probe: "ok", display: size }
      };
    } catch (error) {
      return failResult(command, "HARMONY_PROBE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command.command === "invoke") {
    const invoke = normalizeInvokePayload(payload as unknown as Record<string, unknown>, "method") as InvokePayload | null;
    if (!invoke?.method) {
      return failResult(command, "INVOKE_INVALID_PAYLOAD", "invoke requires payload.method");
    }
  }

  if (!ensureReal(payload)) {
    return {
      requestId: command.requestId,
      success: true,
      data: {
        driver: "harmony",
        platform: "harmony",
        command: command.command,
        mode: "mock",
        message: "Mock harmony command executed"
      }
    };
  }

  try {
    const driver = await getOrCreateDriver(session, payload);

    switch (command.command) {
      case "click":
        return runClick(command, driver, payload);
      case "type":
        return runType(command, driver, payload);
      case "swipe":
        return runSwipe(command, driver, payload);
      case "deviceAdmin":
        return runDeviceAdmin(command, driver, payload);
      case "pinch":
        return runPinch(command, driver, payload);
      case "screenshot":
        return runScreenshot(command, driver, payload);
      case "wait":
        return runWait(command, driver, payload);
      case "back":
        return runBack(command, driver);
      case "pressHome":
      case "home":
        return runPressHome(command, driver);
      case "launchApp":
        return runLaunchApp(command, driver, payload);
      case "exitApp":
        return runExitApp(command, driver, payload);
      case "getText":
        return runGetText(command, driver, payload);
      case "assertText":
        return runAssertText(command, driver, payload);
      case "assertVisible":
        return runAssertVisible(command, driver, payload);
      case "custom":
        return runCustom(command, driver, payload, session.id);
      case "invoke":
        return runInvoke(command, driver, payload);
      default:
        return failResult(
          command,
          "HARMONY_REAL_UNSUPPORTED_COMMAND",
          `Real mode does not support command: ${command.command}`
        );
    }
  } catch (error) {
    return failResult(command, "HARMONY_EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
  }
}
