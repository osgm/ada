import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import { withSuppressedHypiumProbeLogs } from "@ada/driver-rpc";
import {
  failResult,
  getTextFromPayload,
  type HarmonyDriverLike,
  type HarmonyPayload,
  isSearchLabel,
  isSearchLabelVisibleViaUiDump,
  resolveElement
} from "../runtime.js";

export async function runGetText(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  const text = await getTextFromPayload(driver, payload);
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "harmony", mode: "real", command: "getText", text }
  };
}

export async function runAssertText(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  const text = await getTextFromPayload(driver, payload);
  const expected = String(payload.expectedText ?? payload.text ?? "");
  if (!expected) {
    return failResult(command, "HARMONY_ASSERT_TEXT_MISSING_EXPECTED", "assertText requires payload.expectedText or payload.text");
  }
  if (!text.includes(expected)) {
    return failResult(command, "HARMONY_ASSERT_TEXT_FAILED", `Expected text "${expected}" not found in "${text}"`);
  }
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "harmony", mode: "real", command: "assertText", text, expected }
  };
}

export async function runAssertVisible(
  command: CommandEnvelope,
  driver: HarmonyDriverLike,
  payload: HarmonyPayload
): Promise<CommandResult> {
  const label = payload.locator?.text?.trim();
  if (label && isSearchLabel(label)) {
    const visible = await isSearchLabelVisibleViaUiDump(driver, payload, label);
    if (!visible) {
      return failResult(command, "HARMONY_ASSERT_VISIBLE_FAILED", `Element not found: text="${label}"`);
    }
    return {
      requestId: command.requestId,
      success: true,
      data: { driver: "harmony", mode: "real", command: "assertVisible", via: "uiDump" }
    };
  }
  const element = await withSuppressedHypiumProbeLogs(() => resolveElement(driver, payload));
  if (!element) {
    return failResult(command, "HARMONY_ASSERT_VISIBLE_FAILED", "Element not found");
  }
  return {
    requestId: command.requestId,
    success: true,
    data: { driver: "harmony", mode: "real", command: "assertVisible" }
  };
}
