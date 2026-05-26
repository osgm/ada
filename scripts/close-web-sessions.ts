import { closeAllSessions, listActiveSessions } from "../apps/ada-mcp-server/src/executor.ts";

const before = listActiveSessions();
console.log("[close] sessions before:", before.length, before);
const closed = await closeAllSessions();
console.log("[close] closed:", closed);
