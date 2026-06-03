#!/usr/bin/env node
/**
 * 可选：从仓库根目录运行 Python 示例（与直接 `python scripts/examples/python/...` 等价）。
 * 示例脚本内 ada_client.init(__file__) 已处理 sys.path / cwd / tools PATH。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = process.argv[2];

if (!script) {
  console.error("用法: node scripts/lib/run-python-example.mjs <python脚本路径>");
  console.error("推荐: python scripts/examples/python/web/jd_e2e.py（仓库根目录）");
  process.exit(1);
}

const absScript = path.isAbsolute(script) ? script : path.join(root, script);
const py = process.env.PYTHON ?? "python";

const r = spawnSync(py, [absScript], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1"
  }
});

process.exit(r.status ?? 1);
