import { parseIosHierarchy, UiDumpCache, type MobileRecipeContext, type ScreenSize } from "@ada/driver-rpc";
import type { UiHeuristicsConfig, UiPickResult } from "@ada/mobile-ui";
import type { IOSControlChannel, IOSObserveChannel } from "./adapter.js";

export interface IosRecipeHooks {
  tapAt: (point: [number, number]) => Promise<void>;
  sendKeys: (text: string) => Promise<void>;
  clickPick?: (pick: UiPickResult) => Promise<void>;
  typeOnPick?: (pick: UiPickResult, text: string) => Promise<void>;
  heuristics?: UiHeuristicsConfig;
}

export function buildIosRecipeContext(
  observe: IOSObserveChannel,
  control: IOSControlChannel,
  screen: ScreenSize,
  hooks: IosRecipeHooks
): MobileRecipeContext {
  const dumpCache = new UiDumpCache();
  return {
    platform: "ios",
    screen,
    heuristics: hooks.heuristics,
    invalidateDumpCache() {
      dumpCache.invalidate();
    },
    async getDumpRaw() {
      if (!observe.pageSource) throw new Error("pageSource not available");
      return dumpCache.getOrLoad(() => observe.pageSource!());
    },
    async dumpUi() {
      const raw = await this.getDumpRaw!();
      return parseIosHierarchy(raw);
    },
    async clickPoint(point) {
      dumpCache.invalidate();
      await hooks.tapAt(point);
    },
    async clickPick(pick) {
      if (hooks.clickPick) {
        dumpCache.invalidate();
        await hooks.clickPick(pick);
        return;
      }
      dumpCache.invalidate();
      await hooks.tapAt(pick.point);
    },
    async typeAt(point, text) {
      dumpCache.invalidate();
      await hooks.tapAt(point);
      await hooks.sendKeys(text);
    },
    async typeOnPick(pick, text) {
      if (!hooks.typeOnPick) throw new Error("typeOnPick not available");
      dumpCache.invalidate();
      await hooks.typeOnPick(pick, text);
    },
    async typeFocused(text) {
      dumpCache.invalidate();
      await hooks.sendKeys(text);
    },
    async pressEnter() {
      await hooks.sendKeys("\n");
    },
    async pressBack() {
      dumpCache.invalidate();
      await control.back();
    }
  };
}
