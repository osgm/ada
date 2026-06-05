import type { CommandEnvelope, CommandResult } from "@ada/contracts";

export interface IOSPayload {
  mock?: boolean;
  serverUrl?: string;
  capabilities?: Record<string, unknown>;
  point?: [number, number];
  from?: [number, number];
  to?: [number, number];
  text?: string;
  elementId?: string;
  screenshotPath?: string;
  locator?: { id?: string; text?: string; accessibilityId?: string; xpath?: string };
  inputOp?: string;
  iosInputOp?: string;
  excludePackages?: string[];
  timeoutMs?: number;
  durationMs?: number;
  expectedText?: string;
  bundleId?: string;
  appId?: string;
  screenWidth?: number;
  screenHeight?: number;
  swipePreset?: string;
  pinchIn?: boolean;
  custom?: {
    method?: string;
    action?: string;
    path?: string;
    body?: Record<string, unknown>;
    text?: string;
    maxBack?: number;
  };
}

import type { ElementIdCache } from "@ada/driver-rpc";

export interface IOSAdapterSession {
  sessionId: string;
  serverUrl: string;
  signature: string;
  elementCache?: ElementIdCache;
}

export interface IOSAdapter {
  readonly name: string;
  createSession(payload: IOSPayload): Promise<IOSAdapterSession>;
  execute(session: IOSAdapterSession, command: CommandEnvelope, payload: IOSPayload): Promise<CommandResult>;
  destroySession(session: IOSAdapterSession): Promise<void>;
}

export interface IOSControlChannel {
  click(elementId: string): Promise<void>;
  type(elementId: string, text: string): Promise<void>;
  swipe(from: [number, number], to: [number, number], durationSec?: number): Promise<void>;
  back(): Promise<void>;
  home(): Promise<void>;
  launchApp(bundleId: string): Promise<void>;
  exitApp(bundleId: string): Promise<void>;
}

export interface IOSObserveChannel {
  screenshot(outputPath: string): Promise<string>;
  pageSource?(): Promise<string>;
}

