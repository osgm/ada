import type { CommandEnvelope, CommandResult } from "@ada/contracts";

export interface AndroidPayload {
  mock?: boolean;
  serverUrl?: string;
  capabilities?: Record<string, unknown>;
  point?: [number, number];
  from?: [number, number];
  to?: [number, number];
  text?: string;
  elementId?: string;
  screenshotPath?: string;
  locator?: { id?: string; text?: string; accessibilityId?: string; xpath?: string; uiautomator?: string };
  /** clear：点定位元素后连续退格 */
  inputOp?: "clear" | "fill";
  androidInputOp?: "clear" | "fill";
  timeoutMs?: number;
  expectedText?: string;
  appId?: string;
  packageId?: string;
  screenWidth?: number;
  screenHeight?: number;
  commandTimeoutMs?: number;
  uiHeuristics?: Record<string, unknown>;
  custom?: {
    action?: string;
    method?: string;
    command?: string;
    timeoutMs?: number;
    path?: string;
    body?: Record<string, unknown>;
    text?: string;
    maxBack?: number;
    heuristics?: Record<string, unknown>;
  };
}

import type { ElementIdCache } from "@ada/driver-rpc";

export interface AndroidAdapterSession {
  sessionId: string;
  /** Device serial (adb mode) or UIA2/Appium base URL (http mode). */
  serverUrl: string;
  signature: string;
  transport?: "adb" | "http";
  elementCache?: ElementIdCache;
  hierarchyCache?: { xml: string; at: number };
}

export interface AndroidAdapter {
  readonly name: string;
  createSession(payload: AndroidPayload): Promise<AndroidAdapterSession>;
  execute(session: AndroidAdapterSession, command: CommandEnvelope, payload: AndroidPayload): Promise<CommandResult>;
  destroySession(session: AndroidAdapterSession): Promise<void>;
}

export interface AndroidControlChannel {
  click(point: [number, number]): Promise<void>;
  type(text: string): Promise<void>;
  swipe(from: [number, number], to: [number, number], durationMs?: number): Promise<void>;
  back(): Promise<void>;
  home(): Promise<void>;
  launchApp(appId: string): Promise<void>;
  exitApp(appId: string): Promise<void>;
}

export interface AndroidObserveChannel {
  screenshot(outputPath: string): Promise<string>;
  dumpHierarchy?(): Promise<string>;
}

