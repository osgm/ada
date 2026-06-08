import type { MobileCustomAction } from "./mobile-custom.js";

export const RECIPE_ERROR_CODES = {
  TAP_SEARCH_FAILED: "RECIPE_TAP_SEARCH_FAILED",
  FILL_SEARCH_FAILED: "RECIPE_FILL_SEARCH_FAILED",
  FILL_SEARCH_NO_ENTRY: "RECIPE_FILL_SEARCH_NO_ENTRY",
  FILL_SEARCH_NO_INPUT: "RECIPE_FILL_SEARCH_NO_INPUT",
  FILL_SEARCH_TYPE_FAILED: "RECIPE_FILL_SEARCH_TYPE_FAILED",
  DUMP_UI_FAILED: "RECIPE_DUMP_UI_FAILED",
  FILL_SEARCH_MISSING_TEXT: "RECIPE_FILL_SEARCH_MISSING_TEXT",
  TAP_PATH_FAILED: "RECIPE_TAP_PATH_FAILED",
  TAP_PATH_SEGMENT_NOT_FOUND: "RECIPE_TAP_PATH_SEGMENT_NOT_FOUND"
} as const;

export type RecipeErrorCode = (typeof RECIPE_ERROR_CODES)[keyof typeof RECIPE_ERROR_CODES];

export function recipeErrorCodeForAction(action: MobileCustomAction, ok: boolean): string | undefined {
  if (ok) return undefined;
  switch (action) {
    case "tap_search":
      return RECIPE_ERROR_CODES.TAP_SEARCH_FAILED;
    case "fill_search":
      return RECIPE_ERROR_CODES.FILL_SEARCH_FAILED;
    case "dump_ui":
      return RECIPE_ERROR_CODES.DUMP_UI_FAILED;
    case "tap_path":
      return RECIPE_ERROR_CODES.TAP_PATH_FAILED;
    default:
      return "RECIPE_FAILED";
  }
}

export function platformRecipeErrorCode(platform: string, action: MobileCustomAction): string {
  const base = recipeErrorCodeForAction(action, false) ?? "RECIPE_FAILED";
  return `${platform.toUpperCase()}_${base}`;
}
