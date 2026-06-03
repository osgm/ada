import { spawn } from "node:child_process";

/** OpenHarmony 粘贴组合键（arkxtest：2072 + 2038） */
export const HARMONY_PASTE_KEY_EVENT = "uitest uiInput keyEvent 2072 2038";

type ShellFn = (cmd: string, timeout?: number) => Promise<string>;

/** 将文本写入 PC 剪贴板，供设备侧粘贴组合键读取（鸿蒙调试场景下与主机剪贴板同步） */
export async function setHostClipboard(text: string): Promise<void> {
  const value = String(text ?? "");
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "powershell",
        ["-NoProfile", "-Command", "[Console]::In.ReadToEnd() | Set-Clipboard"],
        { stdio: ["pipe", "ignore", "pipe"] }
      );
      let err = "";
      child.stderr?.on("data", (chunk) => {
        err += chunk.toString("utf8");
      });
      child.stdin?.write(value, "utf8");
      child.stdin?.end();
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(err.trim() || `Set-Clipboard exit ${code}`));
      });
    });
    return;
  }
  if (process.platform === "darwin") {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("pbcopy", [], { stdio: ["pipe", "ignore", "pipe"] });
      let err = "";
      child.stderr?.on("data", (chunk) => {
        err += chunk.toString("utf8");
      });
      child.stdin?.write(value, "utf8");
      child.stdin?.end();
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(err.trim() || `pbcopy exit ${code}`));
      });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn("xclip", ["-selection", "clipboard"], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    child.stderr?.on("data", (chunk) => {
      err += chunk.toString("utf8");
    });
    child.stdin?.write(value, "utf8");
    child.stdin?.end();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `xclip exit ${code}`));
    });
  });
}

/** 在输入框已聚焦时：主机剪贴板 → 设备粘贴键 */
export async function pasteFromHostClipboard(shell: ShellFn): Promise<void> {
  await shell(HARMONY_PASTE_KEY_EVENT, 8000);
}

/**
 * fill/type 首选：写入主机剪贴板并模拟粘贴。
 * @returns 是否已成功发起粘贴
 */
export async function shellInputTextAt(
  shell: ShellFn,
  x: number,
  y: number,
  text: string
): Promise<boolean> {
  const q = (s: string) => (/[\s"'\\]/.test(s) ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s);
  try {
    await shell(`uitest uiInput inputText ${x} ${y} ${q(text)}`, 8000);
    return true;
  } catch {
    return false;
  }
}

export async function pasteTextViaHostClipboard(shell: ShellFn, text: string): Promise<boolean> {
  try {
    await setHostClipboard(text);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await pasteFromHostClipboard(shell);
    return true;
  } catch {
    return false;
  }
}
