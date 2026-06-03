import fs from "node:fs/promises";
import path from "node:path";
import type { CommandEnvelope, CommandResult, Platform } from "@ada/contracts";
import { mergeSmartWait, parseSmartWaitFromPayload, runSmartWait, smartWaitFromEnv } from "@ada/driver-rpc";

export interface StepResult {
  step: number | string;
  ok: boolean;
  detail: string;
  recipePhase?: string;
  recipeErrorCode?: string;
  nodeCount?: number;
  timingMs?: number;
  extra?: Record<string, unknown>;
}

export interface InterStepWaitOptions {
  mode?: "fixed" | "ui_stable" | "launch_settled" | "timeout";
  ms?: number;
  maxMs?: number;
  pollMs?: number;
}

export interface E2eHarnessOptions {
  tag: string;
  outDir: string;
  runCommand: (command: CommandEnvelope) => Promise<CommandResult>;
  closeSession?: (
    platform: Platform,
    sessionId: string,
    options?: { engine?: "playwright"; payload?: Record<string, unknown> }
  ) => Promise<boolean>;
  listActiveSessions?: () => Array<{ platform: string; sessionId: string; engine?: string }>;
  shutdownExecutor?: (options?: { timeoutMs?: number }) => Promise<number>;
  stepTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  interStepMs?: number;
  interStepWait?: InterStepWaitOptions;
  /** recipe 失败时自动 dump_ui 到 artifacts */
  autoDumpOnFail?: boolean;
}

export function createE2eHarness(options: E2eHarnessOptions) {
  const {
    tag,
    outDir,
    runCommand,
    closeSession,
    listActiveSessions,
    shutdownExecutor,
    stepTimeoutMs = 180_000,
    shutdownTimeoutMs = 25_000,
    interStepMs = 1000,
    interStepWait,
    autoDumpOnFail = process.env.ADA_E2E_AUTO_DUMP_ON_FAIL !== "false"
  } = options;

  const results: StepResult[] = [];

  function log(msg: string) {
    console.log(`[${tag}] ${msg}`);
  }

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function record(
    step: number | string,
    ok: boolean,
    detail: string,
    extra: Record<string, unknown> = {}
  ) {
    const recipe = extra.recipe as { phase?: string; errorCode?: string; data?: { nodeCount?: number } } | undefined;
    results.push({
      step,
      ok,
      detail,
      recipePhase: recipe?.phase ?? (extra.recipePhase as string | undefined),
      recipeErrorCode: recipe?.errorCode ?? (extra.recipeErrorCode as string | undefined),
      nodeCount: recipe?.data?.nodeCount ?? (extra.nodeCount as number | undefined),
      timingMs: extra.timingMs as number | undefined,
      ...extra
    });
    log(`${ok ? "PASS" : "FAIL"} step${step}: ${detail}`);
  }

  async function interStepDelay(lastResult?: CommandResult) {
    const waitOpts = mergeSmartWait(
      interStepWait?.mode && interStepWait.mode !== "fixed"
        ? {
            until: interStepWait.mode,
            timeoutMs: interStepWait.maxMs ?? interStepMs,
            pollMs: interStepWait.pollMs
          }
        : { until: "timeout", timeoutMs: interStepMs },
      smartWaitFromEnv(),
      parseSmartWaitFromPayload(lastResult?.data as Record<string, unknown>)
    );
    await runSmartWait(undefined, waitOpts);
  }

  async function maybeDumpOnFail(step: number | string, platform: Platform, sessionId: string, basePayload: Record<string, unknown>) {
    if (!autoDumpOnFail) return;
    const dumpPath = path.join(outDir, `failed-step-${step}.json`);
    try {
      const res = await runCommand({
        requestId: `fail-dump-${step}-${Date.now()}`,
        sessionId,
        platform,
        command: "custom",
        payload: { ...basePayload, custom: { action: "dump_ui" } }
      });
      if (res.success && res.data?.value) {
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(dumpPath, String(res.data.value).slice(0, 500_000));
        log(`fail dump → ${dumpPath}`);
      }
    } catch {
      /* ignore */
    }
  }

  async function writeSummary(extra: Record<string, unknown> = {}) {
    await fs.mkdir(outDir, { recursive: true });
    const summaryPath = path.join(outDir, "summary.json");
    const payload = {
      ts: new Date().toISOString(),
      results: results.map((r) => ({
        step: r.step,
        ok: r.ok,
        detail: r.detail,
        recipePhase: r.recipePhase,
        recipeErrorCode: r.recipeErrorCode,
        nodeCount: r.nodeCount,
        timingMs: r.timingMs
      })),
      ...extra
    };
    await fs.writeFile(summaryPath, JSON.stringify(payload, null, 2));
    console.log("\n========== 汇总 ==========");
    for (const r of results) {
      console.log(`${r.ok ? "✓" : "✗"} ${r.step}. ${r.detail}`);
    }
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n通过 ${results.length - failed}/${results.length} → ${summaryPath}`);
    console.log(`截图: ${outDir}`);
    return failed;
  }

  async function runSteps(
    steps: Array<{ name?: string; fn: () => Promise<boolean> }>,
    options?: { abortOnFail?: boolean; platform?: Platform; sessionId?: string; basePayload?: Record<string, unknown> }
  ) {
    const abortOnFail = options?.abortOnFail !== false;
    let abort = false;
    let lastResult: CommandResult | undefined;
    for (const [i, step] of steps.entries()) {
      const stepNo = i + 1;
      if (abort) {
        record(stepNo, false, "skipped");
        continue;
      }
      log(`=== step ${stepNo}${step.name ? ` ${step.name}` : ""} ===`);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let ok = false;
      try {
        ok = await Promise.race([
          step.fn(),
          new Promise<boolean>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`step ${stepNo} timeout`)), stepTimeoutMs);
          })
        ]);
        if (!ok && abortOnFail) abort = true;
      } catch (e) {
        record(stepNo, false, e instanceof Error ? e.message : String(e));
        if (abortOnFail) abort = true;
        if (options?.platform && options.sessionId) {
          await maybeDumpOnFail(stepNo, options.platform, options.sessionId, options.basePayload ?? {});
        }
      } finally {
        clearTimeout(timer);
      }
      if (!ok && abortOnFail && options?.platform && options.sessionId) {
        await maybeDumpOnFail(stepNo, options.platform, options.sessionId, options.basePayload ?? {});
      }
      await interStepDelay(lastResult);
    }
  }

  async function teardownSessions(
    platform: Platform,
    sessionId: string,
    payload: Record<string, unknown>,
    engine?: "playwright"
  ) {
    if (!closeSession) return;
    await closeSession(platform, sessionId, { engine, payload }).catch(() => false);
    if (listActiveSessions) {
      for (const item of listActiveSessions()) {
        if (item.platform === platform && item.sessionId === sessionId) {
          await closeSession(platform, sessionId, { engine: item.engine as "playwright" | undefined, payload }).catch(
            () => false
          );
        }
      }
    }
  }

  async function shutdownAndExit(exitCode = 0) {
    log("cleanup: shutting down executor...");
    if (shutdownExecutor) {
      await shutdownExecutor({ timeoutMs: shutdownTimeoutMs }).catch((e) =>
        log(`cleanup warn: ${e instanceof Error ? e.message : String(e)}`)
      );
    }
    process.exit(exitCode);
  }

  function mobileRecipe(
    platform: "android" | "harmony" | "ios",
    sessionId: string,
    action: "dump_ui" | "tap_search" | "fill_search",
    basePayload: Record<string, unknown>,
    extra: Record<string, unknown> = {},
    requestId?: string
  ) {
    return runCommand({
      requestId: requestId ?? `${sessionId}-${action}-${Date.now()}`,
      sessionId,
      platform,
      command: "custom",
      payload: {
        ...basePayload,
        ...(extra.text ? { text: extra.text } : {}),
        custom: { action, ...extra }
      }
    });
  }

  return {
    log,
    sleep,
    record,
    results,
    writeSummary,
    runSteps,
    teardownSessions,
    shutdownAndExit,
    mobileRecipe,
    runCommand
  };
}
