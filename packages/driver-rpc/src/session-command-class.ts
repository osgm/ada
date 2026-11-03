import type { CommandEnvelope, CommandType } from "@ada/contracts";

const READ_ONLY_COMMANDS = new Set<CommandType>([
  "screenshot",
  "wait",
  "getText",
  "assertVisible",
  "assertText"
]);

const READ_ONLY_DEVICE_ADMIN = new Set([
  "listApps",
  "appInfo",
  "currentApp",
  "getClipboard",
  "deviceInfo"
]);

const READ_ONLY_RECIPE = new Set(["dump_ui", "dump_hierarchy", "dump_layout"]);

function payloadAction(payload?: Record<string, unknown>): string {
  const p = payload ?? {};
  const custom = typeof p.custom === "object" && p.custom !== null ? (p.custom as Record<string, unknown>) : undefined;
  return String(p.action ?? custom?.action ?? "").trim();
}

/**
 * 同 session 只读命令可并行；写操作仍需互斥。
 * custom/invoke 默认按写处理（保守），避免未知副作用并发。
 */
export function isSessionReadOnlyCommand(command: Pick<CommandEnvelope, "command" | "payload">): boolean {
  if (READ_ONLY_COMMANDS.has(command.command)) {
    return true;
  }
  if (command.command === "deviceAdmin") {
    return READ_ONLY_DEVICE_ADMIN.has(payloadAction(command.payload));
  }
  if (command.command === "recipe") {
    return READ_ONLY_RECIPE.has(payloadAction(command.payload));
  }
  if (command.command === "custom") {
    const action = payloadAction(command.payload).toLowerCase();
    return action === "dump_ui" || action === "page_source" || action === "pagesource" || action === "source";
  }
  return false;
}
