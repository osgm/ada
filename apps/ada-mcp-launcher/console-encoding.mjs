/**
 * Windows MCP Host 常按系统代码页解析 stderr；启动时切 UTF-8 减少中文乱码。
 */
import { execFileSync } from "node:child_process";

export function ensureWinConsoleUtf8() {
  if (process.platform !== "win32") {
    return;
  }
  try {
    if (typeof process.stdout?.setDefaultEncoding === "function") {
      try {
        process.stdout.setDefaultEncoding("utf8");
      } catch {
        // ignore
      }
    }
    if (typeof process.stderr?.setDefaultEncoding === "function") {
      try {
        process.stderr.setDefaultEncoding("utf8");
      } catch {
        // ignore
      }
    }
    const comspec = process.env.ComSpec || "cmd.exe";
    execFileSync(comspec, ["/d", "/s", "/c", "chcp 65001 >nul"], {
      stdio: "ignore",
      windowsHide: true
    });
  } catch {
    // ignore
  }
}
