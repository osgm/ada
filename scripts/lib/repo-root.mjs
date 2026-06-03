import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function moduleDirname() {
  if (typeof __filename !== "undefined") {
    return path.dirname(__filename);
  }
  return path.dirname(fileURLToPath(import.meta.url));
}

/** 向上查找含 config/default.yaml 的目录（兼容 CJS 打包后 __filename 不在 scripts/lib） */
function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 16; i += 1) {
    if (fs.existsSync(path.join(dir, "config", "default.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

const fromEnv = process.env.ADA_REPO_ROOT?.trim();
export const repoRoot = fromEnv ? path.resolve(fromEnv) : findRepoRoot(moduleDirname());
