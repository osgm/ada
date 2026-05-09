import type { Platform } from "@ada/contracts";
import type { DriverPlugin } from "@ada/plugin-sdk";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

interface PluginHealthItem {
  id: string;
  ok: boolean;
  message: string;
}

function assertManifest(plugin: DriverPlugin): void {
  const m = plugin.manifest;
  if (!m.id || !m.version) {
    throw new Error("Invalid plugin manifest: missing id/version");
  }
  if (!Array.isArray(m.platforms) || m.platforms.length === 0) {
    throw new Error(`Invalid plugin manifest (${m.id}): platforms is empty`);
  }
  if (!Array.isArray(m.capabilities)) {
    throw new Error(`Invalid plugin manifest (${m.id}): capabilities must be array`);
  }
  if (!/^\d+\.\d+\.\d+/.test(m.version)) {
    throw new Error(`Invalid plugin manifest (${m.id}): version must look like semver`);
  }
}

export class PluginHost {
  private readonly plugins = new Map<Platform, DriverPlugin>();
  private readonly manifests = new Map<string, DriverPlugin["manifest"]>();
  private readonly pluginById = new Map<string, DriverPlugin>();
  private readonly initializedPluginIds = new Set<string>();

  register(plugin: DriverPlugin): void {
    assertManifest(plugin);
    if (this.manifests.has(plugin.manifest.id)) {
      throw new Error(`Plugin already registered: ${plugin.manifest.id}`);
    }
    for (const platform of plugin.manifest.platforms) {
      if (this.plugins.has(platform)) {
        throw new Error(`Platform already has plugin (${platform}), reject: ${plugin.manifest.id}`);
      }
    }
    this.manifests.set(plugin.manifest.id, plugin.manifest);
    this.pluginById.set(plugin.manifest.id, plugin);
    for (const platform of plugin.manifest.platforms) {
      this.plugins.set(platform, plugin);
    }
  }

  resolve(platform: Platform): DriverPlugin {
    const plugin = this.plugins.get(platform);
    if (!plugin) {
      throw new Error(`No plugin registered for platform: ${platform}`);
    }
    return plugin;
  }

  listManifests(): DriverPlugin["manifest"][] {
    return Array.from(this.manifests.values());
  }

  async ensureInitialized(pluginId: string, timeoutMs = 15000): Promise<void> {
    if (this.initializedPluginIds.has(pluginId)) {
      return;
    }
    const plugin = this.pluginById.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not registered: ${pluginId}`);
    }
    await Promise.race([
      plugin.init(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Plugin init timeout: ${pluginId}`)), timeoutMs)
      )
    ]);
    this.initializedPluginIds.add(pluginId);
  }

  async healthCheck(timeoutMs = 5000): Promise<PluginHealthItem[]> {
    const items: PluginHealthItem[] = [];
    for (const [id] of this.manifests) {
      try {
        await this.ensureInitialized(id, timeoutMs);
        items.push({ id, ok: true, message: "healthy" });
      } catch (error) {
        items.push({
          id,
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return items;
  }
}

const DEFAULT_PLUGIN_MODULE_IDS = ["@ada/driver-playwright", "@ada/driver-appium"];

function isPluginModule(mod: unknown): mod is DriverPlugin {
  if (!mod || typeof mod !== "object") {
    return false;
  }
  const m = (mod as DriverPlugin).manifest;
  return !!m && typeof m.id === "string" && Array.isArray(m.platforms);
}

function resolvePluginDirs(explicitPluginDir?: string): string[] {
  const fromEnv = process.env.ADA_PLUGIN_DIR?.trim();
  const execDir = path.dirname(process.execPath);
  const cwd = process.cwd();
  return Array.from(
    new Set(
      [fromEnv, explicitPluginDir, path.join(execDir, "plugins"), path.join(cwd, "plugins"), path.join(cwd, "release", "plugins")]
        .filter((x): x is string => Boolean(x && x.trim()))
        .map((x) => path.resolve(x))
    )
  );
}

function loadPluginFromModule(requireFn: NodeRequire, moduleId: string): DriverPlugin | null {
  try {
    const loaded = requireFn(moduleId) as { default?: unknown } | unknown;
    const plugin = (loaded as { default?: unknown })?.default ?? loaded;
    return isPluginModule(plugin) ? plugin : null;
  } catch {
    return null;
  }
}

function registerPluginsFromDirectory(host: PluginHost, pluginDir: string): DriverPlugin["manifest"][] {
  if (!fs.existsSync(pluginDir)) {
    return [];
  }
  const entries = fs
    .readdirSync(pluginDir, { withFileTypes: true })
    .filter((ent) => ent.isFile() && (ent.name.endsWith(".cjs") || ent.name.endsWith(".js")))
    .map((ent) => path.join(pluginDir, ent.name))
    .sort((a, b) => a.localeCompare(b));
  if (entries.length === 0) {
    return [];
  }

  const loaded: DriverPlugin["manifest"][] = [];
  for (const file of entries) {
    const requireFn = createRequire(file);
    const plugin = loadPluginFromModule(requireFn, file);
    if (!plugin) {
      continue;
    }
    host.register(plugin);
    loaded.push(plugin.manifest);
  }
  return loaded;
}

function registerPluginsFromModuleIds(host: PluginHost, moduleIds: string[]): DriverPlugin["manifest"][] {
  const req = createRequire(typeof __filename === "string" ? __filename : process.cwd());
  const loaded: DriverPlugin["manifest"][] = [];
  for (const moduleId of moduleIds) {
    const plugin = loadPluginFromModule(req, moduleId);
    if (!plugin) {
      continue;
    }
    host.register(plugin);
    loaded.push(plugin.manifest);
  }
  return loaded;
}

export interface RegisterRuntimePluginsOptions {
  pluginDir?: string;
  moduleIds?: string[];
}

export function registerRuntimePlugins(host: PluginHost, options?: RegisterRuntimePluginsOptions): DriverPlugin["manifest"][] {
  const manifests: DriverPlugin["manifest"][] = [];
  for (const pluginDir of resolvePluginDirs(options?.pluginDir)) {
    manifests.push(...registerPluginsFromDirectory(host, pluginDir));
  }
  if (manifests.length > 0) {
    return manifests;
  }
  const fallbackModuleIds = options?.moduleIds?.length ? options.moduleIds : DEFAULT_PLUGIN_MODULE_IDS;
  return registerPluginsFromModuleIds(host, fallbackModuleIds);
}
