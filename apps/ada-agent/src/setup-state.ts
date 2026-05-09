import type { AgentConfig, BootstrapInput, SecretRecord } from "./types.js";
import { loadConfig, saveEffectiveConfig } from "./config.js";
import { loadSecret, saveSecret } from "./secrets.js";

/** 仅更新远程管理平台地址与 API Key，其余密钥字段尽量保留 */
export async function patchRemoteCredentials(serverUrl: string, token?: string): Promise<void> {
  const config = await loadConfig();
  const existing = await loadSecret(config.bootstrapUI.secretsProvider);
  const url = serverUrl.trim();
  if (!url) {
    throw new Error("远程管理平台地址不能为空");
  }
  const secret: SecretRecord = {
    serverUrl: url,
    tenant: existing?.tenant ?? "default",
    environment: existing?.environment ?? "default",
    authType: "token",
    token:
      token !== undefined && String(token).trim().length > 0 ? String(token).trim() : existing?.token,
    updatedAt: new Date().toISOString()
  };
  await saveSecret(secret, config.bootstrapUI.secretsProvider);
}

const PW_TARGET = new Set([
  "chromium",
  "chrome",
  "firefox",
  "webkit",
  "msedge",
  "all"
]);

export function normalizePlaywrightTargets(raw: string[] | undefined): {
  playwrightBrowser: AgentConfig["dependencies"]["playwrightBrowser"];
  playwrightInstallTargets: AgentConfig["dependencies"]["playwrightInstallTargets"];
} {
  const list = (raw ?? []).map((x) => String(x).toLowerCase().trim()).filter((x) => PW_TARGET.has(x));
  if (list.includes("all")) {
    return { playwrightBrowser: "all", playwrightInstallTargets: ["all"] };
  }
  if (list.length === 0) {
    return { playwrightBrowser: "chromium", playwrightInstallTargets: ["chrome"] };
  }
  const ordered = ["chromium", "chrome", "firefox", "webkit", "msedge"].filter((x) => list.includes(x));
  const primary =
    ordered.find((x) => x === "chromium" || x === "firefox" || x === "webkit") ??
    ("chromium" as const);
  return {
    playwrightBrowser: primary as AgentConfig["dependencies"]["playwrightBrowser"],
    playwrightInstallTargets: ordered as AgentConfig["dependencies"]["playwrightInstallTargets"]
  };
}

export function mergeBootstrapIntoConfig(base: AgentConfig, input: BootstrapInput): AgentConfig {
  const dep = input.dependencies;
  const pw =
    dep?.playwrightInstallTargets !== undefined
      ? normalizePlaywrightTargets(dep.playwrightInstallTargets)
      : {
          playwrightBrowser: base.dependencies.playwrightBrowser,
          playwrightInstallTargets: base.dependencies.playwrightInstallTargets
        };

  return {
    ...base,
    transport: {
      ...base.transport,
      mode: input.transportMode,
      streamProtocol: input.streamProtocol,
      ...(dep?.requestTimeoutMs !== undefined && Number.isFinite(dep.requestTimeoutMs)
        ? { requestTimeoutMs: Math.max(1000, Math.floor(dep.requestTimeoutMs)) }
        : {})
    },
    dependencies: {
      ...base.dependencies,
      ...(dep?.autoInstallOnStart !== undefined
        ? { autoInstallOnStart: dep.autoInstallOnStart }
        : {}),
      ...(dep?.playwrightDownloadHost !== undefined && dep.playwrightDownloadHost.trim()
        ? { playwrightDownloadHost: dep.playwrightDownloadHost.trim() }
        : {}),
      playwrightBrowser: pw.playwrightBrowser,
      playwrightInstallTargets: pw.playwrightInstallTargets
    },
    appium:
      dep?.appiumServerUrl !== undefined && dep.appiumServerUrl.trim()
        ? { ...base.appium, serverUrl: dep.appiumServerUrl.trim() }
        : base.appium,
    ...(dep?.graphicsEnabled !== undefined
      ? {
          graphics: {
            ...base.graphics,
            enabled: dep.graphicsEnabled
          }
        }
      : {}),
    ...(dep?.monitoringEnabled !== undefined
      ? {
          monitoring: {
            ...base.monitoring,
            enabled: dep.monitoringEnabled
          }
        }
      : {})
  };
}

export async function persistAgentSetup(config: AgentConfig, input: BootstrapInput): Promise<AgentConfig> {
  const secret: SecretRecord = {
    serverUrl: input.serverUrl,
    tenant: input.tenant,
    environment: input.environment,
    authType: input.authType,
    token: input.token,
    updatedAt: new Date().toISOString()
  };
  await saveSecret(secret, config.bootstrapUI.secretsProvider);
  const updated = mergeBootstrapIntoConfig(config, input);
  await saveEffectiveConfig(updated);
  return updated;
}
