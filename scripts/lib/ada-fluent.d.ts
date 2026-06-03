/**
 * ADA 流利 API 类型（page / phone / find）
 * 与 ada-fluent.mjs 同步；字段说明见 LOCATOR_MATRIX.md
 */

export type Platform = "web" | "android" | "harmony" | "ios";

export type SwipePreset = "fast" | "normal" | "slow" | "quick" | "default" | "快" | "中" | "慢";

export type Point2 = [number, number];

/** 滑动第三参：时长预设、毫秒对象、或含 times/gapMs 的配置 */
export type SwipeDurationArg =
  | number
  | SwipePreset
  | (SwipeOptions & { swipePreset?: SwipePreset; swipeSpeed?: SwipePreset; speed?: number });

export interface SwipeOptions {
  durationMs?: number;
  swipePreset?: SwipePreset;
  swipeSpeed?: SwipePreset;
  speed?: number;
  fling?: boolean;
  /** 为 true 时 from/to 数值按屏幕比例 0~1；默认 false 为像素 */
  relative?: boolean;
  /** 连续滑动次数，默认 1 */
  times?: number;
  /** 多次滑动间隔（毫秒），默认 280 */
  gapMs?: number;
}

/** 滑动点：像素/比例坐标、百分号轴、或命名占位符 */
export type SwipePointInput = Point2 | string;

export const SWIPE_DURATION_MS: {
  readonly fast: number;
  readonly normal: number;
  readonly slow: number;
};

export const DEFAULT_ACTION_WAIT_MS: number;

// —— Locator（by 工厂 / find 简写）——

export interface WebLocator {
  css?: string;
  xpath?: string;
  id?: string;
  text?: string;
  role?: string;
  name?: string;
  testId?: string;
  accessibilityId?: string;
  placeholder?: string;
  kind?: string;
  value?: string;
}

export interface MobileLocator {
  text?: string;
  id?: string;
  key?: string;
  type?: string;
  xpath?: string;
  byExpression?: string;
  accessibilityId?: string;
}

export type LocatorSpec = WebLocator | MobileLocator;

export interface ByFactory {
  id(name: string): WebLocator;
  css(selector: string): WebLocator;
  xpath(expr: string): WebLocator;
  text(label: string): WebLocator;
  role(role: string): WebLocator;
  testId(id: string): WebLocator;
  placeholder(text: string): WebLocator;
}

export const by: ByFactory;

// —— 元素句柄 —— 

export interface ElementHandle {
  click(): Promise<void>;
  fill(text: string): Promise<void>;
  /** 清空输入框（Web / Android / Harmony / iOS） */
  clear(): Promise<void>;
  /** Web：按键 */
  press(key: string): Promise<void>;
  exists(): Promise<boolean>;
  text(): Promise<string>;
}

export type FindHandle = (spec: LocatorSpec | string) => ElementHandle;

// —— 关弹窗 / 杀进程 —— 

export interface DismissPopupsResult {
  success: boolean;
  dismissed: boolean;
  businessCode: string;
  reason?: string;
  dismissActions?: number;
  rounds?: number;
  timedOut?: boolean;
  elapsedMs?: number;
  timeoutMs?: number;
  hits?: string[];
}

export type KillAllAppsCode = "APPS_KILLED" | "APPS_PARTIAL" | "APPS_NONE";

export interface KillAllAppsResult {
  success: boolean;
  cleared: boolean;
  businessCode: KillAllAppsCode | string;
  killedCount: number;
  failedCount: number;
  packages: string[];
  listSource: string;
  hits: string[];
}

export interface ScreenSize {
  width: number;
  height: number;
}

// —— Web page —— 

export interface WebPage {
  readonly sessionId: string;
  readonly options: Record<string, unknown>;
  goto(url: string): Promise<void>;
  /** 浏览器历史后退（语义命令 back）；`times` 为连续次数 */
  back(times?: number, gapMs?: number): Promise<void>;
  find: FindHandle;
  keyboard: { press(key: string): Promise<void> };
  screenshot(filePath: string): Promise<void>;
  newTab(url: string): Promise<void>;
  switchTab(tabIndex?: number): Promise<void>;
  closeTab(): Promise<void>;
  wait(timeoutMs?: number): Promise<void>;
  dismissPopups(
    dismissArg?: number | { timeoutMs?: number; attempts?: number },
    attemptsArg?: number
  ): Promise<DismissPopupsResult>;
  /** 关闭浏览器会话 */
  exit(): Promise<void>;
  close(opts?: SessionCloseOptions): Promise<void>;
  _mcp?: McpAttachment;
}

// —— 移动 phone 公共 —— 

export interface GotoAppOptions {
  appId: string;
  bundleId?: string;
  abilityId?: string;
  ability?: string;
  settleMs?: number;
}

export type GotoTarget = string | string[] | GotoAppOptions;

/** 设备管理（P0–P2，经 deviceAdmin 命令） */
export interface DeviceAdminApi {
  appList(opts?: { userOnly?: boolean; thirdPartyOnly?: boolean }): Promise<Record<string, unknown>>;
  listApps(opts?: { userOnly?: boolean; thirdPartyOnly?: boolean }): Promise<Record<string, unknown>>;
  app(appId: string): Promise<Record<string, unknown>>;
  appInfo(appId: string): Promise<Record<string, unknown>>;
  isInstalled(appId: string): Promise<Record<string, unknown>>;
  install(apkOrPath: string): Promise<Record<string, unknown>>;
  uninstall(appId: string): Promise<Record<string, unknown>>;
  push(localPath: string, remotePath: string): Promise<Record<string, unknown>>;
  pull(remotePath: string, localPath: string): Promise<Record<string, unknown>>;
  shell(command: string): Promise<Record<string, unknown>>;
  hdc(command: string): Promise<Record<string, unknown>>;
  currentApp(): Promise<Record<string, unknown>>;
  clearAppData(appId: string): Promise<Record<string, unknown>>;
  openDeepLink(url: string): Promise<Record<string, unknown>>;
  openUrl(url: string): Promise<Record<string, unknown>>;
  pressKey(key: string | number): Promise<Record<string, unknown>>;
  longPress(point: Point2, ms?: number): Promise<Record<string, unknown>>;
  setClipboard(text: string): Promise<Record<string, unknown>>;
  getClipboard(): Promise<Record<string, unknown>>;
  deviceInfo(): Promise<Record<string, unknown>>;
  grantPermission(appId: string, permission: string): Promise<Record<string, unknown>>;
  setOrientation(orientation: string): Promise<Record<string, unknown>>;
  startScreenRecord(remotePath?: string): Promise<Record<string, unknown>>;
  stopScreenRecord(): Promise<Record<string, unknown>>;
  reboot(): Promise<Record<string, unknown>>;
}

export interface FillSearchOptions {
  /** 兼容：同时作为 entry + input 匹配词 */
  hints?: string | string[];
  entryHints?: string[];
  inputHints?: string[];
  /** true 时不走文本/坐标 fallback */
  strict?: boolean;
  settleMs?: number;
  skipRedundantDump?: boolean;
}

export interface MobilePhoneBase extends DeviceAdminApi {
  readonly sessionId: string;
  readonly base: Record<string, unknown>;
  find: FindHandle;
  wake(): Promise<void>;
  killAllApps(opts?: { excludePackages?: string[] }): Promise<KillAllAppsResult>;
  swipe(from: Point2, to: Point2, durationOrOpts?: SwipeDurationArg): Promise<void>;
  /** 双指捏合/放大；`distance` 为每指径向位移；`opts.pinchIn` 必填 */
  pinch(
    finger1: SwipePointInput,
    finger2: SwipePointInput,
    distance: number,
    opts: { pinchIn: boolean } & SwipeOptions
  ): Promise<void>;
  back(times?: number, gapMs?: number): Promise<void>;
  goto(target: GotoTarget, second?: string | number, third?: number): Promise<void>;
  dismissPopups(
    dismissArg?: number | { timeoutMs?: number; attempts?: number },
    attemptsArg?: number
  ): Promise<DismissPopupsResult>;
  fillSearch(text: string, hintsOrOpts?: string | string[] | FillSearchOptions): Promise<void>;
  screenshot(filePath: string): Promise<void>;
  pressHome(): Promise<void>;
  /** 结束 App（移动，需传包名）或浏览器（Web）；无 appId 时为 no-op */
  exit(appId?: string): Promise<void>;
  /**
   * 默认 exit + 关闭 open 会话（MCP 时一并断开连接）；
   * keepApp / keepBrowser / keepTarget 为 true 时仅关会话。
   */
  close(opts?: SessionCloseOptions): Promise<void>;
  _mcp?: McpAttachment;
}

export interface SessionCloseOptions {
  keepApp?: boolean;
  keepBrowser?: boolean;
  keepTarget?: boolean;
}

export interface AndroidPhone extends MobilePhoneBase {
  readonly screen: ScreenSize;
}

export interface HarmonyPhone extends MobilePhoneBase {
  readonly screen: ScreenSize;
  suspend(): Promise<void>;
  /** 向当前焦点输入（需先 click 输入框） */
  type(text: string): Promise<void>;
}

export interface IosPhone extends MobilePhoneBase {
  readonly screen: ScreenSize;
}

// —— open / browser / device 描述符 —— 

export interface BrowserOptions {
  _openKind: "browser";
  type?: string;
  channel?: string;
  sessionId?: string;
  cdp?: boolean | number;
  profile?: string;
  timeoutMs?: number;
  actionWaitMs?: number;
  keepAlive?: boolean;
  headless?: boolean;
  waitTimeoutMs?: number;
  commandTimeoutMs?: number;
  userDataDir?: string;
  cdpAutoLaunch?: boolean;
  cdpPort?: number;
  [key: string]: unknown;
}

export type WebBrowserType =
  | "chrome"
  | "chromium"
  | "msedge"
  | "microsoft-edge"
  | "edge"
  | "firefox"
  | "webkit";

export function isWebBrowserType(type: string): boolean;

export interface DeviceOptions {
  _openKind: "device";
  platform: "android" | "harmony" | "ios";
  type?: "android" | "harmony" | "ios" | WebBrowserType;
  sessionId?: string;
  deviceId?: string;
  device_id?: string;
  real?: boolean;
  mock?: boolean;
  probeDevice?: boolean;
  appId?: string;
  abilityId?: string;
  timeoutMs?: number;
  actionWaitMs?: number;
  keepAlive?: boolean;
  screenWidth?: number;
  screenHeight?: number;
  excludePackages?: string[];
  capabilities?: Record<string, unknown>;
  waitTimeoutMs?: number;
  [key: string]: unknown;
}

export interface OpenMcpOptions {
  via?: "mcp";
  transport?: "mcp";
  connect?: "mcp";
  /** connectMcp() 返回值或裸 client */
  mcp?: unknown;
  client?: unknown;
  mcpOptions?: Record<string, unknown>;
}

/** open 第二参：`{ connect: "mcp" }`、`"mcp"`、裸 mcp 句柄或 OpenMcpOptions */
export type OpenMcpSecond =
  | "mcp"
  | OpenMcpOptions
  | { connect: "mcp"; mcp?: unknown; mcpOptions?: Record<string, unknown> }
  | { mcp: unknown; mcpOptions?: Record<string, unknown> };

export interface McpAttachment {
  client: unknown;
  owned: { close: () => Promise<void> } | null;
}

export function browser(opts?: Omit<BrowserOptions, "_openKind"> & { type?: string }): BrowserOptions;

export function device(
  opts: Omit<BrowserOptions, "_openKind" | "channel"> & { type: WebBrowserType }
): BrowserOptions;
export function device(
  opts?: Omit<DeviceOptions, "_openKind" | "platform"> & {
    type?: "android" | "harmony" | "ios";
    platform?: "android" | "harmony" | "ios";
  }
): DeviceOptions;

export function open(target: BrowserOptions, second?: OpenMcpSecond | unknown): Promise<WebPage>;
export function open(
  target: Omit<BrowserOptions, "_openKind"> & { type: WebBrowserType; _openKind?: "device"; platform?: WebBrowserType },
  second?: OpenMcpSecond | unknown
): Promise<WebPage>;
export function open(
  target: DeviceOptions & { platform: "android" },
  second?: OpenMcpSecond | unknown
): Promise<AndroidPhone>;
export function open(
  target: DeviceOptions & { platform: "harmony" },
  second?: OpenMcpSecond | unknown
): Promise<HarmonyPhone>;
export function open(target: DeviceOptions & { platform: "ios" }, second?: OpenMcpSecond | unknown): Promise<IosPhone>;
export function open(target: string, second?: BrowserOptions | OpenMcpSecond | unknown): Promise<WebPage>;

export function web(sessionIdOrOptions?: string | BrowserOptions, options?: BrowserOptions): WebPage;

export function android(
  sessionIdOrBase?: string | Record<string, unknown>,
  base?: Record<string, unknown>
): AndroidPhone;

export function harmony(
  sessionIdOrBase?: string | Record<string, unknown>,
  base?: Record<string, unknown>
): HarmonyPhone;

export function ios(
  sessionIdOrBase?: string | Record<string, unknown>,
  base?: Record<string, unknown>
): IosPhone;

export function resolveSession(
  platform: string,
  sessionIdOrBase?: string | Record<string, unknown>,
  baseMaybe?: Record<string, unknown>
): { sessionId: string; base: Record<string, unknown> };

export function buildWebDevice(
  sessionId: string,
  base: Record<string, unknown>,
  deps: Record<string, unknown>
): WebPage;

export function buildAndroidDevice(
  sessionId: string,
  cfg: Record<string, unknown>,
  screen: ScreenSize,
  deps: Record<string, unknown>
): AndroidPhone;

export function buildHarmonyDevice(
  sessionId: string,
  cfg: Record<string, unknown>,
  deps: Record<string, unknown>
): HarmonyPhone;

export function buildIosDevice(
  sessionId: string,
  cfg: Record<string, unknown>,
  screen: ScreenSize,
  deps: Record<string, unknown>
): IosPhone;
