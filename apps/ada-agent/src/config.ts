import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { resolveWorkspaceRoot as resolveWorkspaceRootByCoreRuntime } from "@ada/core-runtime";
import { ensureGlobalAdaHome, readEffectiveAgentConfigYaml } from "@ada/install-deps";
import type { AgentConfig } from "./types.js";
import { bundledDefaultConfigYaml } from "./bundled-config.generated.js";

const DEFAULT_CONFIG_RELATIVE = path.join("config", "default.yaml");

export const defaultConfig: AgentConfig = {
  agent: {
    id: "ada-agent-local",
    mode: "foreground",
    setupOnFirstRun: true
  },
  bootstrapUI: {
    enabled: true,
    mode: "auto",
    host: "127.0.0.1",
    port: 17650,
    autoOpenBrowser: true,
    sessionTtlSec: 600,
    secretsProvider: "auto",
    native: {
      enabled: false,
      command: "",
      args: [],
      timeoutMs: 120000,
      fallbackToWeb: true
    }
  },
  transport: {
    mode: "auto",
    streamProtocol: "websocket",
    requestPath: "/api/v1/execute",
    healthPath: "/health",
    streamPath: "/ws",
    requestTimeoutMs: 15000
  },
  graphics: {
    enabled: false,
    fallbackOnSemanticFailure: false,
    minConfidence: 0.8
  },
  viewControl: {
    enabled: true,
    defaultControlMode: "semantic" as const,
    snapshot: {
      maxNodes: 500,
      includeScreenshot: true,
      cacheTtlMs: 3000
    },
    visual: {
      adapter: "noop" as const,
      requireRiskApproved: true
    },
    registry: {
      maxViewsPerSession: 200
    }
  },
  monitoring: {
    enabled: false,
    platforms: ["web", "android", "ios", "harmony"],
    sampleEvery: 1,
    outputDir: "artifacts/monitoring",
    onFailureOnly: false,
    groupBySession: true,
    nonBlocking: true,
    resolution: {
      maxWidth: 1280,
      maxHeight: 720,
      keepAspectRatio: true
    }
  },
  queue: {
    inboxDir: "tasks/inbox",
    processedDir: "tasks/processed",
    failedDir: "tasks/failed",
    pollIntervalMs: 3000,
    maxFileRetryAttempts: 2
  },
  devices: {
    autoScanOnSetup: true,
    autoScanOnStart: true
  },
  dependencies: {
    autoInstallOnStart: true,
    playwrightBrowser: "chromium",
    playwrightInstallTargets: ["chromium"],
    playwrightDownloadHost: "https://cdn.playwright.dev",
    npmRegistryCandidates: [
      "https://registry.npmmirror.com",
      "https://repo.huaweicloud.com/repository/npm",
      "https://registry.npmjs.org"
    ],
    playwrightHostCandidates: [
      "https://cdn.playwright.dev",
      "https://cdn.npmmirror.com/binaries/playwright",
      "https://npmmirror.com/mirrors/playwright",
      "https://playwright.azureedge.net"
    ],
    toolsDir: "tools",
    harmonyHdcDownloadUrls: [
      "https://raw.githubusercontent.com/osgm/ada/main/tools/hdc.exe"
    ],
    iosLibimobiledeviceDownloadUrls: [
      "https://github.com/libimobiledevice-win32/imobiledevice-net/releases/download/v1.3.17/libimobiledevice.1.2.1-r1122-win-x64.zip"
    ]
  }
};

function mergeConfig(base: AgentConfig, overrides: Partial<AgentConfig>): AgentConfig {
  const viewControlOverrides = overrides.viewControl;
  const mergedViewControl = base.viewControl
    ? {
        ...base.viewControl,
        ...(viewControlOverrides ?? {}),
        snapshot: {
          ...base.viewControl.snapshot,
          ...(viewControlOverrides?.snapshot ?? {})
        },
        visual: {
          ...base.viewControl.visual,
          ...(viewControlOverrides?.visual ?? {})
        },
        registry: {
          ...base.viewControl.registry,
          ...(viewControlOverrides?.registry ?? {})
        }
      }
    : undefined;
  return {
    ...base,
    ...overrides,
    agent: { ...base.agent, ...overrides.agent },
    bootstrapUI: { ...base.bootstrapUI, ...overrides.bootstrapUI },
    transport: { ...base.transport, ...overrides.transport },
    graphics: { ...base.graphics, ...overrides.graphics },
    ...(mergedViewControl ? { viewControl: mergedViewControl } : {}),
    monitoring: {
      ...base.monitoring,
      ...overrides.monitoring,
      resolution: { ...base.monitoring.resolution, ...overrides.monitoring?.resolution }
    },
    queue: { ...base.queue, ...overrides.queue },
    devices: { ...base.devices, ...overrides.devices },
    dependencies: { ...base.dependencies, ...overrides.dependencies }
  };
}

export async function resolveWorkspaceRoot(startDir = process.cwd()): Promise<string> {
  return resolveWorkspaceRootByCoreRuntime(DEFAULT_CONFIG_RELATIVE, startDir);
}

export async function ensureLocalDataDir(_cwd = process.cwd()): Promise<string> {
  return ensureGlobalAdaHome();
}

async function readEffectiveConfigOverrides(): Promise<Partial<AgentConfig> | null> {
  const effectiveFile = await readEffectiveAgentConfigYaml("agent.config.yaml");
  if (!effectiveFile) {
    return null;
  }
  return yaml.load(effectiveFile) as Partial<AgentConfig>;
}

export async function loadConfig(cwd = process.cwd()): Promise<AgentConfig> {
  let root = await resolveWorkspaceRoot(cwd);
  const defaultPath = path.join(root, DEFAULT_CONFIG_RELATIVE);
  let defaultRaw: string;
  try {
    defaultRaw = await fs.readFile(defaultPath, "utf8");
  } catch {
    /** 无磁盘上的 default.yaml 时使用构建期内嵌副本（单文件 / pkg 可执行体） */
    defaultRaw = bundledDefaultConfigYaml;
    root = path.dirname(process.execPath);
  }
  const defaultFromFile = yaml.load(defaultRaw) as Partial<AgentConfig>;
  const mergedDefault = mergeConfig(defaultConfig, defaultFromFile);

  const effective = await readEffectiveConfigOverrides();
  if (effective) {
    return mergeConfig(mergedDefault, effective);
  }
  return mergedDefault;
}

export async function saveEffectiveConfig(config: AgentConfig, _cwd = process.cwd()): Promise<void> {
  await ensureGlobalAdaHome();
  const effectivePath = resolveAgentEffectiveConfigPathSync();
  await fs.writeFile(effectivePath, yaml.dump(config), "utf8");
}

export function maskToken(token?: string): string {
  if (!token) {
    return "<none>";
  }
  if (token.length <= 8) {
    return `${token.slice(0, 2)}***${token.slice(-1)}`;
  }
  return `${token.slice(0, 4)}***${token.slice(-4)}`;
}
