import type { InstallDepsConfig } from "./types.js";
import {
  ensureDriverDependencies,
  getDependencyHealth,
  invalidateDependencyHealthCache,
  isInstallScopeComplete,
  type InstallScope
} from "./dependency-installer.js";
import { isPackageAvailable } from "./deps-resolution.js";
import { loadInstallDepsConfig } from "./load-install-deps-config.js";
import { depsLogLine } from "./log-locale.js";

export type PluginDepsGateResult = {
  ok: boolean;
  pluginId: string;
  scope: InstallScope | null;
  message: string;
  repaired?: boolean;
};

function truthy(raw: string | undefined): boolean {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function falsy(raw: string | undefined): boolean {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s === "0" || s === "false" || s === "no" || s === "off";
}

/** 插件启停默认自动补装缺失依赖；ADA_PLUGIN_AUTO_INSTALL_DEPS=0 仅检查不安装。 */
export function shouldAutoRepairPluginDeps(): boolean {
  if (falsy(process.env.ADA_PLUGIN_AUTO_INSTALL_DEPS)) {
    return false;
  }
  if (truthy(process.env.ADA_PLUGIN_AUTO_INSTALL_DEPS)) {
    return true;
  }
  // 未显式配置时：跟 MCP/Agent 安装策略一致，默认允许补装
  return !falsy(process.env.ADA_MCP_SKIP_INSTALL_DEPS);
}

/** 将插件 id / engine / 包名映射到安装范围。 */
export function resolvePluginInstallScope(pluginIdOrEngine: string): InstallScope | null {
  const raw = pluginIdOrEngine.trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("playwright") || raw === "web") return "playwright";
  if (raw.includes("harmony")) return "harmony";
  if (raw.includes("android")) return "android";
  if (raw.includes("ios")) return "ios";
  if (raw.includes("selenium")) return "playwright";
  return null;
}

async function softReady(
  scope: InstallScope,
  config: InstallDepsConfig
): Promise<{ ok: boolean; detail: string }> {
  if (scope === "playwright") {
    const complete = await isInstallScopeComplete("playwright", config);
    if (!complete && !isPackageAvailable("playwright")) {
      return { ok: false, detail: "playwright package missing" };
    }
    if (!complete) {
      return { ok: false, detail: "playwright browsers not ready" };
    }
    const health = await getDependencyHealth(config, { includeHarmony: false });
    if (!health.playwrightInstalled) {
      return { ok: false, detail: "playwright package missing" };
    }
    if (!health.playwrightLaunchOk) {
      return { ok: false, detail: "playwright browser launch failed" };
    }
    return { ok: true, detail: "playwright ready" };
  }

  if (scope === "harmony") {
    if (!isPackageAvailable("hypium-driver")) {
      return { ok: false, detail: "hypium-driver package missing" };
    }
    const complete = await isInstallScopeComplete("harmony", config);
    if (!complete) {
      return { ok: false, detail: "harmony install scope incomplete" };
    }
    return { ok: true, detail: "harmony ready" };
  }

  if (scope === "android" || scope === "ios") {
    const complete = await isInstallScopeComplete(scope, config);
    if (!complete) {
      // 移动端可能从未跑过该 scope 的 install state；有探测工具时仍允许启动
      return {
        ok: true,
        detail: `${scope} install state unmarked; runtime probe will gate device use`
      };
    }
    return { ok: true, detail: `${scope} ready` };
  }

  const complete = await isInstallScopeComplete(scope, config);
  return complete
    ? { ok: true, detail: `${scope} ready` }
    : { ok: false, detail: `${scope} install scope incomplete` };
}

export type AssertPluginDepsOptions = {
  pluginId: string;
  engine?: string;
  autoRepair?: boolean;
  config?: InstallDepsConfig;
  onLogLine?: (line: string) => void;
};

/**
 * 插件启动前依赖门禁：检查 →（可选）补装 → 再检查。
 * 失败时抛错，避免 init 成功但执行不可用。
 */
export async function assertPluginDependenciesReady(
  options: AssertPluginDepsOptions
): Promise<PluginDepsGateResult> {
  const pluginId = options.pluginId.trim();
  const scope =
    resolvePluginInstallScope(options.engine ?? "") ?? resolvePluginInstallScope(pluginId);
  if (!scope) {
    return {
      ok: true,
      pluginId,
      scope: null,
      message: `no dependency scope mapped for ${pluginId}; skip gate`
    };
  }

  const config = options.config ?? (await loadInstallDepsConfig());
  const autoRepair = options.autoRepair ?? shouldAutoRepairPluginDeps();
  const log = options.onLogLine;

  let ready = await softReady(scope, config);
  if (ready.ok) {
    return { ok: true, pluginId, scope, message: ready.detail };
  }

  if (!autoRepair) {
    const message = `Plugin ${pluginId} dependencies not ready (${ready.detail}). Run ada_install_deps only=${scope} or set ADA_PLUGIN_AUTO_INSTALL_DEPS=1.`;
    throw new Error(message);
  }

  log?.(
    depsLogLine(
      `[plugin-deps] ${pluginId} 依赖未就绪（${ready.detail}），自动补装 scope=${scope}`,
      `[plugin-deps] ${pluginId} deps not ready (${ready.detail}); auto-installing scope=${scope}`
    )
  );
  await ensureDriverDependencies(config, {
    only: scope,
    force: false,
    onLogLine: log
  });
  invalidateDependencyHealthCache();
  ready = await softReady(scope, config);
  if (!ready.ok) {
    throw new Error(
      `Plugin ${pluginId} still unavailable after auto-install (${ready.detail}). Run ada_install_deps only=${scope} force=true.`
    );
  }
  return {
    ok: true,
    pluginId,
    scope,
    message: ready.detail,
    repaired: true
  };
}

/** 插件停止后清依赖健康缓存，下次启动重新检查。 */
export function onPluginStopped(pluginId?: string): void {
  invalidateDependencyHealthCache();
  void pluginId;
}
