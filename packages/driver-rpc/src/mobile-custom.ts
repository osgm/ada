import {
  recipeDumpUi,
  recipeFillSearch,
  recipeTapSearch,
  type MobileRecipeContext,
  type RecipeOptions,
  type RecipeResult
} from "./mobile-recipes.js";
import { RECIPE_ERROR_CODES, recipeErrorCodeForAction } from "./recipe-errors.js";
import { recipeSettleDelay } from "./smart-wait.js";

export type MobileCustomAction =
  | "dump_ui"
  | "dump_hierarchy"
  | "dump_layout"
  | "tap_search"
  | "fill_search";

export function normalizeMobileCustomAction(action: string, method?: string): string {
  const a = String(action || method || "").toLowerCase();
  if (a === "dump_hierarchy" || a === "dump_layout") return "dump_ui";
  return a;
}

export interface MobileCustomOutcome {
  handled: boolean;
  value?: string;
  recipe?: RecipeResult;
  errorCode?: string;
}

function recipeOptionsFromPayload(payload?: Record<string, unknown>): RecipeOptions {
  const p = payload ?? {};
  const custom = (typeof p.custom === "object" && p.custom !== null ? p.custom : {}) as Record<string, unknown>;
  return {
    maxBack: typeof custom.maxBack === "number" ? custom.maxBack : undefined,
    skipRedundantDump: custom.skipRedundantDump === true || p.skipRedundantDump === true,
    settleMs: typeof custom.settleMs === "number" ? custom.settleMs : undefined,
    payload: p
  };
}

export async function runMobileCustomAction(
  rawAction: string,
  ctx: MobileRecipeContext,
  options?: { text?: string; maxBack?: number; payload?: Record<string, unknown> }
): Promise<MobileCustomOutcome> {
  const action = normalizeMobileCustomAction(rawAction) as MobileCustomAction;
  const recipeOpts = recipeOptionsFromPayload(options?.payload);
  if (typeof options?.maxBack === "number") {
    recipeOpts.maxBack = options.maxBack;
  }

  if (action === "smart_wait") {
    const payload = options?.payload ?? {};
    const waitBlock = (payload.wait ?? payload.custom?.wait) as Record<string, unknown> | undefined;
    const fallbackMs =
      typeof waitBlock?.timeoutMs === "number"
        ? waitBlock.timeoutMs
        : typeof waitBlock?.maxMs === "number"
          ? waitBlock.maxMs
          : typeof payload.settleMs === "number"
            ? payload.settleMs
            : 8000;
    await recipeSettleDelay(ctx, payload, fallbackMs);
    return { handled: true, value: "ok" };
  }

  if (action === "dump_ui") {
    const raw = ctx.getDumpRaw ? await ctx.getDumpRaw() : JSON.stringify(await ctx.dumpUi());
    const recipe = await recipeDumpUi(ctx);
    return { handled: true, value: raw, recipe };
  }

  if (action === "tap_search") {
    const recipe = await recipeTapSearch(ctx, recipeOpts);
    const errorCode = recipe.ok ? undefined : recipeErrorCodeForAction(action, false);
    return { handled: true, recipe, errorCode, value: recipe.detail };
  }

  if (action === "fill_search") {
    const text = String(options?.text ?? "");
    if (!text) {
      return {
        handled: true,
        recipe: { ok: false, phase: "fill_search", detail: "fill_search requires text", errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_MISSING_TEXT },
        errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_MISSING_TEXT
      };
    }
    const recipe = await recipeFillSearch(ctx, text, recipeOpts);
    const errorCode = recipe.ok ? undefined : recipe.errorCode ?? recipeErrorCodeForAction(action, false);
    return { handled: true, recipe, errorCode, value: recipe.detail };
  }

  return { handled: false };
}
