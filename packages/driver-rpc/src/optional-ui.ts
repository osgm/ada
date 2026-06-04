import type { CommandEnvelope, CommandResult } from "@ada/contracts";

/** 可选 UI 操作未命中（关弹窗探测等），非系统故障 */
export const UI_ELEMENT_NOT_FOUND = "UI_ELEMENT_NOT_FOUND";

const HYPIUM_OPTIONAL_PROBE_NOISE =
  /RpcClient|Fail to resolve object|RPC exception|\[Device\]|\[Analysis\]|\[RemoteObject\]/i;

function isHypiumProbeNoise(text: string): boolean {
  return HYPIUM_OPTIONAL_PROBE_NOISE.test(text);
}

/** hypium-driver 在 findComponent 未命中时会 console.error + trace，关弹窗探测时静默 */
export function suppressHypiumOptionalProbeLogs(): () => void {
  const origError = console.error;
  const origLog = console.log;
  const origTrace = console.trace;
  const filter =
    (orig: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      const text = args.map(String).join(" ");
      if (isHypiumProbeNoise(text)) return;
      orig.apply(console, args as Parameters<typeof console.error>);
    };
  console.error = filter(origError);
  console.log = filter(origLog);
  console.trace = () => {};
  return () => {
    console.error = origError;
    console.log = origLog;
    console.trace = origTrace;
  };
}

export async function withSuppressedHypiumProbeLogs<T>(fn: () => Promise<T>): Promise<T> {
  const restore = suppressHypiumOptionalProbeLogs();
  try {
    return await fn();
  } finally {
    restore();
  }
}

export function isOptionalUiPayload(payload?: Record<string, unknown>): boolean {
  const p = payload ?? {};
  return p.optional === true || p.bestEffort === true;
}

export function buildOptionalUiMissResult(
  command: CommandEnvelope,
  message: string,
  extra?: Record<string, unknown>
): CommandResult {
  return {
    requestId: command.requestId,
    success: false,
    errorCode: UI_ELEMENT_NOT_FOUND,
    errorMessage: message,
    data: {
      businessCode: "LOCATOR_NOT_FOUND",
      optional: true,
      command: command.command,
      ...extra
    }
  };
}
