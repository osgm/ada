import type { CommandEnvelope, CommandType } from "@ada/contracts";

/** 对外推荐名 → 内部 canonical 命令 */
const COMMAND_ALIASES: Record<string, CommandType> = {
  terminateApp: "exitApp",
  fill: "type",
  tap: "click",
  /** 系统 Home 键（勿与 phone.goto 页面跳转混淆） */
  home: "pressHome"
};

export const MOBILE_RECIPE_ACTIONS = ["dump_ui", "tap_search", "fill_search"] as const;
export type MobileRecipeAction = (typeof MOBILE_RECIPE_ACTIONS)[number];

export function normalizeCommandName(raw: string): CommandType {
  const trimmed = raw.trim();
  return (COMMAND_ALIASES[trimmed] ?? trimmed) as CommandType;
}

/**
 * 统一 payload 字段（入口收口，驱动内只读 canonical 名）
 */
export function normalizePayload(payload: Record<string, unknown> = {}): Record<string, unknown> {
  const p = { ...payload };

  if (p.appId == null || p.appId === "") {
    const id = p.bundleId ?? p.packageId ?? p.package;
    if (id != null && id !== "") p.appId = id;
  }
  delete p.bundleId;
  delete p.packageId;
  delete p.package;

  if (p.durationMs == null && p.speed != null) {
    p.durationMs = p.speed;
  }

  if (p.waitTimeoutMs == null && p.actionWaitMs != null) {
    p.waitTimeoutMs = p.actionWaitMs;
  }

  return p;
}

function expandRecipeToCustom(
  envelope: CommandEnvelope,
  payload: Record<string, unknown>
): CommandEnvelope {
  const action = String(payload.action ?? "").trim();
  const text = payload.text;
  const customBlock =
    typeof payload.custom === "object" && payload.custom !== null
      ? (payload.custom as Record<string, unknown>)
      : {};
  return {
    ...envelope,
    command: "custom",
    payload: {
      ...payload,
      text,
      custom: {
        ...customBlock,
        action: action || customBlock.action,
        ...(text !== undefined && text !== "" ? { text } : {})
      }
    }
  };
}

/** 执行前规范化：命令别名 + payload + recipe → custom（驱动实现不变） */
export function normalizeCommandEnvelope(envelope: CommandEnvelope): CommandEnvelope {
  const command = normalizeCommandName(envelope.command);
  const payload = normalizePayload(envelope.payload ?? {});

  if (command === "recipe") {
    return expandRecipeToCustom({ ...envelope, command }, payload);
  }

  return { ...envelope, command, payload };
}
