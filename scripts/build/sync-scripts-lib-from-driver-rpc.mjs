/**
 * Transpile standalone @ada/driver-rpc helpers into scripts/lib (examples / ada-fluent).
 * Python copies (swipe_coords.py etc.) must be updated manually when presets change.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transpileTsModule } from "./lib/transpile-ts-module.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const modules = [
  {
    src: "packages/driver-rpc/src/swipe-coords.ts",
    dest: "scripts/lib/swipe-coords.mjs",
    note: "滑动坐标解析（与 packages/driver-rpc/src/swipe-coords.ts 同步）"
  },
  {
    src: "packages/driver-rpc/src/swipe-duration.ts",
    dest: "scripts/lib/swipe-duration.mjs",
    note: "与 @ada/driver-rpc swipe-duration 保持同步"
  },
  {
    src: "packages/driver-rpc/src/fill-search-options.ts",
    dest: "scripts/lib/fill-search-options.mjs",
    note: "fillSearch 选项解析 — 与 packages/driver-rpc/src/fill-search-options.ts 同步"
  }
];

async function main() {
  for (const mod of modules) {
    const srcPath = path.join(root, mod.src);
    const destPath = path.join(root, mod.dest);
    const source = await fs.readFile(srcPath, "utf8");
    const body = transpileTsModule(source, path.basename(mod.src));
    const header = `/** ${mod.note} — run: npm run sync:scripts-lib */\n\n`;
    await fs.writeFile(destPath, header + body + "\n", "utf8");
    console.log(`[sync-scripts-lib] ${mod.dest}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
