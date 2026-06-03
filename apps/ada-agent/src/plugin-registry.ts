import { PluginHost, registerRuntimePlugins, resolvePackagePluginDir } from "@ada/plugin-host";
import type { PluginManifest } from "@ada/contracts";

const DEFAULT_DRIVER_MODULE_IDS = [
  "@ada/driver-playwright",
  "@ada/driver-android",
  "@ada/driver-ios",
  "@ada/driver-harmony"
] as const;

/** createRequire 锚点：CJS bundle 内 import.meta.url 为空，优先 __filename / MCP 入口 */
function resolvePluginRequireFrom(): string {
  if (typeof __filename === "string" && __filename.trim()) {
    return __filename;
  }
  const entry = process.env.ADA_MCP_SERVER_ENTRY?.trim() || process.argv[1]?.trim();
  if (entry) {
    return entry;
  }
  return process.cwd();
}

let cachedPluginHost: PluginHost | null = null;

export function buildPluginHost(): PluginHost {
  if (cachedPluginHost) {
    return cachedPluginHost;
  }
  const host = new PluginHost();
  const pluginDir = resolvePackagePluginDir();
  registerRuntimePlugins(host, {
    ...(pluginDir ? { pluginDir } : {}),
    moduleIds: [...DEFAULT_DRIVER_MODULE_IDS],
    requireFrom: resolvePluginRequireFrom()
  });
  cachedPluginHost = host;
  return host;
}

/** Drop cached host (tests or hot-reload). */
export function resetPluginHostCache(): void {
  cachedPluginHost = null;
}

export function listBuiltInPluginManifests(): PluginManifest[] {
  return buildPluginHost().listManifests();
}
