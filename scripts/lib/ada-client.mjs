/**
 * ADA 示例统一入口 — 业务脚本只需 import 本文件（与 ada_client.py API 并集）。
 *
 *   import { open, browser, device, dir, by, wait, setKeepAlive, init, stepLog, exit } from "../../../lib/ada-client.mjs";
 */
export {
  ada,
  adaRecipe,
  adaClose,
  exit,
  mustOk,
  wait,
  init,
  isKeepAlive,
  setKeepAlive
} from "./ada.mjs";

export { dir, readText, writeText, readJson, writeJson } from "./example-fs.mjs";

export {
  web,
  open,
  android,
  harmony,
  ios,
  by,
  browser,
  device,
  SWIPE_DURATION_MS
} from "./ada-fluent.mjs";

export {
  dismissWebPopups,
  dismissMobilePopups,
  DEFAULT_DISMISS_TIMEOUT_MS,
  normalizeDismissOpts
} from "./popups.mjs";

export { connectMcp, parseMcpToolResult } from "./ada-mcp.mjs";

export { readDevice } from "./read-device.mjs";

export { stepLog } from "./step_log.mjs";
