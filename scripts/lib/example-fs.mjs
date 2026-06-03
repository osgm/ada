/**
 * 示例脚本：目录与文件读写
 */
import fs from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./repo-root.mjs";

/** 递归创建目录（已存在不报错）；相对路径基于仓库根 */
export async function dir(target) {
  const abs = path.isAbsolute(target) ? target : path.join(repoRoot, target);
  await fs.mkdir(abs, { recursive: true });
}

export async function readText(filePath, encoding = "utf8") {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  return fs.readFile(abs, encoding);
}

export async function writeText(filePath, text, encoding = "utf8") {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  await dir(path.dirname(abs));
  await fs.writeFile(abs, text, encoding);
}

export async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

export async function writeJson(filePath, data, space = 2) {
  await writeText(filePath, `${JSON.stringify(data, null, space)}\n`);
}
