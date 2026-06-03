/**
 * 加载 ada-mcp-server executor：支持多种运行方式。
 *
 * 1. scripts/lib/ada-executor.cjs — `npm run build:executor-dev` 后，纯 node 可用
 * 2. apps/ada-mcp-server/dist/executor.js — workspace tsc 构建后
 * 3. src/executor.ts — `tsx script.mjs` 或 `node --import tsx script.mjs`
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

function moduleDirname() {
  if (typeof __filename !== "undefined") {
    return path.dirname(__filename);
  }
  return path.dirname(fileURLToPath(import.meta.url));
}

const here = moduleDirname();

/** @returns {boolean} 是否已通过 tsx 预加载（CLI 或 --import tsx） */
export function isTsxLoaderActive() {
  for (let i = 0; i < process.execArgv.length; i += 1) {
    if (process.execArgv[i] === "--import" && String(process.execArgv[i + 1] ?? "").includes("tsx")) {
      return true;
    }
  }
  const bin = path.basename(process.argv[1] ?? "").replace(/\.cmd$/i, "");
  return bin === "tsx";
}

function executorLoadHint(root) {
  return [
    "无法加载 ADA executor（需要 TypeScript 执行环境）。任选其一：",
    "  • npx tsx <脚本>",
    "  • node --import tsx <脚本>",
    "  • npm run <test:jd-*>（示例脚本已封装 --import tsx）",
    `  • npm run build:executor-dev  → 生成 ${path.join(root, "scripts/lib/ada-executor.cjs")}`,
    `  • npm run build -w @ada-mcp/mcp-server  → ${path.join(root, "apps/ada-mcp-server/dist/executor.js")}`
  ].join("\n");
}

/**
 * @param {string} [root] 仓库根目录
 */
export async function loadExecutor(root = path.resolve(here, "..", "..")) {
  if (isTsxLoaderActive()) {
    const tsPath = path.join(root, "apps/ada-mcp-server/src/executor.ts");
    return import(pathToFileURL(tsPath).href);
  }

  const bundled = path.join(root, "scripts/lib/ada-executor.cjs");
  if (fs.existsSync(bundled)) {
    return import(pathToFileURL(bundled).href);
  }

  const distJs = path.join(root, "apps/ada-mcp-server/dist/executor.js");
  if (fs.existsSync(distJs)) {
    return import(pathToFileURL(distJs).href);
  }

  throw new Error(executorLoadHint(root));
}
