/**
 * MCP 结构化安装进度事件（ada.install.progress）。
 * Host / Agent 可解析 MCP logging 或 stderr 行 `[ADA-MCP][progress] {...}`。
 */

export type InstallProgressStatus = "running" | "ok" | "warn" | "error" | "skipped";

export type InstallProgressPhase =
  | "scheduled"
  | "planning"
  | "tools"
  | "probe-registry"
  | "probe-playwright-cdn"
  | "npm-package"
  | "playwright-browsers"
  | "harmony-tools"
  | "mobile-probe"
  | "scope"
  | "done"
  | "skipped"
  | "error";

export type AdaInstallProgressEvent = {
  kind: "ada.install.progress";
  at: string;
  status: InstallProgressStatus;
  phase: InstallProgressPhase;
  /** install scope: playwright | mobile | all | … */
  scope?: string;
  /** 子步骤标识，如 playwright | chromium */
  step?: string;
  message: string;
  /** 粗粒度 0–100，仅供 UI 参考 */
  percent?: number;
  detail?: string;
};

export type InstallProgressSink = (event: AdaInstallProgressEvent) => void;

let progressSink: InstallProgressSink | null = null;
let latestProgress: AdaInstallProgressEvent | null = null;

function structuredProgressEnabled(): boolean {
  const v = String(process.env.ADA_MCP_STRUCTURED_PROGRESS ?? "").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

export function registerInstallProgressSink(sink: InstallProgressSink | null): void {
  progressSink = sink;
}

export function getLatestInstallProgress(): AdaInstallProgressEvent | null {
  return latestProgress ? { ...latestProgress } : null;
}

export function emitInstallProgress(
  event: Omit<AdaInstallProgressEvent, "kind" | "at"> & { kind?: "ada.install.progress" }
): void {
  if (!structuredProgressEnabled()) {
    return;
  }
  const full: AdaInstallProgressEvent = {
    kind: "ada.install.progress",
    at: new Date().toISOString(),
    ...event
  };
  latestProgress = full;
  progressSink?.(full);
}

/** 将 bootstrap phase 同步为进度事件 */
export function emitBootstrapPhaseProgress(
  phase: string,
  scopes: string[],
  status: InstallProgressStatus = "running",
  message?: string
): void {
  const scopeLabel = scopes.length > 0 ? scopes.join(",") : undefined;
  let mapped: InstallProgressPhase = "scope";
  let percent: number | undefined = 50;
  if (phase === "scheduled") {
    mapped = "scheduled";
    percent = 2;
  } else if (phase === "planning") {
    mapped = "planning";
    percent = 5;
  } else if (phase === "start") {
    mapped = "scope";
    percent = 10;
  } else if (phase.startsWith("install:")) {
    mapped = "scope";
    percent = 40;
  } else if (phase === "done") {
    mapped = "done";
    percent = 100;
    status = "ok";
  } else if (phase === "skipped") {
    mapped = "skipped";
    percent = 100;
    status = "skipped";
  } else if (phase === "error") {
    mapped = "error";
    status = "error";
  }
  emitInstallProgress({
    status,
    phase: mapped,
    scope: phase.startsWith("install:") ? phase.slice("install:".length) : scopeLabel,
    step: phase,
    message: message ?? `bootstrap ${phase}`,
    percent,
    detail: scopeLabel
  });
}

/** 从 [deps]/[playwright]/[harmony] 日志行推断进度（透传日志补全） */
export function tryEmitProgressFromLogLine(line: string, scopeHint?: string): void {
  if (!structuredProgressEnabled()) {
    return;
  }
  const text = line.trim();
  if (!text) {
    return;
  }

  const scope = scopeHint?.trim() || undefined;

  if (/\[probe\]/i.test(text)) {
    emitInstallProgress({
      status: "running",
      phase: /playwright|CDN/i.test(text) ? "probe-playwright-cdn" : "probe-registry",
      scope,
      message: text.replace(/^\[[^\]]+\]\s*/i, "").slice(0, 200),
      percent: 18
    });
    return;
  }

  if (/\[deps\].*registry/i.test(text) || /reuse launcher\/state registry/i.test(text)) {
    emitInstallProgress({
      status: "running",
      phase: "probe-registry",
      scope,
      message: text.slice(0, 200),
      percent: 22
    });
    return;
  }

  if (/\[deps\].*run npm|\[deps\].*run pnpm|\[deps\]\s*run /i.test(text)) {
    const pkg = /playwright|hypium/i.exec(text)?.[0];
    emitInstallProgress({
      status: "running",
      phase: "npm-package",
      scope,
      step: pkg,
      message: text.slice(0, 200),
      percent: 35
    });
    return;
  }

  if (/\[playwright\].*CDN|Playwright CDN/i.test(text)) {
    emitInstallProgress({
      status: "running",
      phase: "probe-playwright-cdn",
      scope,
      message: text.slice(0, 200),
      percent: 42
    });
    return;
  }

  if (/\[playwright\].*run |playwright install/i.test(text)) {
    emitInstallProgress({
      status: "running",
      phase: "playwright-browsers",
      scope: scope ?? "playwright",
      message: text.slice(0, 200),
      percent: 55
    });
    return;
  }

  if (/\[harmony\]/i.test(text)) {
    emitInstallProgress({
      status: /\[warn\]/i.test(text) ? "warn" : "running",
      phase: "harmony-tools",
      scope: scope ?? "harmony",
      message: text.slice(0, 200),
      percent: 60
    });
    return;
  }

  if (/\[mobile\]/i.test(text)) {
    emitInstallProgress({
      status: /\[warn\]/i.test(text) ? "warn" : "running",
      phase: "mobile-probe",
      scope: scope ?? "mobile",
      message: text.slice(0, 200),
      percent: 70
    });
  }
}
