/** Windows Host（Cursor/JoyCode）常按 GBK 解析 UTF-8 stderr；默认英文，ADA_MCP_LOG_LOCALE=zh 保留中文 */

import { tryEmitProgressFromLogLine } from "./install-progress.js";

export type AdaLogLocale = "zh" | "en" | "auto";

export function resolveAdaLogLocale(): AdaLogLocale {
  const raw = String(process.env.ADA_MCP_LOG_LOCALE ?? "").trim().toLowerCase();
  if (raw === "en") {
    return "en";
  }
  if (raw === "zh") {
    return "zh";
  }
  return "auto";
}

export function useEnglishAdaLogs(): boolean {
  const locale = resolveAdaLogLocale();
  if (locale === "en") {
    return true;
  }
  if (locale === "zh") {
    return false;
  }
  return process.platform === "win32";
}

/** 双语日志：Windows/auto 默认 en */
export function depsLogLine(zh: string, en: string): string {
  return useEnglishAdaLogs() ? en : zh;
}

/** 包装 onLogLine，保证 install-deps 全链路经本地化 */
export function wrapInstallDepsLogEmitter(
  onLogLine?: (line: string) => void,
  scopeHint?: string
): ((line: string) => void) | undefined {
  if (!onLogLine) {
    return undefined;
  }
  return (line: string) => {
    const localized = localizeAdaLogLine(line);
    tryEmitProgressFromLogLine(localized, scopeHint);
    onLogLine(localized);
  };
}

/** 将中文日志行转为英文（未走 depsLogLine 的透传行、历史模块） */
const LINE_LOCALIZATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\[ADA-MCP\]\[warn\]\s*(\w+)\s*依赖安装未完成:/g, "[ADA-MCP][warn] $1 deps install incomplete:"],
  [/\[ADA-MCP\]\[warn\]\s*MCP 仍将启动/g, "[ADA-MCP][warn] MCP will still start"],
  [/\[selenium\]\s*原生驱动目录:\s*/g, "[selenium] native drivers dir: "],
  [/\[selenium\]\s*目录内已有\s*chromedriver\s*版本:\s*/gi, "[selenium] chromedriver versions in dir: "],
  [/\[selenium\]\s*复用已有\s*geckodriver:\s*/gi, "[selenium] reuse geckodriver: "],
  [/\[selenium\]\s*复用已有\s*chromedriver:\s*/gi, "[selenium] reuse chromedriver: "],
  [/\(主版本\s*/g, "(major "],
  [/\[deps\]\s*系统全局 npm:\s*/g, "[deps] system global npm: "],
  [/\[deps\]\s*复用已有 Playwright 浏览器目录:\s*/g, "[deps] reuse existing Playwright browsers: "],
  [/\[deps\]\s*复用缓存镜像:\s*/g, "[deps] reuse cached mirrors: "],
  [/\[deps\]\s*复用 launcher\/state registry:\s*/g, "[deps] reuse launcher/state registry: "],
  [/\[deps\]\s*standalone MCP seed:\s*/g, "[deps] standalone MCP seed: "],
  [/\[deps\]\s*Playwright CDN（launcher 默认，跳过测速）:\s*/g, "[deps] Playwright CDN (launcher default, skip probe): "],
  [/\[ADA-MCP\]\s*bootstrap phase:\s*install\s+/g, "[ADA-MCP] bootstrap phase: install "],
  [/\[deps\]\s*包解析优先级:\s*/g, "[deps] package resolution order: "],
  [/\[deps\]\s*共享安装目录（按需）:\s*/g, "[deps] shared install dir (on demand): "],
  [/\[deps\]\s*npm registry 测速结果:\s*/g, "[deps] npm registry probe: "],
  [/\[deps\]\[warn\]\s*npm registry 测速失败:\s*/g, "[deps][warn] npm registry probe failed: "],
  [/\[deps\]\s*Playwright CDN 测速结果:\s*/g, "[deps] Playwright CDN probe: "],
  [/\[deps\]\[warn\]\s*Playwright CDN 测速失败:\s*/g, "[deps][warn] Playwright CDN probe failed: "],
  [/\[deps\]\s*检测到本机已有 Playwright 浏览器，跳过 playwright install/g, "[deps] local Playwright browsers found, skip playwright install"],
  [/\[deps\]\s*Playwright 浏览器已缓存，跳过 playwright install/g, "[deps] Playwright browsers cached, skip playwright install"],
  [/\[deps\]\s*(\w+) 已就绪，跳过安装/g, "[deps] $1 ready, skip install"],
  [/\[deps\]\s*执行\s+/g, "[deps] run "],
  [/\[deps\]\s*(\S+) 已安装，跳过（force=true 可强制重装）/g, "[deps] scope $1 already installed, skip (force=true to reinstall)"],
  [/\[deps\]\s*iOS 依赖跳过（需 macOS 宿主机）/g, "[deps] iOS deps skipped (requires macOS host)"],
  [/\[harmony\]\s*使用工具目录\s+/g, "[harmony] tools dir "],
  [/\[harmony\]\s*尝试下载 hdc:\s*/g, "[harmony] downloading hdc: "],
  [/\[harmony\]\[warn\]\s*ZIP 下载失败:/g, "[harmony][warn] ZIP download failed:"],
  [/\[harmony\]\s*ZIP 下载完成/g, "[harmony] ZIP download ok"],
  [/\[harmony\]\s*正在解压/g, "[harmony] extracting"],
  [/\[harmony\]\[warn\]\s*ZIP 内未找到/g, "[harmony][warn] ZIP missing"],
  [/\[harmony\]\s*已从 ZIP 解压并安装 hdc 及同目录工具/g, "[harmony] extracted hdc from ZIP"],
  [/\[harmony\]\[warn\]\s*ZIP 解压失败:/g, "[harmony][warn] ZIP extract failed:"],
  [/\[harmony\]\[warn\]\s*下载失败:/g, "[harmony][warn] download failed:"],
  [/\[harmony\]\s*hdc 下载完成:/g, "[harmony] hdc downloaded:"],
  [/\[harmony\]\[warn\]\s*tools 目录\s+/g, "[harmony][warn] tools dir "],
  [/\[harmony\]\[warn\]\s*不可写，改用/g, "[harmony][warn] not writable, using"],
  [/\[harmony\]\s*已从 PATH 复制 hdc 到 tools:/g, "[harmony] copied hdc from PATH to tools:"],
  [/\[harmony\]\[warn\]\s*从 PATH 复制 hdc 失败:/g, "[harmony][warn] copy hdc from PATH failed:"],
  [/\[harmony\]\[warn\]\s*未配置 hdc 下载地址/g, "[harmony][warn] no hdc download URL configured"],
  [/\[harmony\]\[warn\]\s*自动下载 hdc 未成功/g, "[harmony][warn] hdc auto-download failed"],
  [/\[harmony\]\[warn\]\s*无法解析 tools 目录/g, "[harmony][warn] cannot resolve tools dir"],
  [/\[playwright\]\s*执行\s+/g, "[playwright] run "],
  [/\[playwright\]\s*已清除安装锁:/g, "[playwright] cleared install lock:"],
  [/\[playwright\]\[warn\]\s*playwright 包未安装，跳过浏览器下载/g, "[playwright][warn] playwright package missing, skip browser download"],
  [/\[playwright\]\s*使用下载镜像:/g, "[playwright] download host:"],
  [/\[playwright\]\[warn\]\s*安装已超过\s+/g, "[playwright][warn] install exceeded "],
  [/\[playwright\]\[warn\]\s*请检查网络或 PLAYWRIGHT_DOWNLOAD_HOST/g, "[playwright][warn] check network or PLAYWRIGHT_DOWNLOAD_HOST"],
  [/\[probe\]\s*探测下载速度:/g, "[probe] probing download speed:"],
  [/，已加入 PATH/g, ", prepended to PATH"],
  [/（同目录\s+/g, "(same dir "],
  [/（避免在磁盘根/g, "(avoid filesystem root"],
  [/（hdc=/g, "(hdc="],
  [/（force=true 可强制重装）/g, "(force=true to reinstall)"],
  [/（需 macOS 宿主机）/g, "(requires macOS host)"],
  [/（/g, "("],
  [/）/g, ")"]
];

export function localizeAdaLogLine(line: string): string {
  if (!useEnglishAdaLogs()) {
    return line;
  }
  let out = line;
  for (const [pattern, replacement] of LINE_LOCALIZATIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
