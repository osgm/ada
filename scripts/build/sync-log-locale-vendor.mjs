/**
 * 将 packages/install-deps/src/log-locale.ts 同步到 launcher / mcp-server 内联脚本（零 npm 依赖）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcPath = path.join(root, "packages", "install-deps", "src", "log-locale.ts");

const targets = [
  {
    file: path.join(root, "apps", "ada-mcp-launcher", "log-locale.mjs"),
    /** launcher 零依赖：无 install-progress，进度由 mcp-server 侧上报 */
    stripInstallProgress: true
  },
  {
    file: path.join(root, "apps", "ada-mcp-server", "scripts", "log-locale.mjs"),
    stripInstallProgress: true
  }
];

const header = `/** Sync with packages/install-deps/src/log-locale.ts — run: node scripts/build/sync-log-locale-vendor.mjs */
`;

function stripInstallProgressForVendor(body) {
  return body
    .replace(/^import \{ tryEmitProgressFromLogLine \} from "\.\/install-progress\.js";\r?\n/m, "")
    .replace(/\s*tryEmitProgressFromLogLine\([^)]*\);\r?\n/g, "\n");
}

async function main() {
  const src = await fs.readFile(srcPath, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: false
    },
    fileName: "log-locale.ts"
  });
  let body = outputText.replace(/\/\/# sourceMappingURL=.*\n?/g, "");
  for (const { file, stripInstallProgress } of targets) {
    const out = stripInstallProgress ? stripInstallProgressForVendor(body) : body;
    await fs.writeFile(file, header + out, "utf8");
  }
  console.log("[sync-log-locale-vendor] updated:", targets.map((t) => path.relative(root, t.file)).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
