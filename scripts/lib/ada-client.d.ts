/**
 * ada-client.mjs 类型入口（示例脚本 import 本文件即可获得补全）
 */

export {
  by,
  browser,
  device,
  open,
  web,
  android,
  harmony,
  ios,
  SWIPE_DURATION_MS,
  DEFAULT_ACTION_WAIT_MS,
  resolveSession,
  buildWebDevice,
  buildAndroidDevice,
  buildHarmonyDevice,
  buildIosDevice
} from "./ada-fluent.js";

export type {
  Platform,
  Point2,
  SwipePreset,
  SwipeDurationArg,
  SwipeOptions,
  LocatorSpec,
  WebLocator,
  MobileLocator,
  ElementHandle,
  FindHandle,
  WebPage,
  AndroidPhone,
  HarmonyPhone,
  IosPhone,
  MobilePhoneBase,
  GotoTarget,
  GotoAppOptions,
  BrowserOptions,
  DeviceOptions,
  OpenMcpOptions,
  DismissPopupsResult,
  KillAllAppsResult,
  ScreenSize,
  McpAttachment,
  SessionCloseOptions
} from "./ada-fluent.js";

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
  dismissWebPopups,
  dismissMobilePopups,
  DEFAULT_DISMISS_TIMEOUT_MS,
  normalizeDismissOpts
} from "./popups.mjs";

export { connectMcp, parseMcpToolResult, assertMcpOk, mcpNeedsRisk } from "./ada-mcp.js";

export { readDevice } from "./read-device.mjs";

export { stepLog } from "./step_log.mjs";
