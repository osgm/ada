import type { CommandEnvelope, CommandResult, CommandType, Platform } from "@ada/contracts";
import {
  normalizeCommandEnvelope,
  resolveBatchBudgetMs,
  resolveBatchStepTimeoutMs
} from "@ada/driver-rpc";
import type { StreamRequest, StreamResponse } from "@ada/transport-stream";

const CONTROL_META_ACTIONS = new Set(["ada_register", "ada_heartbeat", "ada_ping", "ada_device_sync"]);

const RECIPE_VERBS = new Set(["clickpath", "fill_search", "fillsearch", "tap_path", "tappath", "dump_ui", "dumpui", "tap_search", "tapsearch"]);

/** QA / 自然语言动词 → 驱动命令。不走大模型，保证稳定和速度。 */
const SEMANTIC_VERBS: Record<string, CommandType> = {
  goto: "navigate",
  open: "navigate",
  navigate: "navigate",
  click: "click",
  tap: "click",
  input: "type",
  fill: "type",
  type: "type",
  swipe: "swipe",
  screenshot: "screenshot",
  back: "back",
  hover: "hover",
  press: "press",
  wait: "wait",
  scroll: "scroll",
  reload: "reload",
  launch: "launchApp",
  launchapp: "launchApp"
};

export type InboundPlan =
  | { ok: true; kind: "meta" }
  | { ok: true; kind: "commands"; commands: CommandEnvelope[]; onFailure: "stop" | "continue" }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isCssSelector(value: string): boolean {
  const selector = value.trim();
  if (!selector) return false;
  if (/^[#.\[/]/.test(selector)) return true;
  if (/^(xpath=|css=|text=|id=)/i.test(selector)) return true;
  if (/^[a-zA-Z][\w-]*([#.\[:]|\s+[.#a-zA-Z]|>>)/.test(selector)) return true;
  if (selector.includes(">") || selector.includes(":nth")) return true;
  return false;
}

function applySelector(payload: Record<string, unknown>): void {
  const selector = asString(payload.selector);
  if (!selector || payload.locator) return;
  payload.locator = isCssSelector(selector) ? { css: selector } : { text: selector };
  delete payload.selector;
}

function platformOf(value: unknown, fallback: Platform): Platform {
  const raw = asString(value).toLowerCase();
  if (raw === "web" || raw === "android" || raw === "ios" || raw === "harmony") {
    return raw;
  }
  return fallback;
}

function sessionOf(step: Record<string, unknown>, request: StreamRequest, platform: Platform): string {
  return asString(step.sessionId) || asString(request.sessionId) || asString(request.payload?.sessionId) || `control-${platform}`;
}

function verbOf(step: Record<string, unknown>): string {
  return asString(step.command) || asString(step.action);
}

function toEnvelope(
  step: Record<string, unknown>,
  request: StreamRequest,
  index: number,
  platformHint: Platform,
  forceRecipe: boolean
): CommandEnvelope {
  const platform = platformOf(step.platform, platformHint);
  const verb = verbOf(step);
  const verbKey = verb.toLowerCase();
  const recipe = forceRecipe || RECIPE_VERBS.has(verbKey);
  const command: CommandType = recipe ? "recipe" : (SEMANTIC_VERBS[verbKey] ?? ((verb || "click") as CommandType));
  const payload: Record<string, unknown> = { ...step };
  delete payload.command;
  if (!recipe) {
    delete payload.action;
  } else if (!asString(payload.action)) {
    payload.action = verb;
  }
  applySelector(payload);
  payload.real = payload.real ?? true;
  payload.mock = false;
  const requestId = index === 0 ? request.requestId : `${request.requestId}#${index}`;
  return normalizeCommandEnvelope({
    requestId,
    sessionId: sessionOf(step, request, platform),
    platform,
    command,
    payload
  });
}

function stepList(payload: Record<string, unknown>): Record<string, unknown>[] | null {
  const actions = payload.actions;
  if (Array.isArray(actions)) {
    return actions.map((item) => asRecord(item));
  }
  const steps = payload.steps;
  if (Array.isArray(steps)) {
    return steps.map((item) => asRecord(item));
  }
  return null;
}

export function planInboundCommands(request: StreamRequest): InboundPlan {
  const action = asString(request.action);
  if (!action) {
    return { ok: false, error: "missing action" };
  }
  if (CONTROL_META_ACTIONS.has(action)) {
    return { ok: true, kind: "meta" };
  }
  const payload = asRecord(request.payload);
  const onFailure = asString(payload.onFailure) === "continue" ? "continue" : "stop";

  if (action === "ada_batch_actions") {
    const steps = stepList(payload);
    if (!steps || steps.length === 0) {
      return { ok: false, error: "ada_batch_actions requires actions or steps" };
    }
    const platform = platformOf(payload.platform, "web");
    const commands = steps.map((step, index) =>
      toEnvelope(
        {
          ...step,
          platform: step.platform ?? platform,
          sessionId: step.sessionId ?? payload.sessionId ?? request.sessionId
        },
        request,
        index,
        platform,
        false
      )
    );
    return { ok: true, kind: "commands", commands, onFailure };
  }

  if (action === "ada_web_action" || action === "ada_web_recipe") {
    return {
      ok: true,
      kind: "commands",
      onFailure: "stop",
      commands: [toEnvelope({ ...payload, platform: "web" }, request, 0, "web", action === "ada_web_recipe")]
    };
  }

  if (action === "ada_mobile_action" || action === "ada_mobile_recipe") {
    const platform = platformOf(payload.platform, "android");
    return {
      ok: true,
      kind: "commands",
      onFailure: "stop",
      commands: [
        toEnvelope(
          { ...payload, platform },
          request,
          0,
          platform,
          action === "ada_mobile_recipe"
        )
      ]
    };
  }

  return {
    ok: false,
    error: `unsupported control action: ${action}`
  };
}

function screenshotOf(data: unknown): string | undefined {
  const record = asRecord(data);
  const raw = record.screenshotUrl ?? record.screenshot ?? record.imageUrl;
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

export async function executeInboundPlan(
  request: StreamRequest,
  plan: InboundPlan,
  execute: (command: CommandEnvelope) => Promise<CommandResult>
): Promise<StreamResponse> {
  if (!plan.ok) {
    return { requestId: request.requestId, success: false, error: plan.error };
  }
  if (plan.kind === "meta") {
    return {
      requestId: request.requestId,
      success: true,
      payload: { accepted: true, action: request.action }
    };
  }

  // 剩余墙钟预算：前序步骤很快时，后续步可吃满剩余时间，避免均等切分导致后步过早超时。
  const budget = resolveBatchBudgetMs({
    timeoutMs: request.timeoutMs,
    actionCount: plan.commands.length,
    minBudgetMs: 5_000,
    overheadMs: 2_000
  });
  const deadline = Date.now() + budget;
  const results: CommandResult[] = [];
  let failedIndex: number | undefined;
  for (let index = 0; index < plan.commands.length; index += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) {
      failedIndex = index;
      results.push({
        requestId: plan.commands[index]!.requestId,
        success: false,
        errorCode: "INBOUND_BUDGET_EXHAUSTED",
        errorMessage: `inbound budget exhausted before step ${index + 1}/${plan.commands.length}`
      });
      if (plan.onFailure === "stop") break;
      continue;
    }
    const command = plan.commands[index]!;
    const payload = { ...(command.payload ?? {}) };
    if (typeof payload.commandTimeoutMs !== "number") {
      payload.commandTimeoutMs = resolveBatchStepTimeoutMs({
        remainingMs: remaining,
        totalSteps: plan.commands.length
      });
    } else {
      payload.commandTimeoutMs = resolveBatchStepTimeoutMs({
        remainingMs: remaining,
        totalSteps: plan.commands.length,
        explicitTimeoutMs: Number(payload.commandTimeoutMs)
      });
    }
    const result = await execute({ ...command, payload });
    results.push(result);
    if (!result.success) {
      failedIndex = index;
      if (plan.onFailure === "stop") break;
    }
  }
  const failed = results.find((item) => !item.success);
  const last = results[results.length - 1];
  const shot = screenshotOf(last?.data);
  const executed = plan.commands.slice(0, results.length).map((command, index) => ({
    index,
    platform: command.platform,
    sessionId: command.sessionId,
    command: command.command,
    success: results[index]?.success === true
  }));
  const summary = failed
    ? `failed at step ${(failedIndex ?? 0) + 1}/${plan.commands.length}: ${plan.commands[failedIndex ?? 0]?.command}`
    : `ok ${results.length} step(s): ${executed.map((item) => item.command).join("→")}`;
  return {
    requestId: request.requestId,
    success: !failed,
    error: failed
      ? `step ${(failedIndex ?? 0) + 1} failed: ${failed.errorMessage ?? failed.errorCode ?? "execution failed"}`
      : undefined,
    payload: {
      summary,
      executed,
      results: results.map((item) => ({
        requestId: item.requestId,
        success: item.success,
        data: item.data,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage
      })),
      ...(failedIndex !== undefined ? { failedIndex } : {}),
      ...(last?.data ? { result: last.data } : {}),
      ...(shot ? { screenshotUrl: shot } : {})
    }
  };
}
