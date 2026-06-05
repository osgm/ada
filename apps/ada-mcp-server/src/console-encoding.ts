import { execFileSync } from "node:child_process";

export function ensureWinConsoleUtf8(): void {
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
