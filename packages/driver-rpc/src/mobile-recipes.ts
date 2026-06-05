import {
  extractHarmonyDumpPath,
  findUiNode,
  parseAndroidHierarchy,
  parseIosHierarchy,
  parseHarmonyLayoutJson,
  pickNodeByTextHints,
  type ScreenSize,
  type UiHeuristicsConfig,
  type UiNode,
  type UiPickResult
} from "@ada/mobile-ui";
import { parseFillSearchPayload, type ParsedFillSearchOptions } from "./fill-search-options.js";
import {
  detectFillSearchPageTransition,
  FILL_SEARCH_DEFAULT_SETTLE_MS,
  FILL_SEARCH_DIRECT_INPUT_SETTLE_MS,
  FILL_SEARCH_PAGE_TRANSITION_SETTLE_MS,
  isDirectInputTapDetail,
  resolveFillSearchSettleMs
} from "./fill-search-transition.js";
import { RECIPE_ERROR_CODES } from "./recipe-errors.js";
import { recipeSettleDelay, type UiDumpReader } from "./smart-wait.js";

export type MobilePlatform = "android" | "harmony" | "ios";

export interface MobileRecipeContext extends UiDumpReader {
  platform: MobilePlatform;
  screen: ScreenSize;
  heuristics?: UiHeuristicsConfig;
  getDumpRaw?(): Promise<string>;
  clickPoint(point: [number, number]): Promise<void>;
  typeAt(point: [number, number], text: string): Promise<void>;
  typeFocused?(text: string): Promise<void>;
  pressEnter(): Promise<void>;
  pressBack?(): Promise<void>;
  shell?(cmd: string): Promise<string>;
  invalidateDumpCache?(): void;
}

export interface RecipeOptions {
  maxBack?: number;
  skipRedundantDump?: boolean;
  settleMs?: number;
  payload?: Record<string, unknown>;
}

export interface RecipeResult {
  ok: boolean;
  detail: string;
  phase?: string;
  errorCode?: string;
  data?: Record<string, unknown>;
}

async function dumpWithRetry(ctx: MobileRecipeContext, retries = 1): Promise<UiNode[]> {
  let nodes = await safeDumpUi(ctx);
  if (nodes.length === 0 && retries > 0) {
    await recipeSettleDelay(ctx, undefined, 800);
    nodes = await safeDumpUi(ctx);
  }
  return nodes;
}

async function safeDumpUi(ctx: MobileRecipeContext, retries = 1): Promise<UiNode[]> {
  for (let i = 0; i <= retries; i += 1) {
    try {
      const nodes = await ctx.dumpUi();
      if (nodes.length > 0 || i === retries) return nodes;
    } catch {
      if (i === retries) return [];
    }
    await recipeSettleDelay(ctx, undefined, 350);
  }
  return [];
}

async function focusAndType(
  ctx: MobileRecipeContext,
  input: UiPickResult | null,
  point: [number, number],
  text: string,
  payload?: Record<string, unknown>
): Promise<string> {
  if (ctx.typeFocused) {
    if (input?.kind === "input") {
      ctx.invalidateDumpCache?.();
      await ctx.clickPoint(input.point);
      await recipeSettleDelay(ctx, payload, 350);
    }
    await ctx.typeFocused(text);
    return "typeFocused";
  }
  ctx.invalidateDumpCache?.();
  await ctx.typeAt(point, text);
  return "typeAt";
}

function fillSearchSuccess(
  point: [number, number],
  text: string,
  tap: RecipeResult,
  typeMode: string,
  extra: Record<string, unknown> = {}
): RecipeResult {
  return {
    ok: true,
    phase: "fill_search",
    detail: `fill @ ${point.join(",")}`,
    data: { point, text, tap, typeMode, enterOk: extra.enterOk ?? false, ...extra }
  };
}

function mergedHeuristics(ctx: MobileRecipeContext, parsed: ParsedFillSearchOptions): UiHeuristicsConfig | undefined {
  if (!ctx.heuristics && !parsed.heuristics) return undefined;
  return { ...ctx.heuristics, ...parsed.heuristics };
}

function findRole(
  nodes: UiNode[],
  ctx: MobileRecipeContext,
  role: "searchEntry" | "searchInput" | "homeTab",
  heuristics?: UiHeuristicsConfig
): UiPickResult | null {
  return findUiNode(nodes, {
    role,
    screen: ctx.screen,
    platform: ctx.platform === "ios" ? "android" : ctx.platform,
    heuristics: heuristics ?? ctx.heuristics
  });
}

function coordinateFallback(screen: ScreenSize, kind: "entry" | "input"): [number, number] {
  const yRatio = kind === "entry" ? 0.11 : 0.12;
  return [Math.round(screen.width / 2), Math.round(screen.height * yRatio)];
}

/** P1：按 hints 链式点击入口 → 输入框 → 输入（对齐脚本 find+fill 兜底） */
async function tryHintChainFill(
  ctx: MobileRecipeContext,
  parsed: ParsedFillSearchOptions,
  text: string,
  payload?: Record<string, unknown>
): Promise<RecipeResult | null> {
  if (parsed.strict || (!parsed.entryHints.length && !parsed.inputHints.length)) return null;

  let nodes = await ctx.dumpUi();
  for (const hint of parsed.entryHints) {
    const entry = pickNodeByTextHints(nodes, [hint], "searchEntry", ctx.screen);
    if (entry) {
      ctx.invalidateDumpCache?.();
      await ctx.clickPoint(entry.point);
      await recipeSettleDelay(ctx, payload, 600);
      nodes = await ctx.dumpUi();
      break;
    }
  }

  const inputHints = parsed.inputHints.length ? parsed.inputHints : parsed.entryHints;
  for (const hint of inputHints) {
    const input = pickNodeByTextHints(nodes, [hint], "searchInput", ctx.screen);
    if (!input) continue;
    try {
      ctx.invalidateDumpCache?.();
      await ctx.clickPoint(input.point);
      await recipeSettleDelay(ctx, payload, 400);
      if (ctx.typeFocused) {
        await ctx.typeFocused(text);
      } else {
        await ctx.typeAt(input.point, text);
      }
      return {
        ok: true,
        phase: "fill_search",
        detail: `hint chain @ ${input.point.join(",")}`,
        data: { point: input.point, text, pick: input, mode: "textHintChain", hint }
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function recipeDumpUi(ctx: MobileRecipeContext): Promise<RecipeResult> {
  const nodes = await ctx.dumpUi();
  return { ok: true, phase: "dump_ui", detail: `nodes=${nodes.length}`, data: { nodeCount: nodes.length } };
}

export async function recipeTapSearch(ctx: MobileRecipeContext, options?: RecipeOptions): Promise<RecipeResult> {
  const parsed = parseFillSearchPayload(options?.payload);
  const h = mergedHeuristics(ctx, parsed);
  const nodes = await dumpWithRetry(ctx);

  let input = findRole(nodes, ctx, "searchInput", h);
  if (input) {
    ctx.invalidateDumpCache?.();
    await ctx.clickPoint(input.point);
    return {
      ok: true,
      phase: "tap_search",
      detail: `direct input @ ${input.point.join(",")}`,
      data: { nodeCount: nodes.length, pick: input, mode: "heuristic", directInputTap: true }
    };
  }

  let entry = findRole(nodes, ctx, "searchEntry", h);
  let mode: "heuristic" | "textHint" | "coordinate" = "heuristic";
  if (!entry && parsed.entryHints.length && !parsed.strict) {
    entry = pickNodeByTextHints(nodes, parsed.entryHints, "searchEntry", ctx.screen);
    if (entry) mode = "textHint";
  }

  if (!entry) {
    if (parsed.strict) {
      return {
        ok: false,
        phase: "tap_search",
        errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_NO_ENTRY,
        detail: "search entry not found (strict)",
        data: { nodeCount: nodes.length, entryHints: parsed.entryHints }
      };
    }
    const fallback = coordinateFallback(ctx.screen, "entry");
    ctx.invalidateDumpCache?.();
    await ctx.clickPoint(fallback);
    return {
      ok: true,
      phase: "tap_search",
      detail: `fallback entry @ ${fallback.join(",")}`,
      data: { nodeCount: nodes.length, fallback: true, pick: { point: fallback, label: "fallback" }, mode: "coordinate" }
    };
  }

  ctx.invalidateDumpCache?.();
  await ctx.clickPoint(entry.point);
  await recipeSettleDelay(ctx, options?.payload, options?.settleMs ?? 800);
  const after = await ctx.dumpUi();
  input = findRole(after, ctx, "searchInput", h) ?? entry;
  return {
    ok: true,
    phase: "tap_search",
    detail: `tap entry @ ${entry.point.join(",")}`,
    data: { nodeCount: nodes.length, pick: entry, input, mode }
  };
}

export async function recipeFillSearch(
  ctx: MobileRecipeContext,
  text: string,
  options?: RecipeOptions
): Promise<RecipeResult> {
  if (!text) {
    return {
      ok: false,
      phase: "fill_search",
      errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_MISSING_TEXT,
      detail: "fill_search requires text"
    };
  }

  const parsed = parseFillSearchPayload(options?.payload);
  const h = mergedHeuristics(ctx, parsed);
  const mergedOpts: RecipeOptions = { ...options, ...parsed.recipeOptions, payload: options?.payload };

  const tap = await recipeTapSearch(ctx, mergedOpts);
  if (!tap.ok) {
    const chain = await tryHintChainFill(ctx, parsed, text, mergedOpts.payload);
    if (chain?.ok) {
      await recipeSettleDelay(ctx, mergedOpts.payload, 400);
      try {
        await ctx.pressEnter();
      } catch {
        /* optional */
      }
      return chain;
    }
    return {
      ...tap,
      phase: "fill_search",
      errorCode: tap.errorCode ?? RECIPE_ERROR_CODES.FILL_SEARCH_NO_ENTRY
    };
  }

  const postTapSettleMs =
    typeof mergedOpts.settleMs === "number" &&
    mergedOpts.settleMs > 0 &&
    !isDirectInputTapDetail(tap.detail)
      ? FILL_SEARCH_DEFAULT_SETTLE_MS
      : resolveFillSearchSettleMs(tap.detail, mergedOpts.settleMs);
  await recipeSettleDelay(ctx, mergedOpts.payload, postTapSettleMs);

  let nodes: UiNode[];
  let input: UiPickResult | null = null;
  let mode = (tap.data?.mode as string) ?? "heuristic";
  const tapInput = tap.data?.input as UiPickResult | undefined;
  const tapPick = tap.data?.pick as UiPickResult | undefined;
  const beforeCount = (tap.data?.nodeCount as number) ?? 0;

  if (mergedOpts.skipRedundantDump && (tapInput || tapPick?.kind === "input")) {
    input = tapInput ?? (tapPick?.kind === "input" ? tapPick : null);
    nodes = [];
  } else {
    nodes = await safeDumpUi(ctx);
    input = findRole(nodes, ctx, "searchInput", h);
    if (!input && parsed.inputHints.length && !parsed.strict) {
      input = pickNodeByTextHints(nodes, parsed.inputHints, "searchInput", ctx.screen);
      if (input) mode = "textHint";
    }

    const pageTransition = detectFillSearchPageTransition(
      tapPick,
      input,
      ctx.screen,
      beforeCount,
      nodes.length
    );
    if (pageTransition) {
      mode = "pageTransition";
      const userSettle = mergedOpts.settleMs;
      const extraMs =
        typeof userSettle === "number" && userSettle >= FILL_SEARCH_DIRECT_INPUT_SETTLE_MS
          ? 400
          : FILL_SEARCH_PAGE_TRANSITION_SETTLE_MS;
      await recipeSettleDelay(ctx, mergedOpts.payload, extraMs);
      ctx.invalidateDumpCache?.();
      nodes = await safeDumpUi(ctx);
      input =
        findRole(nodes, ctx, "searchInput", h) ??
        (parsed.inputHints.length && !parsed.strict
          ? pickNodeByTextHints(nodes, parsed.inputHints, "searchInput", ctx.screen)
          : null) ??
        input;
    }
  }

  if (!input && parsed.strict) {
    return {
      ok: false,
      phase: "fill_search",
      errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_NO_INPUT,
      detail: "search input not found (strict)",
      data: { tap, inputHints: parsed.inputHints, nodeCount: nodes.length }
    };
  }

  const point: [number, number] =
    input?.point ??
    tapInput?.point ??
    (tap.data?.fallback ? coordinateFallback(ctx.screen, "input") : coordinateFallback(ctx.screen, "input"));
  if (!input && !parsed.strict && mode !== "textHint") {
    mode = tap.data?.fallback ? "coordinate" : mode;
  }

  let typeMode = "typeAt";
  let typed = false;
  try {
    typeMode = await focusAndType(ctx, input, point, text, mergedOpts.payload);
    typed = true;
  } catch (e) {
    if (ctx.platform === "harmony" && ctx.shell) {
      try {
        typeMode = "uitest.inputText";
        ctx.invalidateDumpCache?.();
        await ctx.shell(`uitest uiInput inputText ${point[0]} ${point[1]} ${text}`);
        typed = true;
      } catch (shellErr) {
        return {
          ok: false,
          phase: "fill_search",
          errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
          detail: shellErr instanceof Error ? shellErr.message : String(shellErr),
          data: { point, tap, typeMode, pick: input, mode }
        };
      }
    } else if (!parsed.strict && parsed.inputHints.length) {
      const retryNodes = nodes.length ? nodes : await safeDumpUi(ctx);
      const hintInput = pickNodeByTextHints(retryNodes, parsed.inputHints, "searchInput", ctx.screen);
      if (hintInput) {
        try {
          typeMode = await focusAndType(ctx, hintInput, hintInput.point, text, mergedOpts.payload);
          input = hintInput;
          mode = "textHint";
          typed = true;
        } catch (retryErr) {
          return {
            ok: false,
            phase: "fill_search",
            errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
            detail: retryErr instanceof Error ? retryErr.message : String(retryErr),
            data: { point: hintInput.point, tap, typeMode, pick: hintInput, mode }
          };
        }
      } else {
        return {
          ok: false,
          phase: "fill_search",
          errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
          detail: e instanceof Error ? e.message : String(e),
          data: { point, tap, typeMode, pick: input, mode }
        };
      }
    } else {
      const chain = await tryHintChainFill(ctx, parsed, text, mergedOpts.payload);
      if (chain?.ok) {
        await recipeSettleDelay(ctx, mergedOpts.payload, 400);
        let enterOk = true;
        try {
          await ctx.pressEnter();
        } catch {
          enterOk = false;
        }
        return { ...chain, data: { ...chain.data, tap, enterOk } };
      }
      return {
        ok: false,
        phase: "fill_search",
        errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
        detail: e instanceof Error ? e.message : String(e),
        data: { point, tap, typeMode, pick: input, mode }
      };
    }
  }

  if (!typed) {
    return {
      ok: false,
      phase: "fill_search",
      errorCode: RECIPE_ERROR_CODES.FILL_SEARCH_TYPE_FAILED,
      detail: "type step did not run",
      data: { point, tap, typeMode, pick: input, mode }
    };
  }

  await recipeSettleDelay(ctx, mergedOpts.payload, 300);
  let enterOk = true;
  try {
    await ctx.pressEnter();
  } catch {
    enterOk = false;
  }

  return fillSearchSuccess(point, text, tap, typeMode, {
    enterOk,
    nodeCount: nodes.length,
    pick: input,
    mode,
    pageTransition: mode === "pageTransition"
  });
}

export { extractHarmonyDumpPath, parseAndroidHierarchy, parseIosHierarchy, parseHarmonyLayoutJson };
