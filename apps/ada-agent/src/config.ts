import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { resolveWorkspaceRoot as resolveWorkspaceRootByCoreRuntime } from "@ada/core-runtime";
import type { AgentConfig } from "./types.js";
import { bundledDefaultConfigYaml } from "./bundled-config.generated.js";

const DEFAULT_CONFIG_RELATIVE = path.join("config", "default.yaml");
const LOCAL_DATA_DIR = path.join(".ada-agent");
const EFFECTIVE_CONFIG_FILE = path.join(LOCAL_DATA_DIR, "agent.config.yaml");

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
  dependencies: {
    autoInstallOnStart: true,
    playwrightBrowser: "chromium",
    playwrightInstallTargets: ["chromium"],
    playwrightDownloadHost: "https://cdn.playwright.dev",
    npmRegistryCandidates: [
      "https://registry.npmmirror.com",
      "https://mirrors.cloud.tencent.com/npm",
      "https://repo.huaweicloud.com/repository/npm",
      "https://registry.npmjs.org"
    ],
    playwrightHostCandidates: [
      "https://cdn.playwright.dev",
      "https://playwright.azureedge.net",
      "https://npmmirror.com/mirrors/playwright",
      "https://cdn.npmmirror.com/binaries/playwright"
    ],
    nativeDriversDir: "dirver",
    geckodriverVersion: "latest",
    chromedriverVersion: "match-chrome"
  },
  appium: {
    serverUrl: "http://127.0.0.1:4723",
    requiredDrivers: ["uiautomator2", "xcuitest", "harmonyos"]
  }
};

function mergeConfig(base: AgentConfig, overrides: Partial<AgentConfig>): AgentConfig {
  return {
    ...base,
    ...overrides,
    agent: { ...base.agent, ...overrides.agent },
    bootstrapUI: { ...base.bootstrapUI, ...overrides.bootstrapUI },
    transport: { ...base.transport, ...overrides.transport },
    graphics: { ...base.graphics, ...overrides.graphics },
    monitoring: {
      ...base.monitoring,
      ...overrides.monitoring,
      resolution: { ...base.monitoring.resolution, ...overrides.monitoring?.resolution }
    },
    queue: { ...base.queue, ...overrides.queue },
    dependencies: { ...base.dependencies, ...overrides.dependencies },
    appium: { ...base.appium, ...overrides.appium }
  };
}

export async function resolveWorkspaceRoot(startDir = process.cwd()): Promise<string> {
  return resolveWorkspaceRootByCoreRuntime(DEFAULT_CONFIG_RELATIVE, startDir);
}

export async function ensureLocalDataDir(cwd = process.cwd()): Promise<string> {
  const root = await resolveWorkspaceRoot(cwd);
  const dir = path.join(root, LOCAL_DATA_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
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

  const effectivePath = path.join(root, EFFECTIVE_CONFIG_FILE);
  try {
    const effectiveFile = await fs.readFile(effectivePath, "utf8");
    const effective = yaml.load(effectiveFile) as Partial<AgentConfig>;
    return mergeConfig(mergedDefault, effective);
  } catch {
    return mergedDefault;
  }
}

export async function saveEffectiveConfig(config: AgentConfig, cwd = process.cwd()): Promise<void> {
  const root = await resolveWorkspaceRoot(cwd);
  await ensureLocalDataDir(root);
  const effectivePath = path.join(root, EFFECTIVE_CONFIG_FILE);
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
