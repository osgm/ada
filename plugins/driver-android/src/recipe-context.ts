import { parseAndroidHierarchy, type MobileRecipeContext, type ScreenSize, UiDumpCache } from "@ada/driver-rpc";
import type { UiHeuristicsConfig } from "@ada/mobile-ui";
import { runAdb } from "./adb-runner.js";
import type { AndroidControlChannel, AndroidObserveChannel, AndroidPayload } from "./adapter.js";

export interface AndroidRecipeCacheHooks {
  getCachedRaw: () => Promise<string>;
  invalidate: () => void;
}

export function buildAndroidRecipeContext(
  serial: string,
  observe: AndroidObserveChannel,
  control: AndroidControlChannel,
  screen: ScreenSize,
  _payload: AndroidPayload,
  heuristics?: UiHeuristicsConfig,
  cacheHooks?: AndroidRecipeCacheHooks
): MobileRecipeContext {
  const localCache = cacheHooks ? undefined : new UiDumpCache();
  return {
    platform: "android",
    screen,
    heuristics,
    invalidateDumpCache() {
      cacheHooks?.invalidate();
      localCache?.invalidate();
    },
    async getDumpRaw() {
      if (cacheHooks) {
        return cacheHooks.getCachedRaw();
      }
      if (!observe.dumpHierarchy) throw new Error("dumpHierarchy not available");
      return localCache!.getOrLoad(async () => observe.dumpHierarchy!());
    },
    async dumpUi() {
      const raw = await this.getDumpRaw!();
      return parseAndroidHierarchy(raw);
    },
    async clickPoint(point) {
      this.invalidateDumpCache?.();
      await control.click(point);
    },
    async typeFocused(text) {
      this.invalidateDumpCache?.();
      await control.type(text);
    },
    async typeAt(point, text) {
      this.invalidateDumpCache?.();
      await control.click(point);
      await control.type(text);
    },
    async pressEnter() {
      const res = await runAdb(serial, ["shell", "input", "keyevent", "KEYCODE_ENTER"]);
      if (!res.ok) throw new Error(res.stderr || "KEYCODE_ENTER failed");
    },
    async pressBack() {
      const res = await runAdb(serial, ["shell", "input", "keyevent", "KEYCODE_BACK"]);
      if (!res.ok) throw new Error(res.stderr || "KEYCODE_BACK failed");
    }
  };
}
