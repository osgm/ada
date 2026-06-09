import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const yamlPath = path.join(root, "config", "default.yaml");
const outAgentCore = path.join(root, "packages", "agent-core", "src", "bundled-config.generated.ts");
const outMcp = path.join(root, "apps", "ada-mcp-server", "src", "bundled-config.generated.ts");

const banner = `/** 由 scripts/build/generate-bundled-config.mjs 根据 config/default.yaml 生成，请勿手改。 */\n`;

async function main() {
  const raw = await fs.readFile(yamlPath, "utf8");
  const body = `${banner}export const bundledDefaultConfigYaml = ${JSON.stringify(raw)};\n`;
  await fs.writeFile(outAgentCore, body, "utf8");
  await fs.writeFile(outMcp, body, "utf8");
  console.log("[generate-bundled-config] wrote", outAgentCore, "and", outMcp);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
