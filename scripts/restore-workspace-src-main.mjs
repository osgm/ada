/** Restore workspace packages to src entry (local dev); npm publish uses bundled @ada-mcp/mcp-server only. */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const TARGETS = [
  "packages/contracts",
  "packages/plugin-sdk",
  "packages/driver-rpc",
  "packages/native-drivers",
  "packages/plugin-host",
  "packages/core-runtime",
  "packages/core-kernel",
  "packages/agent-core",
  "packages/transport-stream",
  "packages/transport-http",
  "plugins/driver-playwright",
  "plugins/driver-appium",
  "plugins/driver-selenium"
];

for (const rel of TARGETS) {
  const pkgPath = path.join(root, rel, "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
  delete pkg.publishConfig;
  delete pkg.files;
  delete pkg.scripts?.prepublishOnly;
  pkg.main = "src/index.ts";
  pkg.types = "src/index.ts";
  await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  console.log(`[restore] ${rel}`);
}
