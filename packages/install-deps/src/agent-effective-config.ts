import fs from "node:fs/promises";
import { ensureGlobalAdaHome, legacyAdaAgentDataCandidates, resolveAgentEffectiveConfigPathSync } from "./deps-install-paths.js";

/**
 * Read effective agent config YAML, migrating legacy `.ada-agent/*` paths into ~/.ada when found.
 */
export async function readEffectiveAgentConfigYaml(
  fileName = "agent.config.yaml"
): Promise<string | null> {
  const primary = resolveAgentEffectiveConfigPathSync();
  try {
    return await fs.readFile(primary, "utf8");
  } catch {
    for (const legacy of await legacyAdaAgentDataCandidates(fileName)) {
      try {
        const content = await fs.readFile(legacy, "utf8");
        await ensureGlobalAdaHome();
        await fs.writeFile(primary, content, "utf8");
        return content;
      } catch {
        // try next legacy path
      }
    }
    return null;
  }
}
