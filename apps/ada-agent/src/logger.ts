import { createJsonLogger } from "@ada/core-runtime";

type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  event: string;
  details?: unknown;
}

const baseLog = createJsonLogger("ada-agent");

export function log(level: LogLevel, payload: LogPayload): void {
  baseLog(level, payload);
}
