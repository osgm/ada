import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export type IosAfcContainer = "documents" | "container" | "afc";

export type ParsedIosRemotePath = {
  bundleId?: string;
  container: IosAfcContainer;
  devicePath: string;
};

const CONTAINER_PATH_RE = /^@([^:]+):([^/]+)\/(.+)$/;
const BUNDLE_PATH_RE = /^@([^:]+):(.+)$/s;
const BUNDLE_ONLY_RE = /^@([^:]+)$/;

/** Parse Appium-style `@bundleId:documents/foo.txt` or plain AFC paths. */
export function parseIosRemotePath(
  remotePath: string,
  fallbackBundleId?: string
): { ok: true; parsed: ParsedIosRemotePath } | { ok: false; message: string } {
  const raw = String(remotePath ?? "").trim();
  if (!raw) return { ok: false, message: "remotePath required" };

  const explicitContainer = raw.match(CONTAINER_PATH_RE);
  if (explicitContainer) {
    const kind = explicitContainer[2].trim().toLowerCase();
    const bundleId = explicitContainer[1].trim();
    const rest = explicitContainer[3].trim();
    if (kind === "documents" || kind === "document") {
      return { ok: true, parsed: { bundleId, container: "documents", devicePath: rest } };
    }
    if (kind === "container") {
      return { ok: true, parsed: { bundleId, container: "container", devicePath: rest } };
    }
    return {
      ok: true,
      parsed: { bundleId, container: "documents", devicePath: `${kind}/${rest}` }
    };
  }

  const bundlePath = raw.match(BUNDLE_PATH_RE);
  if (bundlePath) {
    return {
      ok: true,
      parsed: {
        bundleId: bundlePath[1].trim(),
        container: "documents",
        devicePath: bundlePath[2].trim()
      }
    };
  }

  const bundleOnly = raw.match(BUNDLE_ONLY_RE);
  if (bundleOnly) {
    return { ok: false, message: "remotePath must include file path after @bundleId:..." };
  }

  if (raw.startsWith("@")) {
    return { ok: false, message: `invalid iOS remotePath: ${raw}` };
  }

  const bundleId = fallbackBundleId?.trim();
  if (bundleId) {
    const devicePath = raw.replace(/^\/+/, "");
    return { ok: true, parsed: { bundleId, container: "documents", devicePath } };
  }

  return { ok: true, parsed: { container: "afc", devicePath: raw.replace(/^\/+/, "") } };
}

export function resolveIosDeviceUdid(payload: Record<string, unknown>): string {
  const caps = (payload.capabilities ?? {}) as Record<string, unknown>;
  return String(caps.udid ?? payload.udid ?? process.env.ADA_IOS_DEVICE_UDID ?? "").trim();
}

export function buildAfcClientArgs(options: {
  udid?: string;
  parsed: ParsedIosRemotePath;
  verb: "put" | "get";
  localPath: string;
  devicePath?: string;
}): string[] {
  const args: string[] = [];
  const udid = options.udid?.trim();
  if (udid) args.push("-u", udid);

  const devicePath = (options.devicePath ?? options.parsed.devicePath).trim();
  const { parsed } = options;

  if (parsed.container === "documents" && parsed.bundleId) {
    args.push("--documents", parsed.bundleId);
  } else if (parsed.container === "container" && parsed.bundleId) {
    args.push("--container", parsed.bundleId);
  }

  if (options.verb === "put") {
    args.push("put", options.localPath, devicePath);
  } else {
    args.push("get", devicePath, options.localPath);
  }
  return args;
}

export async function runAfcClient(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("afcclient", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => resolve({ ok: code === 0, stdout, stderr }));
    child.on("error", (e) => resolve({ ok: false, stdout: "", stderr: String(e) }));
  });
}

export async function iosAfcPush(options: {
  localPath: string;
  remotePath: string;
  udid?: string;
  fallbackBundleId?: string;
}): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, code: "IOS_AFC_HOST_UNSUPPORTED", message: "afcclient requires macOS host" };
  }

  const localPath = path.resolve(options.localPath);
  try {
    await fs.access(localPath);
  } catch {
    return { ok: false, code: "IOS_PUSH_LOCAL_MISSING", message: `local file not found: ${localPath}` };
  }

  const parsedRemote = parseIosRemotePath(options.remotePath, options.fallbackBundleId);
  if (!parsedRemote.ok) {
    return { ok: false, code: "IOS_PUSH_REMOTE_INVALID", message: parsedRemote.message };
  }

  const args = buildAfcClientArgs({
    udid: options.udid,
    parsed: parsedRemote.parsed,
    verb: "put",
    localPath
  });
  const res = await runAfcClient(args);
  if (!res.ok) {
    const hint = res.stderr.includes("ENOENT") || res.stderr.includes("not found")
      ? " (install: brew install libimobiledevice)"
      : "";
    return {
      ok: false,
      code: res.stderr.includes("ENOENT") && res.stderr.includes("afcclient")
        ? "IOS_AFCCLIENT_MISSING"
        : "IOS_PUSH_FAILED",
      message: (res.stderr || res.stdout || "afcclient put failed").trim() + hint
    };
  }
  return { ok: true };
}

export async function iosAfcPull(options: {
  remotePath: string;
  localPath: string;
  udid?: string;
  fallbackBundleId?: string;
}): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, code: "IOS_AFC_HOST_UNSUPPORTED", message: "afcclient requires macOS host" };
  }

  const localPath = path.resolve(options.localPath);
  await fs.mkdir(path.dirname(localPath), { recursive: true });

  const parsedRemote = parseIosRemotePath(options.remotePath, options.fallbackBundleId);
  if (!parsedRemote.ok) {
    return { ok: false, code: "IOS_PULL_REMOTE_INVALID", message: parsedRemote.message };
  }

  const args = buildAfcClientArgs({
    udid: options.udid,
    parsed: parsedRemote.parsed,
    verb: "get",
    localPath
  });
  const res = await runAfcClient(args);
  if (!res.ok) {
    return {
      ok: false,
      code: res.stderr.includes("ENOENT") && res.stderr.includes("afcclient")
        ? "IOS_AFCCLIENT_MISSING"
        : "IOS_PULL_FAILED",
      message: (res.stderr || res.stdout || "afcclient get failed").trim()
    };
  }
  return { ok: true };
}
