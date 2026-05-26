import { PluginHost, registerRuntimePlugins, resolvePackagePluginDir } from "@ada/plugin-host";
import type { PluginManifest } from "@ada/contracts";

export function buildPluginHost(): PluginHost {
  const host = new PluginHost();
  const pluginDir = resolvePackagePluginDir();
  registerRuntimePlugins(host, pluginDir ? { pluginDir } : undefined);
  return host;
}

export function listBuiltInPluginManifests(): PluginManifest[] {
  return buildPluginHost().listManifests();
}
