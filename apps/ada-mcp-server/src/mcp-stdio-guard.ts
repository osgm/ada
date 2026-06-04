/**
 * MCP stdio 传输只允许 stdout 输出 JSON-RPC。
 * hypium-driver / 部分依赖会用 console.log 打 DEBUG，污染严格 Host（如 JoyCode）的 JSON 解析。
 */
let guardInstalled = false;

export function installMcpStdioGuard(): void {
  if (guardInstalled) return;
  guardInstalled = true;

  const toStderr =
    (orig: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      console.error(...args);
    };

  console.log = toStderr(console.log as (...args: unknown[]) => void);
  console.info = toStderr(console.info as (...args: unknown[]) => void);
  console.debug = toStderr(console.debug as (...args: unknown[]) => void);
}
