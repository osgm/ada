import { PluginHost, registerRuntimePlugins } from "@ada/plugin-host";
import type { PluginManifest } from "@ada/contracts";

export function buildPluginHost(): PluginHost {
  const host = new PluginHost();
  registerRuntimePlugins(host);
  return host;
}

export function listBuiltInPluginManifests(): PluginManifest[] {
  const host = new PluginHost();
  return registerRuntimePlugins(host);
}
