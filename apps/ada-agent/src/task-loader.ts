import fs from "node:fs/promises";
import type { CommandEnvelope, CommandType } from "@ada/contracts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const allowedCommands = new Set<CommandType>([
  "click",
  "type",
  "swipe",
  "assertVisible",
  "screenshot",
  "navigate",
  "hover",
  "press",
  "select",
  "scroll",
  "wait",
  "assertText",
  "getText",
  "back",
  "home",
  "pressHome",
  "launchApp",
  "exitApp",
  "recipe",
  "custom",
  "invoke",
  "forward",
  "newTab",
  "switchTab",
  "uploadFile",
  "dragDrop",
  "reload",
  "closeTab"
]);

function assertTask(value: unknown, index: number): CommandEnvelope {
  if (!isObject(value)) {
    throw new Error(`Task[${index}] is not an object.`);
  }

  const requestId = value.requestId;
  const sessionId = value.sessionId;
  const platform = value.platform;
  const command = value.command;

  if (typeof requestId !== "string" || typeof sessionId !== "string") {
    throw new Error(`Task[${index}] requestId/sessionId must be string.`);
  }
  if (platform !== "web" && platform !== "android" && platform !== "ios" && platform !== "harmony") {
    throw new Error(`Task[${index}] platform invalid: ${String(platform)}`);
  }
  if (typeof command !== "string" || !allowedCommands.has(command as CommandType)) {
    throw new Error(`Task[${index}] command invalid: ${String(command)}`);
  }

  return {
    requestId,
    sessionId,
    platform,
    command: command as CommandType,
    payload: isObject(value.payload) ? value.payload : undefined,
    idempotencyKey: typeof value.idempotencyKey === "string" ? value.idempotencyKey : undefined
  };
}

export async function loadTaskFile(filePath: string): Promise<CommandEnvelope[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Task file must be a JSON array.");
  }
  return parsed.map((item, idx) => assertTask(item, idx));
}
