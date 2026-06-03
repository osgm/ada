type InstallScopeForDrivers =
  | "all"
  | "playwright"
  | "mobile"
  | "android"
  | "ios"
  | "harmony"
  | "drivers";

/** 结构化摘要中的「驱动组件」标识（供 GUI / Web / MCP 展示，非 npm 包名） */
export type DriverArtifactId =
  | "playwright-browsers"
  | "harmony-hdc"
  | "android-adb"
  | "android-uia2"
  | "ios-xcrun"
  | "ios-wda";

export type DriverInstallStatus = "installed" | "skipped" | "missing";

export interface DriverInstallOutcome {
  id: DriverArtifactId;
  status: DriverInstallStatus;
  detail?: string;
}

const DRIVER_LABELS: Record<DriverArtifactId, string> = {
  "playwright-browsers": "Playwright 浏览器",
  "harmony-hdc": "Harmony hdc 工具",
  "android-adb": "Android adb 运行时",
  "android-uia2": "Android UiAutomator2 Server",
  "ios-xcrun": "iOS 工具链 (xcrun)",
  "ios-wda": "iOS WebDriverAgent"
};

export function driverArtifactLabel(id: DriverArtifactId): string {
  return DRIVER_LABELS[id];
}

export function resolveRequestedDriverArtifacts(only: InstallScopeForDrivers): DriverArtifactId[] {
  switch (only) {
    case "playwright":
      return ["playwright-browsers"];
    case "harmony":
      return ["harmony-hdc"];
    case "android":
      return ["android-adb", "android-uia2"];
    case "ios":
      return ["ios-xcrun", "ios-wda"];
    case "mobile":
    case "drivers":
      return ["harmony-hdc", "android-adb", "android-uia2", "ios-xcrun", "ios-wda"];
    case "all":
    default:
      return ["playwright-browsers", "harmony-hdc", "android-adb", "android-uia2", "ios-xcrun", "ios-wda"];
  }
}

export class InstallDriverTracker {
  private readonly requestedSet = new Set<DriverArtifactId>();
  private readonly outcomes = new Map<DriverArtifactId, DriverInstallOutcome>();

  constructor(only: InstallScopeForDrivers) {
    for (const id of resolveRequestedDriverArtifacts(only)) {
      this.requestedSet.add(id);
    }
  }

  record(outcome: DriverInstallOutcome): void {
    if (!this.requestedSet.has(outcome.id)) {
      return;
    }
    this.outcomes.set(outcome.id, outcome);
  }

  build(): {
    requestedDrivers: string[];
    installedDrivers: string[];
    skippedDrivers: string[];
    failedDrivers: string[];
    summaryLines: string[];
  } {
    const requestedDrivers = Array.from(this.requestedSet);
    const installedDrivers: string[] = [];
    const skippedDrivers: string[] = [];
    const failedDrivers: string[] = [];
    const summaryLines: string[] = [];

    for (const id of requestedDrivers) {
      const outcome = this.outcomes.get(id);
      const label = driverArtifactLabel(id);
      if (!outcome) {
        failedDrivers.push(id);
        summaryLines.push(`未检查: ${label}`);
        continue;
      }
      const detail = outcome.detail?.trim();
      const suffix = detail ? `（${detail}）` : "";
      if (outcome.status === "installed") {
        installedDrivers.push(id);
        summaryLines.push(`已安装: ${label}${suffix}`);
      } else if (outcome.status === "skipped") {
        skippedDrivers.push(id);
        summaryLines.push(`已就绪: ${label}${suffix}`);
      } else {
        failedDrivers.push(id);
        summaryLines.push(`未就绪: ${label}${suffix}`);
      }
    }

    return { requestedDrivers, installedDrivers, skippedDrivers, failedDrivers, summaryLines };
  }
}

export function mergeInstallSummaries(
  summaries: Array<{
    requestedDrivers?: string[];
    installedDrivers?: string[];
    skippedDrivers?: string[];
    failedDrivers?: string[];
    summaryLines?: string[];
  }>
): {
  requestedDrivers: string[];
  installedDrivers: string[];
  skippedDrivers: string[];
  failedDrivers: string[];
  summaryLines: string[];
} {
  const requested = new Set<string>();
  const installed = new Set<string>();
  const skipped = new Set<string>();
  const failed = new Set<string>();
  const lines: string[] = [];

  for (const s of summaries) {
    for (const id of s.requestedDrivers ?? []) requested.add(id);
    for (const id of s.installedDrivers ?? []) {
      installed.add(id);
      failed.delete(id);
      skipped.delete(id);
    }
    for (const id of s.skippedDrivers ?? []) {
      if (!installed.has(id)) skipped.add(id);
      failed.delete(id);
    }
    for (const id of s.failedDrivers ?? []) {
      if (!installed.has(id) && !skipped.has(id)) failed.add(id);
    }
    for (const line of s.summaryLines ?? []) {
      if (line.trim()) lines.push(line.trim());
    }
  }

  return {
    requestedDrivers: Array.from(requested),
    installedDrivers: Array.from(installed),
    skippedDrivers: Array.from(skipped),
    failedDrivers: Array.from(failed),
    summaryLines: lines
  };
}

export type InstallSummaryLike = {
  scope?: string;
  elapsedMs?: number;
  installedPackages?: string[];
  skippedPackages?: string[];
  requestedDrivers?: string[];
  installedDrivers?: string[];
  skippedDrivers?: string[];
  failedDrivers?: string[];
  summaryLines?: string[];
};

/** 将 InstallSummary 格式化为控制台 / Web 可读文本 */
export function formatInstallSummaryText(summary: InstallSummaryLike): string[] {
  const lines: string[] = [];
  if (summary.scope) {
    lines.push(`范围: ${summary.scope}`);
  }
  if (typeof summary.elapsedMs === "number") {
    lines.push(`耗时: ${summary.elapsedMs}ms`);
  }
  const pkgsInstalled = summary.installedPackages ?? [];
  const pkgsSkipped = summary.skippedPackages ?? [];
  if (pkgsInstalled.length > 0 || pkgsSkipped.length > 0) {
    lines.push(
      `npm 包: 新装 [${pkgsInstalled.join(", ") || "—"}] · 已就绪 [${pkgsSkipped.join(", ") || "—"}]`
    );
  }
  for (const line of summary.summaryLines ?? []) {
    if (line.trim()) {
      lines.push(line.trim());
    }
  }
  const failed = summary.failedDrivers ?? [];
  if (failed.length > 0 && !(summary.summaryLines?.length ?? 0)) {
    lines.push(`未就绪组件: ${failed.join(", ")}`);
  }
  return lines;
}

/** 解析 install-deps API / stdout 中的 JSON，提取可读摘要行 */
export function formatInstallDepsResponse(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const root = payload as Record<string, unknown>;
  if (root.merged && typeof root.merged === "object") {
    return formatInstallSummaryText(root.merged as InstallSummaryLike);
  }
  const parts = Array.isArray(root.installDeps)
    ? (root.installDeps as Array<{ summary?: InstallSummaryLike }>)
    : [{ summary: root.installDeps as InstallSummaryLike | undefined }];
  const summaries = parts.map((p) => p.summary).filter((s): s is InstallSummaryLike => Boolean(s));
  if (summaries.length === 0) {
    return [];
  }
  if (summaries.length === 1) {
    return formatInstallSummaryText(summaries[0]!);
  }
  const merged = mergeInstallSummaries(summaries);
  return [`合并 ${summaries.length} 步安装结果`, ...formatInstallSummaryText(merged)];
}
