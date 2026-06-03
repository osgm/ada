import {
  extractHarmonyDumpPath,
  parseHarmonyLayoutJson,
  raceCommandTimeout,
  resolveSubOperationTimeoutMs,
  UiDumpCache,
  type MobileRecipeContext,
  type ScreenSize
} from "@ada/driver-rpc";
import type { UiHeuristicsConfig } from "@ada/mobile-ui";
import { pasteTextViaHostClipboard, shellInputTextAt } from "./harmony-paste-text.js";

type HarmonyDriverLike = {
  click(x: number, y: number): Promise<void>;
  inputText(point: { x: number; y: number }, text: string): Promise<void>;
  pressBack(): Promise<void>;
  shell(cmd: string, timeout?: number): Promise<string>;
};

type HarmonyPayload = {
  commandTimeoutMs?: number;
  custom?: { timeoutMs?: number };
};

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function opTimeoutMs(payload: HarmonyPayload, fallbackMs: number): number {
  const cmd = numberOr(payload.commandTimeoutMs, 120_000);
  return resolveSubOperationTimeoutMs(cmd, fallbackMs, 0.85);
}

async function dumpHarmonyRaw(driver: HarmonyDriverLike, payload: HarmonyPayload): Promise<string> {
  const dumpOut = await raceCommandTimeout(
    driver.shell("uitest dumpLayout", numberOr(payload.custom?.timeoutMs, 20_000)),
    opTimeoutMs(payload, 25_000),
    "harmony.dumpLayout"
  );
  const remotePath = extractHarmonyDumpPath(String(dumpOut ?? ""));
  if (!remotePath) {
    throw new Error(`uitest dumpLayout: no path in output: ${String(dumpOut).slice(0, 200)}`);
  }
  return String(
    await raceCommandTimeout(
      driver.shell(`cat ${remotePath}`, numberOr(payload.custom?.timeoutMs, 12_000)),
      opTimeoutMs(payload, 15_000),
      "harmony.dumpLayout.cat"
    )
  );
}

export function buildHarmonyRecipeContext(
  driver: HarmonyDriverLike,
  payload: HarmonyPayload,
  screen: ScreenSize,
  heuristics?: UiHeuristicsConfig
): MobileRecipeContext {
  const dumpCache = new UiDumpCache();
  return {
    platform: "harmony",
    screen,
    heuristics,
    invalidateDumpCache() {
      dumpCache.invalidate();
    },
    async getDumpRaw() {
      return dumpCache.getOrLoad(() => dumpHarmonyRaw(driver, payload));
    },
    async dumpUi() {
      const raw = await this.getDumpRaw!();
      return parseHarmonyLayoutJson(raw);
    },
    async clickPoint(point) {
      dumpCache.invalidate();
      await driver.click(point[0], point[1]);
    },
    async typeAt(point, text) {
      dumpCache.invalidate();
      await driver.click(point[0], point[1]);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const shell = (cmd: string, timeout?: number) => driver.shell(cmd, timeout);
      if (await shellInputTextAt(shell, point[0], point[1], text)) return;
      try {
        await driver.inputText({ x: point[0], y: point[1] }, text);
        return;
      } catch {
        // fall through
      }
      if (await pasteTextViaHostClipboard(shell, text)) return;
      await driver.shell(`uitest uiInput text ${text}`, 8000);
    },
    async typeFocused(text) {
      dumpCache.invalidate();
      if (await pasteTextViaHostClipboard((cmd, timeout) => driver.shell(cmd, timeout), text)) return;
      await driver.shell(`uitest uiInput text ${text}`, 8000);
    },
    async pressEnter() {
      await driver.shell("uitest uiInput keyEvent 2054", 8000);
    },
    async pressBack() {
      dumpCache.invalidate();
      await driver.pressBack();
    },
    async shell(cmd) {
      return String(await driver.shell(cmd, 12_000));
    }
  };
}
