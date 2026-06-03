import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/** 目录内是否有可加载的插件 bundle（.cjs / .js） */
export function pluginDirectoryHasModules(pluginDir: string): boolean {
  if (!existsSync(pluginDir)) {
    return false;
  }
  return readdirSync(pluginDir, { withFileTypes: true }).some(
    (ent) => ent.isFile() && (ent.name.endsWith(".cjs") || ent.name.endsWith(".js"))
  );
}

/** 解析 @ada-mcp/mcp-server 包内 plugins/（dlx / 本仓库 dev / 打包 cli.cjs） */
export function resolvePackagePluginDir(): string | undefined {
  const candidates: string[] = [];
  const push = (dir?: string) => {
    const trimmed = dir?.trim();
    if (!trimmed) {
      return;
    }
    candidates.push(path.resolve(trimmed));
  };

  push(process.env.ADA_PLUGIN_DIR);

  const entryFromEnv = process.env.ADA_MCP_SERVER_ENTRY?.trim();
  if (entryFromEnv) {
    const entryDir = path.dirname(path.resolve(entryFromEnv));
    push(path.join(entryDir, "plugins"));
    push(path.join(entryDir, "..", "plugins"));
  }

  const argv1 = process.argv[1]?.trim();
  if (argv1) {
    const entryDir = path.dirname(path.resolve(argv1));
    push(path.join(entryDir, "plugins"));
    push(path.join(entryDir, "..", "plugins"));
  }

  if (typeof __filename === "string") {
    const fromFile = path.dirname(__filename);
    push(path.join(fromFile, "plugins"));
    push(path.join(fromFile, "..", "plugins"));
  }

  try {
    const req = createRequire(typeof __filename === "string" ? __filename : process.cwd());
    for (const specifier of ["@ada-mcp/mcp-server/package.json", "@ada-mcp/mcp-server"]) {
      try {
        const resolved = req.resolve(specifier);
        const root = specifier.endsWith("package.json")
          ? path.dirname(resolved)
          : path.join(path.dirname(resolved), "..");
        push(path.join(root, "plugins"));
      } catch {
        // not installed as package name
      }
    }
  } catch {
    // ignore
  }

  const seen = new Set<string>();
  for (const dir of candidates) {
    if (seen.has(dir) || !pluginDirectoryHasModules(dir)) {
      continue;
    }
    seen.add(dir);
    return dir;
  }
  return undefined;
}
